import fs from 'fs';
import path from 'path';
import {
  AudioEngineSettings,
  AutoShutdownConfig,
  BotConfigState,
  ChatMessage,
  CustomPlaylist,
  GroupAnalyticsResponse,
  GroupMember,
  GroupState,
  HourlyAnalyticsBucket,
  MusicMood,
  PlaybackAnalyticsEvent,
  QuickCommandShortcut,
  RubikaApiLog,
  SmartPlaylistAdaptMode,
  SmartPlaylistPreset,
  SmartPlaylistRule,
  SmartPlaylistTimeSlot,
  Track,
  TrackScheduleItem,
  UserRole,
  UserbotBridgeStatus,
  VoiceCallRecording,
  VoiceCallTask,
} from '../src/types/bot.js';
import {musicCatalog} from './musicCatalog.js';
import {buildTrackFromDirectUrl, searchMusicReal} from './musicService.js';
import {smartSearchOnlineSongs} from './trendingService.js';
import {userbotManager} from './userbotManager.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'bot-state.json');

const DEFAULT_TOKEN = 'CJFFDA0HNOILFTCHIHGBTUDMVZVYGBHBMWNYLEXPHMKBNUIJGLZIOCHQFQFNAZZP';
const PREVIOUS_DEFAULT_TOKEN = 'CJFFDA0WCQMQSPUXDCLPUEFXXXEJUPDVGQKGDHKRROFEOMELUTEJNDFUBPUQYSUU';
const DEFAULT_CREATOR_NAME = 'پریا چش رنگی';
const DEFAULT_CREATOR_ID = 'u0_parya_creator';
const DEFAULT_CREATOR_USERNAME = '@Paria25805';
const DEFAULT_GROUP_INVITE_LINK = 'https://rubika.ir/joing/BCABACAHA0KBYOJFGCWRGGAGCVKPBTKR';

function addDaysIso(base: Date, days: number): string {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function createInitialState(): BotConfigState {
  const now = new Date();
  const mainGroupId = 'g_main_rubika';
  const initialMembers: GroupMember[] = [
    {
      userId: DEFAULT_CREATOR_ID,
      name: DEFAULT_CREATOR_NAME,
      username: DEFAULT_CREATOR_USERNAME,
      role: 'creator',
      joinedAt: now.toISOString(),
    },
    {
      userId: 'u_owner_1',
      name: 'امیرحسین (مالک گروه)',
      username: '@amir_owner',
      role: 'owner',
      joinedAt: now.toISOString(),
    },
    {
      userId: 'u_admin_1',
      name: 'سارا (ادمین)',
      username: '@sara_admin',
      role: 'admin',
      joinedAt: now.toISOString(),
    },
    {
      userId: 'u_vip_1',
      name: 'نیما (کاربر ویژه)',
      username: '@nima_vip',
      role: 'vip',
      joinedAt: now.toISOString(),
    },
    {
      userId: 'u_member_1',
      name: 'مهدی (عضو عادی)',
      username: '@mehdi_user',
      role: 'member',
      joinedAt: now.toISOString(),
    },
  ];

  const mainGroup: GroupState = {
    groupId: mainGroupId,
    title: 'گروه موزیکال اصلی روبیکا',
    rubikaChatId: 'g0D8xP912RubikaMain',
    inviteLink: DEFAULT_GROUP_INVITE_LINK,
    ownerId: 'u_owner_1',
    ownerName: 'امیرحسین (مالک گروه)',
    publicAccess: 'open',
    voiceCallActive: false,
    volume: 80,
    isMuted: false,
    isPlaying: false,
    currentTrack: null,
    pausedTrack: null,
    pausedPositionSec: 0,
    queue: [],
    history: [],
    members: initialMembers,
    subscription: {
      planName: 'اشتراک ویژه ویسکال نامحدود',
      purchasedAt: addDaysIso(now, -5),
      expiresAt: addDaysIso(now, 25),
      isActive: true,
    },
    messages: [
      {
        id: 'msg_welcome_1',
        groupId: mainGroupId,
        senderId: 'bot_rubika',
        senderName: 'ربات موزیکال روبیکا',
        senderRole: 'creator',
        text: `🎵 ربات موزیکال پیشرفته روبیکا آماده به کار است.\n👑 سازنده: ${DEFAULT_CREATOR_NAME}\nبرای دریافت لیست کامل دستورات کلمه «راهنما» یا برای پخش موسیقی «آهنگ لری» را ارسال کنید.`,
        isBot: true,
        timestamp: now.toISOString(),
      },
    ],
  };

  return {
    token: DEFAULT_TOKEN,
    creatorId: DEFAULT_CREATOR_ID,
    creatorName: DEFAULT_CREATOR_NAME,
    creatorUsername: DEFAULT_CREATOR_USERNAME,
    botUsername: '@ParyaMusicBot',
    botName: 'ربات موزیکال پریا چش رنگی',
    botEnabled: true,
    globalDailyPlayLimit: 10,
    sudoUserIds: [],
    pollingActive: false,
    lastVerifyResult: {
      verified: false,
    },
    rubikaMode: 'bot_api_v3',
    activeGroupId: mainGroupId,
    groups: {
      [mainGroupId]: mainGroup,
    },
    apiLogs: [
      {
        id: `log_${Date.now()}`,
        timestamp: now.toISOString(),
        method: 'INIT',
        status: 'info',
        detail: `موتور ربات با توکن ${DEFAULT_TOKEN.slice(0, 10)}... و سازنده ${DEFAULT_CREATOR_NAME} آماده شد.`,
      },
    ],
  };
}

export class RubikaBotEngine {
  private state: BotConfigState;
  private pollingTimer: NodeJS.Timeout | null = null;
  private pollingOffset: string | undefined;
  private isPollingBusy = false;
  private shutdownTicker: NodeJS.Timeout | null = null;
  private processedMessageIds = new Set<string>();
  private recentCommandDedup = new Map<string, number>();
  private rubikaMessageCache = new Map<
    string,
    {fileId?: string; fileUrl?: string; fileName?: string; text?: string}
  >();
  private pendingVoiceCallTasks: VoiceCallTask[] = [];
  private taskWaiters = new Map<
    string,
    {resolve: (res: Record<string, unknown>) => void; timer: NodeJS.Timeout}
  >();

  constructor() {
    this.state = this.loadState();
    this.pollingOffset = this.state.rubikaOffsetId;
    if (!this.state.publicBaseUrl) {
      const envUrl = (process.env.APP_URL || '').trim();
      if (envUrl && envUrl !== 'MY_APP_URL') {
        this.state.publicBaseUrl = envUrl.replace(/\/$/, '');
      }
    }
    if (this.state.groups['g_main_rubika'] && !this.state.groups['g_main_rubika'].inviteLink) {
      this.state.groups['g_main_rubika'].inviteLink = DEFAULT_GROUP_INVITE_LINK;
    }
    if (!this.state.creatorUsername || !this.state.creatorUsername.trim()) {
      this.state.creatorUsername = DEFAULT_CREATOR_USERNAME;
    }
    if (typeof this.state.botEnabled !== 'boolean') {
      this.state.botEnabled = true;
    }
    if (typeof this.state.globalDailyPlayLimit !== 'number') {
      this.state.globalDailyPlayLimit = 10;
    }
    if (!Array.isArray(this.state.sudoUserIds)) {
      this.state.sudoUserIds = [];
    }
    if (typeof this.state.autoSyncAudioToRubika !== 'boolean') {
      this.state.autoSyncAudioToRubika = true;
    }
    if (!this.state.rubikaAudioProfile) {
      this.state.rubikaAudioProfile = {
        profile: 'balance',
        streamBitrateKbps: 64,
        channels: 'stereo',
        volumeNormalization: true,
        sampleRate: 44100,
        latencyHint: 'balanced',
        bufferSize: 1024,
        fftSize: 256,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
    }
    if (!Array.isArray(this.state.quickShortcuts)) {
      const nowIso = new Date().toISOString();
      this.state.quickShortcuts = [
        {
          id: 'sc_chill',
          label: 'موزیک ملایم',
          commandText: 'موزیک ملایم',
          accent: 'emerald',
          sendToRubika: true,
          createdAt: nowIso,
        },
        {
          id: 'sc_rest',
          label: 'استراحت',
          commandText: 'استراحت',
          accent: 'amber',
          sendToRubika: true,
          createdAt: nowIso,
        },
        {
          id: 'sc_happy',
          label: 'پخش رندوم شاد',
          commandText: 'پخش رندوم شاد',
          accent: 'emerald',
          sendToRubika: true,
          createdAt: nowIso,
        },
        {
          id: 'sc_call',
          label: 'شروع ویسکال',
          commandText: 'ساخت کال',
          accent: 'slate',
          sendToRubika: true,
          createdAt: nowIso,
        },
      ];
    }
    if (
      !this.state.groups[this.state.activeGroupId] ||
      (!this.state.groups[this.state.activeGroupId].rubikaChatId.startsWith('g0') &&
        !this.state.groups[this.state.activeGroupId].rubikaChatId.startsWith('c0'))
    ) {
      const preferredG0 =
        Object.values(this.state.groups).find(
          (g) =>
            (g.rubikaChatId.startsWith('g0') || g.rubikaChatId.startsWith('c0')) &&
            g.rubikaChatId !== 'g0D8xP912RubikaMain',
        ) || Object.values(this.state.groups)[0];
      if (preferredG0) {
        this.state.activeGroupId = preferredG0.groupId;
      }
    }
    const seededTargets = [
      'https://rubika.ir/joing/JDFJCAGH0HWQXNCTTKOBTPOMBBJAIRJS',
      '@Pari92i29mmm',
    ];
    const existingPending = new Set(this.state.pendingJoinTargets || []);
    for (const t of seededTargets) {
      const alreadyBound = Object.values(this.state.groups).some(
        (g) =>
          g.inviteLink === t ||
          (g.channelUsername && g.channelUsername.toLowerCase() === t.toLowerCase()),
      );
      if (!alreadyBound) {
        existingPending.add(t);
      }
    }
    this.state.pendingJoinTargets = Array.from(existingPending);
    if (this.state.rubikaOffsetId) {
      this.pollingOffset = this.state.rubikaOffsetId;
    }
    this.saveState();
    this.shutdownTicker = setInterval(() => {
      void this.checkAutoShutdowns();
    }, 2500);
    void this.bootstrapLiveRubika();
  }

  private async bootstrapLiveRubika(): Promise<void> {
    try {
      await this.verifyToken();
      await this.syncInitialRubikaUpdates();
      this.startPolling();
    } catch (err) {
      this.addLog(
        'BOOTSTRAP',
        'error',
        err instanceof Error ? err.message : 'خطا در اتصال اولیه به روبیکا',
      );
    }
  }

  private async syncInitialRubikaUpdates(): Promise<void> {
    const discoveredGroupChatIds = new Set<string>();
    let latestOwnerCandidate: string | undefined;
    let currentOffset = this.pollingOffset || this.state.rubikaOffsetId || undefined;

    for (let page = 0; page < 5; page += 1) {
      const payload: Record<string, unknown> = {limit: 100};
      if (currentOffset) {
        payload.offset_id = currentOffset;
      }
      const res = await this.callRubikaApi('getUpdates', payload, true);
      if (!res.ok || !res.data) break;

      const dataObj = (res.data.data as Record<string, unknown>) || res.data;
      const updates = (dataObj.updates as Array<Record<string, unknown>>) || [];

      for (const upd of updates) {
        const chatId = String(upd.chat_id || '');
        const newMsg = upd.new_message as Record<string, unknown> | undefined;
        if (newMsg?.message_id) {
          this.processedMessageIds.add(String(newMsg.message_id));
        }
        if (newMsg?.sender_id && newMsg.sender_type === 'User') {
          latestOwnerCandidate = String(newMsg.sender_id);
        }
        if (chatId.startsWith('g')) {
          discoveredGroupChatIds.add(chatId);
        }
      }

      const nextOffset =
        typeof dataObj.next_offset_id === 'string' && dataObj.next_offset_id
          ? dataObj.next_offset_id
          : undefined;
      if (nextOffset) {
        this.pollingOffset = nextOffset;
        this.state.rubikaOffsetId = nextOffset;
      }
      if (!nextOffset || nextOffset === currentOffset || updates.length < 100) {
        break;
      }
      currentOffset = nextOffset;
    }

    for (const chatId of discoveredGroupChatIds) {
      await this.ensureRubikaGroup(chatId, latestOwnerCandidate);
    }
    this.saveState();
  }

  private async ensureRubikaGroup(chatId: string, ownerCandidateId?: string): Promise<GroupState> {
    const existing = Object.values(this.state.groups).find((g) => g.rubikaChatId === chatId);
    if (existing) {
      if (ownerCandidateId && existing.ownerId === 'u_owner_1') {
        existing.ownerId = ownerCandidateId;
        existing.ownerName = `مالک روبیکا (${ownerCandidateId.slice(0, 8)})`;
        this.saveState();
      }
      return existing;
    }

    let chatTitle = chatId.startsWith('g')
      ? `گروه روبیکا (${chatId.slice(0, 8)})`
      : `چت ربات (${chatId.slice(0, 8)})`;

    const infoRes = await this.callRubikaApi('getChat', {chat_id: chatId}, true);
    if (infoRes.ok && infoRes.data) {
      const dataObj = (infoRes.data.data as Record<string, unknown>) || infoRes.data;
      const chatObj = (dataObj.chat as Record<string, unknown>) || dataObj;
      if (typeof chatObj.title === 'string' && chatObj.title.trim()) {
        chatTitle = chatObj.title.trim();
      }
    }

    // Upgrade initial placeholder group if it still has the demo rubikaChatId and is a real Group
    const placeholder = this.state.groups['g_main_rubika'];
    if (placeholder && placeholder.rubikaChatId === 'g0D8xP912RubikaMain' && chatId.startsWith('g')) {
      placeholder.rubikaChatId = chatId;
      placeholder.title = chatTitle;
      if (ownerCandidateId) {
        placeholder.ownerId = ownerCandidateId;
        placeholder.ownerName = `مالک روبیکا (${ownerCandidateId.slice(0, 8)})`;
        this.addMemberToGroup(
          placeholder.groupId,
          placeholder.ownerName,
          ownerCandidateId,
          'owner',
        );
      }
      this.state.activeGroupId = placeholder.groupId;
      this.addLog('GROUP_SYNC', 'ok', `گروه واقعی روبیکا «${chatTitle}» (${chatId}) متصل شد.`);
      this.saveState();
      return placeholder;
    }

    const created = this.addOrUpdateGroup({
      title: chatTitle,
      rubikaChatId: chatId,
      ownerId: ownerCandidateId || this.state.creatorId,
      ownerName: ownerCandidateId
        ? `مالک روبیکا (${ownerCandidateId.slice(0, 8)})`
        : this.state.creatorName,
    });
    if (ownerCandidateId) {
      this.addMemberToGroup(
        created.groupId,
        `مالک روبیکا (${ownerCandidateId.slice(0, 8)})`,
        ownerCandidateId,
        'owner',
      );
    }
    return created;
  }

  private normalizeDigits(input: string): string {
    return input
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  }

  private computeNextTriggerIso(targetTime: string, timezoneOffsetMinutes: number): string | null {
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(this.normalizeDigits(targetTime.trim()));
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    // Convert current UTC epoch to user's local clock by subtracting timezoneOffsetMinutes (e.g. Iran UTC+3:30 => offset -210)
    const nowUtcMs = Date.now();
    const userOffsetMs = timezoneOffsetMinutes * 60 * 1000;
    const userLocalNow = new Date(nowUtcMs - userOffsetMs);

    const targetLocal = new Date(userLocalNow.getTime());
    targetLocal.setUTCHours(hours, minutes, 0, 0);

    let triggerUtcMs = targetLocal.getTime() + userOffsetMs;
    if (triggerUtcMs <= nowUtcMs + 1000) {
      triggerUtcMs += 24 * 60 * 60 * 1000;
    }
    return new Date(triggerUtcMs).toISOString();
  }

  public setGroupAutoShutdown(
    groupId: string,
    input: {
      enabled: boolean;
      targetTime: string;
      timezoneOffsetMinutes?: number;
      stopPollingAlso?: boolean;
    },
  ): GroupState | null {
    const group = this.state.groups[groupId];
    if (!group) return null;

    const tzOffset =
      typeof input.timezoneOffsetMinutes === 'number' && Number.isFinite(input.timezoneOffsetMinutes)
        ? input.timezoneOffsetMinutes
        : new Date().getTimezoneOffset();
    const normalizedTime = this.normalizeDigits(input.targetTime.trim());
    const nextIso = input.enabled ? this.computeNextTriggerIso(normalizedTime, tzOffset) : null;

    const configObj: AutoShutdownConfig = {
      enabled: Boolean(input.enabled && nextIso),
      targetTime: normalizedTime,
      timezoneOffsetMinutes: tzOffset,
      stopPollingAlso: Boolean(input.stopPollingAlso),
      nextTriggerIso: nextIso,
      lastTriggeredAt: group.autoShutdown?.lastTriggeredAt || null,
    };

    group.autoShutdown = configObj;
    const msgText = configObj.enabled
      ? `⏰ تایمر خاموشی خودکار ویسکال روی ساعت ${configObj.targetTime} تنظیم شد.${configObj.stopPollingAlso ? ' (همراه با توقف کامل ربات)' : ''}`
      : '⏰ تایمر خاموشی خودکار ویسکال لغو شد.';

    const infoMsg: ChatMessage = {
      id: `b_${Date.now()}`,
      groupId: group.groupId,
      senderId: 'bot_rubika',
      senderName: this.state.botName,
      senderRole: 'creator',
      text: msgText,
      isBot: true,
      timestamp: new Date().toISOString(),
    };
    group.messages = [...group.messages, infoMsg].slice(-120);
    this.addLog('AUTO_SHUTDOWN_SET', 'info', `${group.title}: ${msgText}`);
    this.saveState();
    return group;
  }

  private async checkAutoShutdowns(): Promise<void> {
    const nowMs = Date.now();
    let changed = false;

    for (const group of Object.values(this.state.groups)) {
      const cfg = group.autoShutdown;
      if (!cfg || !cfg.enabled || !cfg.nextTriggerIso) continue;

      const triggerMs = new Date(cfg.nextTriggerIso).getTime();
      if (!Number.isFinite(triggerMs) || nowMs < triggerMs) continue;

      // Trigger real shutdown for this group
      if (group.currentTrack) {
        group.pausedTrack = group.currentTrack;
        group.currentTrack = null;
      }
      group.isPlaying = false;
      group.voiceCallActive = false;
      group.voiceCallStartedAt = undefined;
      this.enqueueVoiceCallTask({
        action: 'stop_vc',
        groupId: group.groupId,
        rubikaChatId: group.rubikaChatId,
      });
      cfg.enabled = false;
      cfg.nextTriggerIso = null;
      cfg.lastTriggeredAt = new Date(nowMs).toISOString();

      const shutdownText = `⏰ زمان خودکار (${cfg.targetTime}) فرا رسید: ویسکال قطع و پخش آهنگ متوقف شد.${cfg.stopPollingAlso ? '\n🔴 ربات به صورت کامل خاموش گردید.' : ''}`;

      const botMsg: ChatMessage = {
        id: `b_shutdown_${nowMs}`,
        groupId: group.groupId,
        senderId: 'bot_rubika',
        senderName: this.state.botName,
        senderRole: 'creator',
        text: shutdownText,
        isBot: true,
        timestamp: new Date(nowMs).toISOString(),
      };
      group.messages = [...group.messages, botMsg].slice(-120);
      this.addLog('AUTO_SHUTDOWN_TRIGGER', 'info', `قطع خودکار ویسکال گروه «${group.title}» در ساعت ${cfg.targetTime}`);

      if (this.state.pollingActive && group.rubikaChatId) {
        await this.callRubikaApi('sendMessage', {
          chat_id: group.rubikaChatId,
          text: shutdownText,
        });
      }

      if (cfg.stopPollingAlso && this.state.pollingActive) {
        this.stopPolling();
      }
      changed = true;
    }

    // Also process scheduled queue tracks (startTime & endTime)
    for (const group of Object.values(this.state.groups)) {
      const schedules = group.trackSchedules;
      if (!schedules || schedules.length === 0) continue;

      for (const sched of schedules) {
        if (!sched.enabled) continue;

        const startMs = new Date(sched.startTriggerIso).getTime();
        const endMs = sched.endTriggerIso ? new Date(sched.endTriggerIso).getTime() : null;

        // 1) Check if it's time to START this scheduled track
        if (sched.status === 'pending' && Number.isFinite(startMs) && nowMs >= startMs) {
          // If end time has already passed as well (e.g. server was asleep), mark completed instead of playing
          if (endMs && Number.isFinite(endMs) && nowMs >= endMs) {
            sched.status = 'completed';
            sched.enabled = false;
            sched.lastEndedAt = new Date(nowMs).toISOString();
            changed = true;
            continue;
          }

          if (group.currentTrack && group.currentTrack.id !== sched.track.id) {
            this.pushHistory(group, group.currentTrack);
          }
          // Remove from queue if present so it doesn't replay immediately after
          const qIdx = group.queue.findIndex((t) => t.id === sched.track.id);
          if (qIdx >= 0) {
            group.queue.splice(qIdx, 1);
          }

          group.currentTrack = sched.track;
          group.pausedTrack = null;
          group.isPlaying = true;
          group.voiceCallActive = true;
          group.voiceCallId = group.voiceCallId || `vc_${nowMs}`;
          group.voiceCallStartedAt = group.voiceCallStartedAt || new Date(nowMs).toISOString();
          this.recordTrackPlay(group, sched.track);
          this.enqueueVoiceCallTask({
            action: 'play_in_vc',
            groupId: group.groupId,
            rubikaChatId: group.rubikaChatId,
            trackTitle: sched.track.title,
            trackArtist: sched.track.artist,
            streamUrl: sched.track.streamUrl,
            volume: group.volume,
          });

          sched.status = 'active';
          sched.lastStartedAt = new Date(nowMs).toISOString();

          const startNotice = `🗓 زمان‌بندی پخش اجرا شد (${sched.startTime}${sched.endTime ? ` تا ${sched.endTime}` : ''}):\n🎵 ${sched.track.title} — ${sched.track.artist}`;
          const botMsg: ChatMessage = {
            id: `b_sched_start_${nowMs}_${Math.random().toString(36).slice(2, 5)}`,
            groupId: group.groupId,
            senderId: 'bot_rubika',
            senderName: this.state.botName,
            senderRole: 'creator',
            text: startNotice,
            isBot: true,
            audioAttachment: {
              title: sched.track.title,
              artist: sched.track.artist,
              url: sched.track.streamUrl,
              durationSec: sched.track.durationSec,
            },
            timestamp: new Date(nowMs).toISOString(),
          };
          group.messages = [...group.messages, botMsg].slice(-120);
          this.addLog(
            'TRACK_SCHEDULE_START',
            'info',
            `شروع زمان‌بندی «${sched.track.title}» در ${group.title} (${sched.startTime})`,
          );

          if (this.state.pollingActive && group.rubikaChatId) {
            await this.callRubikaApi('sendMessage', {
              chat_id: group.rubikaChatId,
              text: startNotice,
            });
          }
          changed = true;
        }

        // 2) Check if it's time to END this scheduled track
        if (
          (sched.status === 'active' || sched.status === 'pending') &&
          endMs &&
          Number.isFinite(endMs) &&
          nowMs >= endMs
        ) {
          if (sched.endAction === 'next_in_queue') {
            this.handleTrackEnded(group.groupId);
          } else if (sched.endAction === 'stop_call') {
            if (group.currentTrack) {
              group.pausedTrack = group.currentTrack;
              group.currentTrack = null;
            }
            group.isPlaying = false;
            group.voiceCallActive = false;
          } else {
            if (group.currentTrack) {
              group.pausedTrack = group.currentTrack;
              group.currentTrack = null;
            }
            group.isPlaying = false;
          }

          sched.status = 'completed';
          sched.enabled = false;
          sched.lastEndedAt = new Date(nowMs).toISOString();

          const endActionText =
            sched.endAction === 'next_in_queue'
              ? 'به آهنگ بعدی صف منتقل شد'
              : sched.endAction === 'stop_call'
                ? 'پخش و ویسکال متوقف شد'
                : 'پخش متوقف شد';

          const endNotice = `⏱ زمان پایان برنامه (${sched.endTime}) برای «${sched.track.title}» فرا رسید و ${endActionText}.`;
          const endMsg: ChatMessage = {
            id: `b_sched_end_${nowMs}_${Math.random().toString(36).slice(2, 5)}`,
            groupId: group.groupId,
            senderId: 'bot_rubika',
            senderName: this.state.botName,
            senderRole: 'creator',
            text: endNotice,
            isBot: true,
            timestamp: new Date(nowMs).toISOString(),
          };
          group.messages = [...group.messages, endMsg].slice(-120);
          this.addLog(
            'TRACK_SCHEDULE_END',
            'info',
            `پایان زمان‌بندی «${sched.track.title}» در ${group.title} (${sched.endTime})`,
          );

          if (this.state.pollingActive && group.rubikaChatId) {
            await this.callRubikaApi('sendMessage', {
              chat_id: group.rubikaChatId,
              text: endNotice,
            });
          }
          changed = true;
        }
      }
    }

    // Also evaluate automatic Smart Playlist adaptation rules (time-slot shift or VC popularity growth)
    for (const group of Object.values(this.state.groups)) {
      const rule = group.smartPlaylistRule;
      if (!rule || !rule.enabled || rule.mode === 'manual') continue;

      const tzOffset = rule.timezoneOffsetMinutes ?? group.autoShutdown?.timezoneOffsetMinutes ?? -210;
      const lastAdaptedMs = rule.lastAdaptedAt ? new Date(rule.lastAdaptedAt).getTime() : 0;
      const elapsedMs = nowMs - lastAdaptedMs;

      let shouldAdapt = false;
      let resolvedSlotName: string | undefined;

      if (rule.mode === 'time_slot') {
        const slotInfo = musicCatalog.resolveTimeSlot(rule.timeSlot || 'auto_now', tzOffset);
        resolvedSlotName = slotInfo.slot;
        if (rule.lastSlotApplied !== slotInfo.slot) {
          shouldAdapt = true;
        }
      } else if (rule.mode === 'vc_popularity') {
        const eventCount = group.playbackEvents?.length || 0;
        const prevCount = rule.lastEventCount ?? 0;
        if (eventCount - prevCount >= 2 && elapsedMs >= 20000) {
          shouldAdapt = true;
        }
      }

      if (!shouldAdapt) continue;

      const mix = musicCatalog.buildSmartMix({
        moods: rule.moods,
        totalCount: rule.trackCount || 20,
        balanceMode: rule.balanceMode || 'interleaved',
        requestedBy:
          rule.mode === 'vc_popularity' ? 'تطبیق خودکار محبوبیت ویسکال' : 'تطبیق خودکار بازه زمانی',
        adaptMode: rule.mode,
        timeSlot: rule.timeSlot,
        timezoneOffsetMinutes: tzOffset,
        popularityEvents: group.playbackEvents || [],
        history: group.history || [],
      });

      if (mix.tracks.length > 0) {
        group.queue = mix.tracks;
        rule.moods = mix.effectiveMoods;
        rule.lastAdaptedAt = new Date(nowMs).toISOString();
        rule.lastSlotApplied = mix.resolvedSlot || resolvedSlotName || rule.lastSlotApplied || null;
        rule.lastEventCount = group.playbackEvents?.length || 0;
        rule.lastReason = mix.adaptSummary;

        const noticeText = `🔄 لیست آهنگ‌های صف پلی‌لیست هوشمند به صورت خودکار بروزرسانی شد:\n${mix.adaptSummary}`;
        const adaptMsg: ChatMessage = {
          id: `b_smart_adapt_${nowMs}`,
          groupId: group.groupId,
          senderId: 'bot_rubika',
          senderName: this.state.botName,
          senderRole: 'creator',
          text: noticeText,
          isBot: true,
          timestamp: new Date(nowMs).toISOString(),
        };
        group.messages = [...group.messages, adaptMsg].slice(-120);
        this.addLog('SMART_PLAYLIST_AUTO_ADAPT', 'info', `${group.title}: ${mix.adaptSummary}`);
        changed = true;
      }
    }

    if (changed) {
      this.saveState();
    }
  }

  private loadState(): BotConfigState {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, {recursive: true});
      }
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as BotConfigState;
        if (parsed && parsed.groups && Object.keys(parsed.groups).length > 0) {
          if (parsed.token === PREVIOUS_DEFAULT_TOKEN) {
            parsed.token = DEFAULT_TOKEN;
            parsed.lastVerifyResult = {verified: false};
            parsed.rubikaOffsetId = undefined;
          }
          return parsed;
        }
      }
    } catch {
      // Fallback to fresh state
    }
    return createInitialState();
  }

  private saveState(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, {recursive: true});
      }
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist bot state:', err);
    }
  }

  private addLog(method: string, status: RubikaApiLog['status'], detail: string): void {
    const entry: RubikaApiLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      method,
      status,
      detail,
    };
    this.state.apiLogs = [entry, ...this.state.apiLogs].slice(0, 80);
    this.saveState();
  }

  public getState(): BotConfigState {
    if (this.state.userbotStatus?.connected && this.state.userbotStatus.lastHeartbeatAt) {
      const ageMs = Date.now() - new Date(this.state.userbotStatus.lastHeartbeatAt).getTime();
      if (ageMs > 25000) {
        this.state.userbotStatus = {
          ...this.state.userbotStatus,
          connected: false,
        };
      }
    }
    return this.state;
  }

  private isRealGroupGuid(chatId?: string): boolean {
    return Boolean(
      chatId &&
        (chatId.startsWith('g0') || chatId.startsWith('c0')) &&
        chatId !== 'g0D8xP912RubikaMain',
    );
  }

  public resolveVoiceCallChatGuid(preferredChatId?: string): string {
    const avail = (this.state.userbotStatus?.availableGroups || []).filter((g) =>
      this.isRealGroupGuid(g.chatGuid),
    );
    if (preferredChatId && preferredChatId.startsWith('c0')) {
      return preferredChatId;
    }
    if (avail.length > 0) {
      if (preferredChatId && avail.some((g) => g.chatGuid === preferredChatId)) {
        return preferredChatId;
      }
      const preferredGroup = Object.values(this.state.groups).find(
        (g) => g.rubikaChatId === preferredChatId,
      );
      if (preferredGroup) {
        const byTitle = avail.find(
          (g) => g.title.trim() && g.title.trim() === preferredGroup.title.trim(),
        );
        if (byTitle) return byTitle.chatGuid;
      }
      const userbotActive = this.state.userbotStatus?.activeChatGuid;
      if (userbotActive && avail.some((g) => g.chatGuid === userbotActive)) {
        return userbotActive;
      }
      return avail[0].chatGuid;
    }

    if (this.isRealGroupGuid(preferredChatId)) {
      return preferredChatId!;
    }
    const userbotActive = this.state.userbotStatus?.activeChatGuid;
    if (this.isRealGroupGuid(userbotActive)) {
      return userbotActive!;
    }
    const activeGroup = this.state.groups[this.state.activeGroupId];
    if (activeGroup && this.isRealGroupGuid(activeGroup.rubikaChatId)) {
      return activeGroup.rubikaChatId;
    }
    const anyRealGroup = Object.values(this.state.groups).find((g) =>
      this.isRealGroupGuid(g.rubikaChatId),
    );
    if (anyRealGroup) {
      return anyRealGroup.rubikaChatId;
    }
    return preferredChatId || activeGroup?.rubikaChatId || '';
  }

  public getActiveVoicePlaybackSnapshot(): {
    rubikaChatId: string;
    voiceCallActive: boolean;
    isPlaying: boolean;
    isMuted: boolean;
    volume: number;
    streamUrl?: string;
    trackTitle?: string;
    trackArtist?: string;
  } | null {
    const activeGroup = this.state.groups[this.state.activeGroupId];
    const targetGroup =
      (activeGroup && (activeGroup.isPlaying || activeGroup.voiceCallActive)
        ? activeGroup
        : Object.values(this.state.groups).find(
            (g) => this.isRealGroupGuid(g.rubikaChatId) && (g.isPlaying || g.voiceCallActive),
          )) || activeGroup;
    if (!targetGroup || (!targetGroup.voiceCallActive && !targetGroup.isPlaying)) {
      return null;
    }
    const resolvedGuid = this.resolveVoiceCallChatGuid(targetGroup.rubikaChatId);
    if (!this.isRealGroupGuid(resolvedGuid)) {
      return null;
    }
    return {
      rubikaChatId: resolvedGuid,
      voiceCallActive: Boolean(targetGroup.voiceCallActive),
      isPlaying: Boolean(targetGroup.isPlaying),
      isMuted: Boolean(targetGroup.isMuted),
      volume: targetGroup.volume ?? 80,
      streamUrl: targetGroup.currentTrack?.streamUrl,
      trackTitle: targetGroup.currentTrack?.title,
      trackArtist: targetGroup.currentTrack?.artist,
    };
  }

  private enqueueVoiceCallTask(
    task: Omit<VoiceCallTask, 'id' | 'createdAt'>,
  ): VoiceCallTask {
    const resolvedGuid = this.resolveVoiceCallChatGuid(task.rubikaChatId);
    const entry: VoiceCallTask = {
      ...task,
      rubikaChatId: resolvedGuid || task.rubikaChatId,
      audioProfile: task.audioProfile || this.state.rubikaAudioProfile,
      id: `vct_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    this.pendingVoiceCallTasks = [...this.pendingVoiceCallTasks.slice(-30), entry];
    if (userbotManager.hasSession() && !userbotManager.isDaemonRunning()) {
      userbotManager.ensureRunningIfSessionExists(Number(process.env.PORT) || 3000);
    }
    return entry;
  }

  public popNextVoiceCallTask(): VoiceCallTask | null {
    return this.pendingVoiceCallTasks.shift() || null;
  }

  private waitForTaskResult(
    taskId: string,
    timeoutMs = 5000,
  ): Promise<Record<string, unknown> | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.taskWaiters.delete(taskId);
        resolve(null);
      }, timeoutMs);
      this.taskWaiters.set(taskId, {
        resolve: (res) => {
          clearTimeout(timer);
          this.taskWaiters.delete(taskId);
          resolve(res);
        },
        timer,
      });
    });
  }

  public resolveTaskWaiter(taskId: string | undefined, payload: Record<string, unknown>): void {
    if (!taskId) return;
    const waiter = this.taskWaiters.get(taskId);
    if (waiter) {
      waiter.resolve(payload);
    }
  }

  public applyAdminActionResult(params: {
    taskId?: string;
    groupId?: string;
    rubikaChatId?: string;
    targetUserId?: string;
    targetUsername?: string;
    targetName?: string;
    adminAction: 'SetAdmin' | 'UnsetAdmin';
    ok: boolean;
    error?: string;
  }): GroupState | null {
    const group =
      (params.groupId ? this.state.groups[params.groupId] : undefined) ||
      Object.values(this.state.groups).find((g) => g.rubikaChatId === params.rubikaChatId);

    if (group && params.ok && params.targetUserId) {
      const isPromote = params.adminAction === 'SetAdmin';
      const uid = params.targetUserId.trim();
      const cleanUsername = params.targetUsername
        ? `@${params.targetUsername.replace(/^@/, '')}`
        : undefined;
      const existing = group.members.find(
        (m) =>
          m.userId === uid ||
          (cleanUsername &&
            m.username &&
            m.username.replace(/^@/, '').toLowerCase() === cleanUsername.replace(/^@/, '').toLowerCase()),
      );
      if (existing) {
        existing.userId = uid;
        if (params.targetName?.trim()) existing.name = params.targetName.trim();
        if (cleanUsername) existing.username = cleanUsername;
        if (existing.role !== 'creator') {
          existing.role = isPromote ? 'admin' : 'member';
        }
      } else {
        group.members.push({
          userId: uid,
          name: params.targetName?.trim() || cleanUsername || uid,
          ...(cleanUsername ? {username: cleanUsername} : {}),
          role: isPromote ? 'admin' : 'member',
          joinedAt: new Date().toISOString(),
        });
      }
      this.addLog(
        'RUBIKA_ADMIN',
        'ok',
        `${group.title}: ${isPromote ? 'ارتقا به ادمین/مدیر' : 'برداشتن مقام مدیر'} برای «${params.targetName || uid}» در روبیکا انجام شد.`,
      );
      this.saveState();
    } else if (!params.ok && params.error) {
      this.addLog('RUBIKA_ADMIN', 'error', params.error);
    }

    this.resolveTaskWaiter(params.taskId, {
      ok: params.ok,
      targetUserId: params.targetUserId,
      targetName: params.targetName,
      targetUsername: params.targetUsername,
      adminAction: params.adminAction,
      error: params.error,
    });
    return group || null;
  }

  public applySyncMembersResult(params: {
    taskId?: string;
    groupId?: string;
    rubikaChatId?: string;
    ok: boolean;
    members?: Array<{userId: string; name: string; username?: string; role: UserRole}>;
    error?: string;
  }): GroupState | null {
    const group =
      (params.groupId ? this.state.groups[params.groupId] : undefined) ||
      Object.values(this.state.groups).find((g) => g.rubikaChatId === params.rubikaChatId);

    if (group && params.ok && Array.isArray(params.members)) {
      const byId = new Map<string, GroupMember>();
      for (const existing of group.members) {
        byId.set(existing.userId, existing);
      }
      for (const incoming of params.members) {
        if (!incoming.userId) continue;
        const prev = byId.get(incoming.userId);
        if (prev) {
          if (incoming.name && !incoming.name.startsWith('u0')) {
            prev.name = incoming.name;
          }
          if (incoming.username) {
            prev.username = `@${incoming.username.replace(/^@/, '')}`;
          }
          if (prev.role !== 'creator' && prev.role !== 'owner') {
            prev.role = incoming.role === 'admin' ? 'admin' : prev.role === 'vip' ? 'vip' : 'member';
          }
        } else {
          byId.set(incoming.userId, {
            userId: incoming.userId,
            name: incoming.name || incoming.userId,
            ...(incoming.username ? {username: `@${incoming.username.replace(/^@/, '')}`} : {}),
            role: incoming.role,
            joinedAt: new Date().toISOString(),
          });
        }
      }
      group.members = Array.from(byId.values());
      this.addLog(
        'RUBIKA_SYNC',
        'ok',
        `${group.title}: لیست اعضا و مدیران از روبیکا همگام‌سازی شد (${group.members.length} عضو).`,
      );
      this.saveState();
    } else if (!params.ok && params.error) {
      this.addLog('RUBIKA_SYNC', 'error', params.error);
    }

    this.resolveTaskWaiter(params.taskId, {
      ok: params.ok,
      count: params.members?.length || 0,
      error: params.error,
    });
    return group || null;
  }

  public async setGroupAdminRole(
    groupId: string,
    targetUserOrUsername: string,
    adminAction: 'SetAdmin' | 'UnsetAdmin',
    targetNameHint?: string,
  ): Promise<{
    ok: boolean;
    queued?: boolean;
    message?: string;
    error?: string;
    group?: GroupState;
  }> {
    const group = this.state.groups[groupId];
    if (!group) {
      return {ok: false, error: 'گروه پیدا نشد.'};
    }
    const cleanTarget = targetUserOrUsername.trim();
    if (!cleanTarget) {
      return {ok: false, error: 'آیدی @ یا شناسه کاربر الزامی است.'};
    }

    const isPromote = adminAction === 'SetAdmin';
    if (!this.isRealGroupGuid(group.rubikaChatId)) {
      const existing = group.members.find((m) => m.userId === cleanTarget || m.username === cleanTarget);
      if (existing && existing.role !== 'creator') {
        existing.role = isPromote ? 'admin' : 'member';
      } else if (!existing && isPromote) {
        group.members.push({
          userId: cleanTarget,
          name: targetNameHint?.trim() || cleanTarget,
          role: 'admin',
          joinedAt: new Date().toISOString(),
        });
      }
      this.saveState();
      return {
        ok: true,
        group,
        message: isPromote
          ? `کاربر به عنوان ادمین/مدیر در کنسول ثبت شد (برای اعمال در روبیکا گروه واقعی متصل کنید).`
          : `مقام مدیر برداشته شد.`,
      };
    }

    const daemonReady = Boolean(this.state.userbotStatus?.connected && userbotManager.isDaemonRunning());
    const task = this.enqueueVoiceCallTask({
      action: 'set_group_admin',
      groupId: group.groupId,
      rubikaChatId: group.rubikaChatId,
      targetUserId: cleanTarget,
      targetName: targetNameHint,
      adminAction,
    });

    if (!daemonReady) {
      return {
        ok: false,
        queued: true,
        group,
        error: 'اکانت Userbot روبیکا متصل نیست؛ دستور تنظیم ادمین در صف قرار گرفت تا پس از اتصال اجرا شود.',
      };
    }

    const liveRes = await this.waitForTaskResult(task.id, 6000);
    if (!liveRes) {
      return {
        ok: false,
        queued: true,
        group,
        error: 'درخواست برای Userbot ارسال شد اما پاسخ روبیکا هنوز نرسیده است (در حال پردازش).',
      };
    }
    if (!liveRes.ok) {
      return {
        ok: false,
        group,
        error: String(liveRes.error || 'خطا در تنظیم ادمین واقعی در روبیکا.'),
      };
    }
    const label = String(liveRes.targetName || targetNameHint || cleanTarget);
    return {
      ok: true,
      group: this.state.groups[groupId],
      message: isPromote
        ? `کاربر «${label}» با موفقیت در روبیکا ادمین (مدیر) شد.`
        : `مقام مدیر «${label}» در روبیکا برداشته شد.`,
    };
  }

  public async requestSyncGroupMembers(groupId: string): Promise<{
    ok: boolean;
    error?: string;
    group?: GroupState;
  }> {
    const group = this.state.groups[groupId];
    if (!group) return {ok: false, error: 'گروه پیدا نشد.'};
    if (!this.isRealGroupGuid(group.rubikaChatId)) {
      return {ok: false, error: 'ابتدا یک گروه یا کانال واقعی روبیکا متصل کنید.'};
    }
    if (!this.state.userbotStatus?.connected || !userbotManager.isDaemonRunning()) {
      return {ok: false, error: 'برای دریافت لیست اعضای واقعی روبیکا، اکانت Userbot باید متصل باشد.'};
    }
    const task = this.enqueueVoiceCallTask({
      action: 'sync_group_members',
      groupId: group.groupId,
      rubikaChatId: group.rubikaChatId,
    });
    const liveRes = await this.waitForTaskResult(task.id, 7000);
    if (!liveRes) {
      return {ok: false, error: 'زمان دریافت لیست اعضا از روبیکا به پایان رسید.'};
    }
    if (!liveRes.ok) {
      return {ok: false, error: String(liveRes.error || 'خطا در دریافت لیست اعضا از روبیکا.')};
    }
    return {ok: true, group: this.state.groups[groupId]};
  }

  public getModerationConfigMap(): Record<
    string,
    {
      locks: NonNullable<GroupState['locks']>;
      mutedUserIds: string[];
      filteredWords: string[];
      exemptUserIds: string[];
    }
  > {
    const out: Record<
      string,
      {
        locks: NonNullable<GroupState['locks']>;
        mutedUserIds: string[];
        filteredWords: string[];
        exemptUserIds: string[];
      }
    > = {};
    for (const grp of Object.values(this.state.groups)) {
      if (!grp.rubikaChatId.startsWith('g0')) continue;
      const exempt = new Set<string>([this.state.creatorId, grp.ownerId]);
      if (this.state.creatorRubikaGuid) exempt.add(this.state.creatorRubikaGuid);
      for (const s of this.state.sudoUserIds || []) {
        if (s.startsWith('u0')) exempt.add(s);
      }
      for (const m of grp.members || []) {
        if (['creator', 'owner', 'admin'].includes(m.role)) {
          exempt.add(m.userId);
        }
      }
      out[grp.rubikaChatId] = {
        locks: grp.locks || {},
        mutedUserIds: grp.mutedUserIds || [],
        filteredWords: grp.filteredWords || [],
        exemptUserIds: Array.from(exempt),
      };
    }
    return out;
  }

  public recordModerationEvent(params: {
    chatGuid: string;
    userId: string;
    userName?: string;
    reason: string;
    actionTaken: string;
    messagePreview?: string;
  }): {autoBanned: boolean} {
    const group = Object.values(this.state.groups).find(
      (g) => g.rubikaChatId === params.chatGuid,
    );
    if (!group) return {autoBanned: false};

    const uid = params.userId || 'unknown';
    const warns = {...(group.warnings || {})};
    let autoBanned = false;
    if (uid !== 'unknown' && !params.reason.includes('سکوت')) {
      const nextCount = (warns[uid] || 0) + 1;
      warns[uid] = nextCount;
      group.warnings = warns;
      if (nextCount >= 3 && group.rubikaChatId.startsWith('g0')) {
        autoBanned = true;
        this.enqueueVoiceCallTask({
          action: 'ban_member',
          groupId: group.groupId,
          rubikaChatId: group.rubikaChatId,
          targetUserId: uid,
        });
      }
    }

    const logEntry = {
      id: `viol_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: uid,
      userName: params.userName || uid,
      reason: params.reason,
      actionTaken: autoBanned ? `${params.actionTaken} + مسدودسازی خودکار (۳/۳ اخطار)` : params.actionTaken,
      messagePreview: params.messagePreview,
      timestamp: new Date().toISOString(),
    };
    group.violationLogs = [logEntry, ...(group.violationLogs || [])].slice(0, 50);
    this.addLog('HELPER_ADMIN', 'info', `${group.title}: ${logEntry.actionTaken} (${params.reason})`);
    this.saveState();
    return {autoBanned};
  }

  public updateGroupModeration(
    groupId: string,
    patch: {
      locks?: GroupState['locks'];
      addFilterWord?: string;
      removeFilterWord?: string;
      unmuteUserId?: string;
      clearWarnings?: boolean;
      clearViolations?: boolean;
      deleteRecentCount?: number;
    },
  ): GroupState | null {
    const group = this.state.groups[groupId];
    if (!group) return null;

    if (patch.locks) {
      const prevLockChat = Boolean(group.locks?.lockChat);
      group.locks = {...(group.locks || {}), ...patch.locks};
      if (typeof patch.locks.lockChat === 'boolean' && patch.locks.lockChat !== prevLockChat) {
        if (this.isRealGroupGuid(group.rubikaChatId) && group.rubikaChatId.startsWith('g0')) {
          this.enqueueVoiceCallTask({
            action: 'set_group_locks',
            groupId: group.groupId,
            rubikaChatId: group.rubikaChatId,
            lockChat: Boolean(patch.locks.lockChat),
          });
        }
      }
    }
    if (patch.addFilterWord && patch.addFilterWord.trim()) {
      const w = patch.addFilterWord.trim();
      group.filteredWords = Array.from(new Set([...(group.filteredWords || []), w]));
    }
    if (patch.removeFilterWord) {
      group.filteredWords = (group.filteredWords || []).filter(
        (w) => w !== patch.removeFilterWord,
      );
    }
    if (patch.unmuteUserId) {
      group.mutedUserIds = (group.mutedUserIds || []).filter((id) => id !== patch.unmuteUserId);
    }
    if (patch.clearWarnings) {
      group.warnings = {};
    }
    if (patch.clearViolations) {
      group.violationLogs = [];
    }
    if (typeof patch.deleteRecentCount === 'number' && patch.deleteRecentCount > 0) {
      const count = Math.max(1, Math.min(200, Math.round(patch.deleteRecentCount)));
      const sliceKeep = Math.max(0, group.messages.length - count);
      group.messages = group.messages.slice(0, sliceKeep);
      if (this.isRealGroupGuid(group.rubikaChatId)) {
        this.enqueueVoiceCallTask({
          action: 'delete_messages',
          groupId: group.groupId,
          rubikaChatId: group.rubikaChatId,
          deleteCount: count,
        });
      }
    }
    this.saveState();
    return group;
  }

  public extractJoinTarget(rawText: string): string | null {
    const clean = rawText.trim();
    const mInvite = clean.match(/https?:\/\/rubika\.ir\/(?:joing|joinc)\/[A-Za-z0-9_\-]+/i);
    if (mInvite) return mInvite[0];
    const mUrl = clean.match(/(?:https?:\/\/)?rubika\.ir\/[A-Za-z0-9_]{3,}/i);
    if (mUrl) return mUrl[0].startsWith('http') ? mUrl[0] : `https://${mUrl[0]}`;
    const mAt = clean.match(/@[A-Za-z0-9_]{3,}/);
    if (mAt) return mAt[0];
    const mGuid = clean.match(/\b(?:c0|g0)[A-Za-z0-9]{15,}\b/);
    if (mGuid) return mGuid[0];
    if (clean.startsWith('c0') || clean.startsWith('g0')) return clean.split(/\s+/)[0];
    return null;
  }

  public async startVoiceCallAndPlayInGroup(
    groupId: string,
    opts?: {songQuery?: string; requestedBy?: string},
  ): Promise<{ok: boolean; track?: Track; error?: string}> {
    const targetGroup = this.state.groups[groupId];
    if (!targetGroup) {
      return {ok: false, error: 'گروه یا کانال پیدا نشد.'};
    }

    const requestedBy = opts?.requestedBy?.trim() || this.state.creatorName;
    let chosen: Track | undefined;

    if (opts?.songQuery?.trim()) {
      const searched = await searchMusicReal(opts.songQuery.trim(), requestedBy);
      if (searched.length > 0) {
        chosen = searched[0];
      } else {
        const smartRes = await smartSearchOnlineSongs(opts.songQuery.trim());
        if (smartRes.suggestions.length > 0) {
          chosen = {...smartRes.suggestions[0].track, requestedBy};
        }
      }
    }

    if (!chosen && targetGroup.currentTrack) {
      chosen = targetGroup.currentTrack;
    } else if (!chosen && targetGroup.pausedTrack) {
      chosen = targetGroup.pausedTrack;
    } else if (!chosen && targetGroup.queue.length > 0) {
      chosen = targetGroup.queue.shift();
    }

    if (!chosen) {
      try {
        const live = await searchMusicReal('بهنام بانی', requestedBy);
        if (live.length > 0) {
          chosen = live[Math.floor(Math.random() * Math.min(live.length, 5))];
        }
      } catch {
        // Fallback to local catalog
      }
    }

    if (!chosen) {
      const fromCatalog = musicCatalog.pickRandom(undefined, 1, requestedBy);
      if (fromCatalog.length > 0) {
        chosen = fromCatalog[0];
      }
    }

    const nowIso = new Date().toISOString();
    const wasActive = Boolean(targetGroup.voiceCallActive);
    this.state.activeGroupId = targetGroup.groupId;
    targetGroup.voiceCallActive = true;
    targetGroup.voiceCallId = targetGroup.voiceCallId || `vc_${Date.now()}`;
    targetGroup.voiceCallStartedAt = targetGroup.voiceCallStartedAt || nowIso;
    targetGroup.isMuted = false;

    if (chosen) {
      if (targetGroup.currentTrack && targetGroup.currentTrack.id !== chosen.id) {
        this.pushHistory(targetGroup, targetGroup.currentTrack);
      }
      targetGroup.currentTrack = chosen;
      targetGroup.pausedTrack = null;
      targetGroup.isPlaying = true;
      this.recordTrackPlay(targetGroup, chosen);
      this.enqueueVoiceCallTask({
        action: 'play_in_vc',
        groupId: targetGroup.groupId,
        rubikaChatId: targetGroup.rubikaChatId,
        trackTitle: chosen.title,
        trackArtist: chosen.artist,
        streamUrl: chosen.streamUrl,
        volume: targetGroup.volume,
      });
    } else {
      this.enqueueVoiceCallTask({
        action: 'start_call',
        groupId: targetGroup.groupId,
        rubikaChatId: targetGroup.rubikaChatId,
        volume: targetGroup.volume,
      });
    }

    if (!wasActive) {
      targetGroup.messages = [
        ...targetGroup.messages,
        {
          id: `msg_sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          groupId: targetGroup.groupId,
          senderId: 'system',
          senderName: this.state.botName,
          senderRole: 'creator' as const,
          text: `${this.state.botName} ویس‌چت ${targetGroup.chatType === 'channel' ? 'کانال' : 'گروه'} را شروع کرد`,
          isBot: true,
          isSystemEvent: true,
          timestamp: nowIso,
        },
      ].slice(-120);
    }

    this.saveState();
    return {ok: true, track: chosen};
  }

  public async joinRubikaTarget(
    rawTarget: string,
    opts?: {
      sourceGroupId?: string;
      daysValid?: number;
      autoPlayInCall?: boolean;
      songQuery?: string;
      requestedBy?: string;
    },
  ): Promise<{
    ok: boolean;
    group?: GroupState;
    chatType?: 'group' | 'channel';
    memberCount?: number;
    startedTrack?: Track;
    error?: string;
    queued?: boolean;
  }> {
    const cleanTarget = this.extractJoinTarget(rawTarget) || rawTarget.trim();
    if (!cleanTarget || cleanTarget.length < 4) {
      return {ok: false, error: 'لینک دعوت گروه یا آیدی کانال روبیکا معتبر نیست.'};
    }

    if (!userbotManager.hasSession()) {
      this.state.pendingJoinTargets = Array.from(
        new Set([...(this.state.pendingJoinTargets || []), cleanTarget]),
      );
      this.saveState();
      return {
        ok: false,
        queued: true,
        error:
          'لینک/آیدی ذخیره شد ✅ اما برای ورود واقعی Userbot و فعال‌سازی ویسکال/مدیر کمکی، ابتدا در تب «اتصال روبیکا» با شماره موبایل اکانت کمکی وارد شوید (پس از ورود، خودکار عضو می‌شود).',
      };
    }

    const joinRes = await userbotManager.joinGroupByInvite(cleanTarget, Number(process.env.PORT) || 3000);
    if (!joinRes.ok || !joinRes.chatGuid) {
      const errText = joinRes.error || 'عضویت انجام نشد.';
      // Only queue transient/auth failures, not non-existent usernames or plain user accounts
      if (!errText.includes('مربوط به کانال یا گروه') && !errText.includes('پیدا نشد')) {
        this.state.pendingJoinTargets = Array.from(
          new Set([...(this.state.pendingJoinTargets || []), cleanTarget]),
        );
        this.saveState();
      }
      return {ok: false, error: errText};
    }

    this.state.pendingJoinTargets = (this.state.pendingJoinTargets || []).filter(
      (t) => t.toLowerCase() !== cleanTarget.toLowerCase(),
    );

    const existingByGuid = Object.values(this.state.groups).find(
      (g) => g.rubikaChatId === joinRes.chatGuid,
    );
    const sourceGrp = opts?.sourceGroupId ? this.state.groups[opts.sourceGroupId] : undefined;
    const placeholder = this.state.groups['g_main_rubika'];
    const canUpgradeSource =
      sourceGrp &&
      (sourceGrp.rubikaChatId === 'g0D8xP912RubikaMain' || sourceGrp.rubikaChatId.startsWith('b0'));
    const canUpgradePlaceholder =
      placeholder &&
      (placeholder.rubikaChatId === 'g0D8xP912RubikaMain' || placeholder.rubikaChatId.startsWith('b0'));

    const targetGroupId =
      existingByGuid?.groupId ||
      (canUpgradeSource ? sourceGrp?.groupId : canUpgradePlaceholder ? placeholder?.groupId : undefined);

    const chatType: 'group' | 'channel' =
      joinRes.chatType || (joinRes.chatGuid.startsWith('c0') ? 'channel' : 'group');

    const bound = this.addOrUpdateGroup({
      groupId: targetGroupId,
      title: joinRes.title || (chatType === 'channel' ? 'کانال روبیکا' : 'گروه روبیکا'),
      rubikaChatId: joinRes.chatGuid,
      chatType,
      channelUsername: joinRes.username || (cleanTarget.startsWith('@') ? cleanTarget : undefined),
      inviteLink: joinRes.inviteLink || cleanTarget,
      daysValid: opts?.daysValid || 30,
    });
    this.state.rubikaMode = 'userbot_rubpy';
    this.state.activeGroupId = bound.groupId;
    this.saveState();

    let startedTrack: Track | undefined;
    const shouldAutoPlay =
      opts?.autoPlayInCall === true || (opts?.autoPlayInCall !== false && chatType === 'channel');
    if (shouldAutoPlay) {
      const playRes = await this.startVoiceCallAndPlayInGroup(bound.groupId, {
        songQuery: opts?.songQuery,
        requestedBy: opts?.requestedBy,
      });
      startedTrack = playRes.track;
    }

    return {
      ok: true,
      group: bound,
      chatType,
      memberCount: joinRes.memberCount || bound.members.length,
      startedTrack,
    };
  }

  public updateUserbotStatus(patch: Partial<UserbotBridgeStatus>): BotConfigState {
    this.state.userbotStatus = {
      ...(this.state.userbotStatus || {connected: false}),
      ...patch,
      lastHeartbeatAt: new Date().toISOString(),
    };
    this.saveState();
    return this.state;
  }

  public updateConfig(patch: {
    token?: string;
    creatorName?: string;
    creatorUsername?: string;
    creatorRubikaGuid?: string;
    botName?: string;
    botUsername?: string;
    botEnabled?: boolean;
    globalDailyPlayLimit?: number;
    sudoUserIds?: string[];
    publicBaseUrl?: string;
    rubikaMode?: 'bot_api_v3' | 'userbot_rubpy';
    activeGroupId?: string;
    autoSyncAudioToRubika?: boolean;
    rubikaAudioProfile?: AudioEngineSettings;
  }): BotConfigState {
    let tokenChanged = false;
    if (patch.token && patch.token.trim() && patch.token.trim() !== this.state.token) {
      this.state.token = patch.token.trim();
      this.state.lastVerifyResult = {verified: false};
      this.state.rubikaOffsetId = undefined;
      this.pollingOffset = undefined;
      this.processedMessageIds.clear();
      tokenChanged = true;
    }
    if (patch.creatorName && patch.creatorName.trim()) {
      this.state.creatorName = patch.creatorName.trim();
    }
    if (typeof patch.creatorUsername === 'string' && patch.creatorUsername.trim()) {
      const cleaned = patch.creatorUsername.trim().replace(/^@+/, '');
      const normalized = cleaned ? `@${cleaned}` : DEFAULT_CREATOR_USERNAME;
      if (normalized.toLowerCase() !== (this.state.creatorUsername || '').toLowerCase()) {
        this.state.creatorRubikaGuid = undefined;
      }
      this.state.creatorUsername = normalized;
      for (const grp of Object.values(this.state.groups)) {
        const cm = grp.members.find((m) => m.userId === this.state.creatorId);
        if (cm) cm.username = normalized;
      }
    }
    if (typeof patch.creatorRubikaGuid === 'string') {
      const cleanedGuid = patch.creatorRubikaGuid.trim();
      this.state.creatorRubikaGuid = cleanedGuid || undefined;
    }
    if (patch.botName && patch.botName.trim()) {
      this.state.botName = patch.botName.trim();
    }
    if (typeof patch.botUsername === 'string' && patch.botUsername.trim()) {
      const cleanedBot = patch.botUsername.trim().replace(/^@+/, '');
      this.state.botUsername = cleanedBot ? `@${cleanedBot}` : this.state.botUsername;
    }
    if (typeof patch.botEnabled === 'boolean') {
      this.state.botEnabled = patch.botEnabled;
      this.addLog(
        'CREATOR_BOT_POWER',
        'info',
        patch.botEnabled ? 'ربات توسط سازنده روشن و فعال شد.' : 'ربات توسط سازنده در حالت تعمیرات (خاموش) قرار گرفت.',
      );
    }
    if (
      typeof patch.globalDailyPlayLimit === 'number' &&
      Number.isFinite(patch.globalDailyPlayLimit)
    ) {
      this.state.globalDailyPlayLimit = Math.max(0, Math.min(9999, Math.round(patch.globalDailyPlayLimit)));
    }
    if (Array.isArray(patch.sudoUserIds)) {
      this.state.sudoUserIds = Array.from(
        new Set(patch.sudoUserIds.map((s) => s.trim()).filter(Boolean)),
      );
    }
    if (patch.publicBaseUrl && /^https?:\/\//i.test(patch.publicBaseUrl.trim())) {
      this.state.publicBaseUrl = patch.publicBaseUrl.trim().replace(/\/$/, '');
    }
    if (patch.rubikaMode) {
      this.state.rubikaMode = patch.rubikaMode;
    }
    if (typeof patch.autoSyncAudioToRubika === 'boolean') {
      this.state.autoSyncAudioToRubika = patch.autoSyncAudioToRubika;
    }
    if (patch.rubikaAudioProfile) {
      this.state.rubikaAudioProfile = patch.rubikaAudioProfile;
      const profileName =
        patch.rubikaAudioProfile.profile === 'high_fidelity'
          ? 'High-Fidelity'
          : patch.rubikaAudioProfile.profile === 'data_saver'
            ? 'Data-Saver'
            : patch.rubikaAudioProfile.profile === 'balance'
              ? 'Balance'
              : 'Custom';
      const bitrate = patch.rubikaAudioProfile.streamBitrateKbps || 64;
      const khz = (patch.rubikaAudioProfile.sampleRate / 1000).toFixed(1);
      const ch = patch.rubikaAudioProfile.channels === 'mono' ? 'Mono' : 'Stereo';
      this.addLog(
        'AUDIO_PROFILE',
        'info',
        `پروفایل استریم روبیکا به ${profileName} (${khz} kHz · ${bitrate} kbps · ${ch}) تغییر یافت.`,
      );
      const activeGroup = this.state.groups[this.state.activeGroupId];
      if (activeGroup && (this.state.userbotStatus?.connected || activeGroup.voiceCallActive)) {
        this.enqueueVoiceCallTask({
          action: 'set_audio_profile',
          groupId: activeGroup.groupId,
          rubikaChatId: activeGroup.rubikaChatId,
          audioProfile: patch.rubikaAudioProfile,
        });
      }
    }
    if (patch.activeGroupId && this.state.groups[patch.activeGroupId]) {
      this.state.activeGroupId = patch.activeGroupId;
    }
    this.saveState();
    if (tokenChanged) {
      void this.bootstrapLiveRubika();
    }
    return this.state;
  }

  public updateGroupCreatorSettings(
    groupId: string,
    patch: {
      daysValid?: number;
      addDays?: number;
      setUnlimited?: boolean;
      cancelSubscription?: boolean;
      dailyPlayLimit?: number;
      publicAccess?: 'open' | 'locked';
    },
  ): GroupState | null {
    const group = this.state.groups[groupId];
    if (!group) return null;
    const now = new Date();
    if (patch.cancelSubscription) {
      group.subscription = {
        planName: 'اشتراک غیرفعال شده توسط سازنده',
        purchasedAt: group.subscription.purchasedAt || now.toISOString(),
        expiresAt: now.toISOString(),
        isActive: false,
      };
    } else if (patch.setUnlimited) {
      group.subscription = {
        planName: 'اشتراک ویژه دائمی (سازنده)',
        purchasedAt: group.subscription.purchasedAt || now.toISOString(),
        expiresAt: addDaysIso(now, 3650),
        isActive: true,
      };
    } else if (typeof patch.addDays === 'number' && Number.isFinite(patch.addDays)) {
      const currentExp = new Date(group.subscription.expiresAt).getTime();
      const baseDate = currentExp > Date.now() ? new Date(currentExp) : now;
      group.subscription = {
        planName: 'اشتراک تمدیدشده توسط سازنده',
        purchasedAt: group.subscription.purchasedAt || now.toISOString(),
        expiresAt: addDaysIso(baseDate, Math.max(1, Math.round(patch.addDays))),
        isActive: true,
      };
    } else if (typeof patch.daysValid === 'number' && Number.isFinite(patch.daysValid)) {
      group.subscription = {
        planName: patch.daysValid >= 365 ? 'اشتراک سالانه ویسکال' : 'اشتراک ویژه ویسکال',
        purchasedAt: now.toISOString(),
        expiresAt: addDaysIso(now, Math.max(1, Math.round(patch.daysValid))),
        isActive: true,
      };
    }

    if (typeof patch.dailyPlayLimit === 'number' && Number.isFinite(patch.dailyPlayLimit)) {
      group.dailyPlayLimit = Math.max(0, Math.min(9999, Math.round(patch.dailyPlayLimit)));
    }
    if (patch.publicAccess === 'open' || patch.publicAccess === 'locked') {
      group.publicAccess = patch.publicAccess;
    }

    this.addLog('CREATOR_GROUP_UPDATE', 'ok', `تنظیمات گروه «${group.title}» توسط سازنده بروزرسانی شد.`);
    this.saveState();
    return group;
  }

  public deleteGroup(groupId: string): {ok: boolean; error?: string; state: BotConfigState} {
    const allIds = Object.keys(this.state.groups);
    if (!this.state.groups[groupId]) {
      return {ok: false, error: 'گروه مورد نظر یافت نشد.', state: this.state};
    }
    if (allIds.length <= 1) {
      return {ok: false, error: 'حداقل یک گروه باید در سیستم باقی بماند.', state: this.state};
    }
    const title = this.state.groups[groupId].title;
    delete this.state.groups[groupId];
    if (this.state.activeGroupId === groupId) {
      const nextGroup =
        Object.values(this.state.groups).find((g) => this.isRealGroupGuid(g.rubikaChatId)) ||
        Object.values(this.state.groups)[0];
      if (nextGroup) {
        this.state.activeGroupId = nextGroup.groupId;
      }
    }
    this.addLog('CREATOR_GROUP_DELETE', 'info', `گروه «${title}» توسط سازنده از پنل حذف شد.`);
    this.saveState();
    return {ok: true, state: this.state};
  }

  public clearGroupMessages(groupId: string): GroupState | null {
    const group = this.state.groups[groupId];
    if (!group) return null;
    group.messages = [
      {
        id: `b_clear_${Date.now()}`,
        groupId: group.groupId,
        senderId: 'bot_rubika',
        senderName: this.state.botName,
        senderRole: 'creator',
        text: `🧹 تاریخچه پیام‌های پنل این گروه توسط سازنده (${this.state.creatorUsername || this.state.creatorName}) پاکسازی شد.`,
        isBot: true,
        timestamp: new Date().toISOString(),
      },
    ];
    this.saveState();
    return group;
  }

  public clearApiLogs(): BotConfigState {
    this.state.apiLogs = [
      {
        id: `log_${Date.now()}`,
        timestamp: new Date().toISOString(),
        method: 'CREATOR_CLEAR_LOGS',
        status: 'info',
        detail: `گزارش لاگ‌ها توسط سازنده (${this.state.creatorUsername || this.state.creatorName}) پاکسازی شد.`,
      },
    ];
    this.saveState();
    return this.state;
  }

  public async toggleGroupVoiceCall(
    groupId: string,
    action: 'start' | 'stop',
  ): Promise<{ok: boolean; error?: string; state: BotConfigState}> {
    const group = this.state.groups[groupId];
    if (!group) {
      return {ok: false, error: 'گروه پیدا نشد.', state: this.state};
    }
    const nowIso = new Date().toISOString();
    if (action === 'start') {
      group.voiceCallActive = true;
      group.voiceCallId = group.voiceCallId || `vc_${Date.now()}`;
      group.voiceCallStartedAt = group.voiceCallStartedAt || nowIso;
      const track = group.currentTrack || group.pausedTrack;
      if (!group.currentTrack && group.pausedTrack) {
        group.currentTrack = group.pausedTrack;
        group.pausedTrack = null;
        group.isPlaying = true;
      }
      this.enqueueVoiceCallTask({
        action: 'start_call',
        groupId: group.groupId,
        rubikaChatId: group.rubikaChatId,
        volume: group.volume,
        ...(track
          ? {
              trackTitle: track.title,
              trackArtist: track.artist,
              streamUrl: track.streamUrl,
            }
          : {}),
      });
      this.addLog('CREATOR_VC_START', 'ok', `ویسکال «${group.title}» توسط سازنده شروع شد.`);
    } else {
      if (group.currentTrack) {
        this.pushHistory(group, group.currentTrack);
      }
      group.voiceCallActive = false;
      group.voiceCallId = undefined;
      group.voiceCallStartedAt = undefined;
      group.isPlaying = false;
      group.currentTrack = null;
      group.pausedTrack = null;
      this.enqueueVoiceCallTask({
        action: 'stop_vc',
        groupId: group.groupId,
        rubikaChatId: group.rubikaChatId,
      });
      this.addLog('CREATOR_VC_STOP', 'info', `ویسکال «${group.title}» توسط سازنده قطع شد.`);
    }
    this.saveState();
    return {ok: true, state: this.state};
  }

  public stopAllVoiceCalls(): {stoppedCount: number; state: BotConfigState} {
    let stoppedCount = 0;
    for (const group of Object.values(this.state.groups)) {
      if (group.voiceCallActive || group.isPlaying) {
        stoppedCount += 1;
        if (group.currentTrack) this.pushHistory(group, group.currentTrack);
        group.voiceCallActive = false;
        group.voiceCallId = undefined;
        group.voiceCallStartedAt = undefined;
        group.isPlaying = false;
        group.currentTrack = null;
        group.pausedTrack = null;
        this.enqueueVoiceCallTask({
          action: 'stop_vc',
          groupId: group.groupId,
          rubikaChatId: group.rubikaChatId,
        });
      }
    }
    this.addLog('CREATOR_STOP_ALL_VC', 'info', `${stoppedCount} ویسکال فعال توسط سازنده متوقف شد.`);
    this.saveState();
    return {stoppedCount, state: this.state};
  }

  public addOrRemoveSudoUser(action: 'add' | 'remove', targetRaw: string): BotConfigState {
    const cleaned = targetRaw.trim();
    if (!cleaned) return this.state;
    const normalized = cleaned.startsWith('u0') ? cleaned : `@${cleaned.replace(/^@+/, '')}`;
    const current = new Set(this.state.sudoUserIds || []);
    if (action === 'add') {
      current.add(normalized);
      this.addLog('CREATOR_SUDO_ADD', 'ok', `دسترسی همکار سازنده (Sudo) برای «${normalized}» ثبت شد.`);
    } else {
      for (const item of Array.from(current)) {
        if (item.toLowerCase() === normalized.toLowerCase()) {
          current.delete(item);
        }
      }
      this.addLog('CREATOR_SUDO_REMOVE', 'info', `دسترسی Sudo برای «${normalized}» حذف شد.`);
    }
    this.state.sudoUserIds = Array.from(current);
    this.saveState();
    return this.state;
  }

  public applyCreatorResolvedResult(payload: {
    taskId?: string;
    ok: boolean;
    userGuid?: string;
    name?: string;
    username?: string;
    error?: string;
  }): void {
    if (payload.ok && payload.userGuid && payload.userGuid.startsWith('u0')) {
      this.state.creatorRubikaGuid = payload.userGuid;
      if (payload.username) {
        this.state.creatorUsername = payload.username;
      }
      this.addLog(
        'CREATOR_RESOLVED',
        'ok',
        `شناسه روبیکای سازنده ${this.state.creatorUsername || ''} روی ${payload.userGuid} ثبت شد.`,
      );
      this.saveState();
    }
    if (payload.taskId) {
      this.resolveTaskWaiter(payload.taskId, payload as Record<string, unknown>);
    }
  }

  public async resolveCreatorRubikaGuid(): Promise<{
    ok: boolean;
    creatorRubikaGuid?: string;
    name?: string;
    error?: string;
    state: BotConfigState;
  }> {
    const uname = (this.state.creatorUsername || DEFAULT_CREATOR_USERNAME).trim();
    if (!uname) {
      return {ok: false, error: 'ابتدا آیدی روبیکای سازنده (مثلاً @Paria25805) را وارد کنید.', state: this.state};
    }
    if (!this.state.userbotStatus?.connected || !userbotManager.isDaemonRunning()) {
      return {
        ok: false,
        error: 'برای استعلام آنلاین آیدی @ از روبیکا، اکانت Userbot باید متصل باشد.',
        state: this.state,
      };
    }
    const task = this.enqueueVoiceCallTask({
      action: 'resolve_creator_username',
      groupId: this.state.activeGroupId,
      rubikaChatId: this.state.groups[this.state.activeGroupId]?.rubikaChatId || '',
      creatorUsername: uname,
    });
    const res = await this.waitForTaskResult(task.id, 7000);
    if (!res) {
      return {ok: false, error: 'پاسخی از Userbot دریافت نشد.', state: this.state};
    }
    if (!res.ok) {
      return {
        ok: false,
        error: String(res.error || 'کاربر در روبیکا یافت نشد.'),
        state: this.state,
      };
    }
    return {
      ok: true,
      creatorRubikaGuid: String(res.userGuid || ''),
      name: String(res.name || ''),
      state: this.state,
    };
  }

  public async broadcastToAllGroups(params: {
    text: string;
    targetScope?: 'all' | 'groups' | 'channels';
    attachTrack?: Track | null;
  }): Promise<{
    ok: boolean;
    sentCount: number;
    failedCount: number;
    details: Array<{
      groupId: string;
      title: string;
      rubikaChatId: string;
      ok: boolean;
      method: string;
      error?: string;
    }>;
    state: BotConfigState;
  }> {
    const scope = params.targetScope || 'all';
    const cleanText = params.text.trim();
    const details: Array<{
      groupId: string;
      title: string;
      rubikaChatId: string;
      ok: boolean;
      method: string;
      error?: string;
    }> = [];
    const nowIso = new Date().toISOString();

    const targets = Object.values(this.state.groups).filter((g) => {
      const isChannel = g.chatType === 'channel' || g.rubikaChatId.startsWith('c0');
      const isGroup = g.rubikaChatId.startsWith('g0');
      if (scope === 'groups') return isGroup;
      if (scope === 'channels') return isChannel;
      return isGroup || isChannel;
    });

    const userbotOnline = Boolean(
      this.state.userbotStatus?.connected && userbotManager.isDaemonRunning(),
    );

    for (const grp of targets) {
      const msgObj: ChatMessage = {
        id: `b_bc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        groupId: grp.groupId,
        senderId: 'bot_rubika',
        senderName: `${this.state.botName} (پیام سازنده)`,
        senderRole: 'creator',
        text: `📢 پیام همگانی سازنده:\n${cleanText}`,
        isBot: true,
        ...(params.attachTrack
          ? {
              audioAttachment: {
                title: params.attachTrack.title,
                artist: params.attachTrack.artist,
                url: params.attachTrack.streamUrl,
                durationSec: params.attachTrack.durationSec,
              },
            }
          : {}),
        timestamp: nowIso,
      };
      grp.messages = [...grp.messages, msgObj].slice(-120);

      if (!this.isRealGroupGuid(grp.rubikaChatId) || grp.rubikaChatId === 'g0D8xP912RubikaMain') {
        details.push({
          groupId: grp.groupId,
          title: grp.title,
          rubikaChatId: grp.rubikaChatId,
          ok: true,
          method: 'panel_only',
        });
        continue;
      }

      if (userbotOnline) {
        this.enqueueVoiceCallTask({
          action: 'send_text_message',
          groupId: grp.groupId,
          rubikaChatId: grp.rubikaChatId,
          messageText: `📢 پیام سازنده:\n${cleanText}`,
        });
        if (params.attachTrack?.streamUrl) {
          this.enqueueVoiceCallTask({
            action: 'send_audio_in_chat',
            groupId: grp.groupId,
            rubikaChatId: grp.rubikaChatId,
            trackTitle: params.attachTrack.title,
            trackArtist: params.attachTrack.artist,
            streamUrl: params.attachTrack.streamUrl,
          });
        }
        msgObj.deliveredToRubika = true;
        details.push({
          groupId: grp.groupId,
          title: grp.title,
          rubikaChatId: grp.rubikaChatId,
          ok: true,
          method: 'userbot_queue',
        });
      } else {
        const apiRes = await this.callRubikaApi(
          'sendMessage',
          {
            chat_id: grp.rubikaChatId,
            text: `📢 پیام سازنده:\n${cleanText}`,
          },
          true,
        );
        if (apiRes.ok) {
          msgObj.deliveredToRubika = true;
        }
        details.push({
          groupId: grp.groupId,
          title: grp.title,
          rubikaChatId: grp.rubikaChatId,
          ok: apiRes.ok,
          method: 'bot_api_v3',
          error: apiRes.error,
        });
      }
    }

    const sentCount = details.filter((d) => d.ok).length;
    const failedCount = details.length - sentCount;
    this.addLog(
      'CREATOR_BROADCAST',
      failedCount === 0 ? 'ok' : 'info',
      `ارسال همگانی به ${sentCount} از ${details.length} گروه/کانال انجام شد.`,
    );
    this.saveState();
    return {
      ok: sentCount > 0 || details.length === 0,
      sentCount,
      failedCount,
      details,
      state: this.state,
    };
  }

  public addQuickShortcut(input: {
    label?: string;
    commandText: string;
    accent?: QuickCommandShortcut['accent'];
    sendToRubika?: boolean;
  }): BotConfigState {
    const cleanCmd = input.commandText.trim();
    const cleanLabel = (input.label || '').trim() || cleanCmd;
    const item: QuickCommandShortcut = {
      id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: cleanLabel,
      commandText: cleanCmd,
      accent: input.accent || 'emerald',
      sendToRubika: input.sendToRubika !== false,
      createdAt: new Date().toISOString(),
    };
    this.state.quickShortcuts = [...(this.state.quickShortcuts || []), item].slice(0, 32);
    this.saveState();
    return this.state;
  }

  public deleteQuickShortcut(shortcutId: string): BotConfigState {
    this.state.quickShortcuts = (this.state.quickShortcuts || []).filter(
      (s) => s.id !== shortcutId,
    );
    this.saveState();
    return this.state;
  }

  public addOrUpdateGroup(input: {
    groupId?: string;
    title: string;
    rubikaChatId: string;
    chatType?: 'group' | 'channel' | 'dm';
    channelUsername?: string;
    inviteLink?: string;
    ownerId?: string;
    ownerName?: string;
    daysValid?: number;
  }): GroupState {
    const id = input.groupId || `grp_${Date.now()}`;
    const now = new Date();
    const days = Math.max(1, input.daysValid || 30);
    const existing = this.state.groups[id];
    const inferredType: GroupState['chatType'] =
      input.chatType ||
      (input.rubikaChatId.startsWith('c0')
        ? 'channel'
        : input.rubikaChatId.startsWith('b0') || input.rubikaChatId.startsWith('u0')
          ? 'dm'
          : 'group');

    const group: GroupState = existing
      ? {
          ...existing,
          title: input.title.trim() || existing.title,
          rubikaChatId: input.rubikaChatId.trim() || existing.rubikaChatId,
          chatType: inferredType || existing.chatType,
          ...(input.channelUsername?.trim() ? {channelUsername: input.channelUsername.trim()} : {}),
          ...(input.inviteLink?.trim() ? {inviteLink: input.inviteLink.trim()} : {}),
        }
      : {
          groupId: id,
          title: input.title.trim() || (inferredType === 'channel' ? 'کانال جدید روبیکا' : 'گروه جدید روبیکا'),
          rubikaChatId: input.rubikaChatId.trim(),
          chatType: inferredType,
          ...(input.channelUsername?.trim() ? {channelUsername: input.channelUsername.trim()} : {}),
          ...(input.inviteLink?.trim() ? {inviteLink: input.inviteLink.trim()} : {}),
          ownerId: input.ownerId || this.state.creatorId,
          ownerName: input.ownerName || this.state.creatorName,
          publicAccess: 'open',
          voiceCallActive: false,
          volume: 80,
          isMuted: false,
          isPlaying: false,
          currentTrack: null,
          pausedTrack: null,
          pausedPositionSec: 0,
          queue: [],
          history: [],
          members: [
            {
              userId: this.state.creatorId,
              name: this.state.creatorName,
              role: 'creator',
              joinedAt: now.toISOString(),
            },
          ],
          subscription: {
            planName: 'اشتراک ویژه ویسکال',
            purchasedAt: now.toISOString(),
            expiresAt: addDaysIso(now, days),
            isActive: true,
          },
          messages: [
            {
              id: `msg_${Date.now()}`,
              groupId: id,
              senderId: 'bot_rubika',
              senderName: this.state.botName,
              senderRole: 'creator',
              text: `✅ ${inferredType === 'channel' ? 'کانال' : 'گروه'} «${input.title}» با شناسه ${input.rubikaChatId} متصل شد.`,
              isBot: true,
              timestamp: now.toISOString(),
            },
          ],
        };

    this.state.groups[id] = group;
    const currentActive = this.state.groups[this.state.activeGroupId];
    const currentIsRealGroup = Boolean(
      currentActive && this.isRealGroupGuid(currentActive.rubikaChatId),
    );
    if (this.isRealGroupGuid(group.rubikaChatId) || !currentIsRealGroup) {
      this.state.activeGroupId = id;
    }
    this.addLog('GROUP_ADD', 'info', `${inferredType === 'channel' ? 'کانال' : 'گروه'} «${group.title}» (${group.rubikaChatId}) ذخیره شد.`);
    this.saveState();
    return group;
  }

  public addMemberToGroup(groupId: string, name: string, userId: string, role: UserRole = 'member'): GroupState | null {
    const grp = this.state.groups[groupId];
    if (!grp) return null;
    const existingIdx = grp.members.findIndex((m) => m.userId === userId);
    const member: GroupMember = {
      userId: userId.trim(),
      name: name.trim(),
      role,
      joinedAt: new Date().toISOString(),
    };
    if (existingIdx >= 0) {
      grp.members[existingIdx] = member;
    } else {
      grp.members.push(member);
    }
    this.saveState();
    return grp;
  }

  public async callRubikaApi(
    method: string,
    payload: Record<string, unknown> = {},
    quietSuccessLog = false,
  ): Promise<{
    ok: boolean;
    statusCode?: number;
    data?: Record<string, unknown>;
    error?: string;
  }> {
    const url = `https://botapi.rubika.ir/v3/${encodeURIComponent(this.state.token)}/${method}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ParyaRubikaMusicBot/1.0',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      const text = await response.text();
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        parsed = {raw: text};
      }
      if (!response.ok || (parsed.status && parsed.status !== 'OK')) {
        const errText = `HTTP ${response.status}: ${text.slice(0, 180)}`;
        this.addLog(method, 'error', errText);
        return {ok: false, statusCode: response.status, data: parsed, error: errText};
      }
      if (!quietSuccessLog) {
        this.addLog(method, 'ok', `پاسخ دریافت شد (${response.status})`);
      }
      return {ok: true, statusCode: response.status, data: parsed};
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطا در برقراری ارتباط با سرور روبیکا';
      this.addLog(method, 'error', message);
      return {ok: false, error: message};
    }
  }

  public async sendAudioFileToRubika(params: {
    chatId: string;
    audioUrl: string;
    title: string;
    artist: string;
    caption: string;
    replyToMessageId?: string;
  }): Promise<{ok: boolean; messageId?: string; error?: string}> {
    try {
      let audioBuf: Buffer;
      if (params.audioUrl.startsWith('/api/voice-notes/')) {
        const fname = path.basename(params.audioUrl);
        const fp = path.join(DATA_DIR, 'voice-notes', fname);
        if (!fs.existsSync(fp)) {
          return {ok: false, error: 'فایل صوتی یافت نشد.'};
        }
        audioBuf = fs.readFileSync(fp);
      } else {
        const dlRes = await fetch(params.audioUrl, {
          redirect: 'follow',
          headers: {'User-Agent': 'ParyaRubikaMusicBot/1.0'},
          signal: AbortSignal.timeout(18000),
        });
        if (!dlRes.ok) {
          return {ok: false, error: `خطا در دانلود فایل صوتی (${dlRes.status})`};
        }
        audioBuf = Buffer.from(await dlRes.arrayBuffer());
      }

      if (audioBuf.length < 128) {
        return {ok: false, error: 'فایل صوتی خالی یا نامعتبر است.'};
      }

      const isMp3Magic =
        (audioBuf[0] === 0x49 && audioBuf[1] === 0x44 && audioBuf[2] === 0x33) ||
        (audioBuf[0] === 0xff && (audioBuf[1] & 0xe0) === 0xe0);
      const isMp3Url = params.audioUrl.toLowerCase().includes('.mp3');
      const isMp3 = isMp3Magic || isMp3Url;

      const reqType = isMp3 ? 'Music' : 'File';
      const ext = isMp3 ? 'mp3' : 'm4a';
      const mimeType = isMp3 ? 'audio/mpeg' : 'audio/mp4';
      const safeTitle = (params.title || 'music')
        .replace(/[\\/:*?"<>|]+/g, ' ')
        .trim()
        .slice(0, 48);
      const fileName = `${safeTitle || 'rubika-song'}.${ext}`;

      const reqRes = await this.callRubikaApi('requestSendFile', {type: reqType}, true);
      const uploadUrl = (reqRes.data?.data as Record<string, unknown> | undefined)?.upload_url as
        | string
        | undefined;
      if (!reqRes.ok || !uploadUrl) {
        return {ok: false, error: reqRes.error || 'عدم دریافت upload_url از روبیکا'};
      }

      const fd = new FormData();
      fd.append('file', new Blob([new Uint8Array(audioBuf)], {type: mimeType}), fileName);

      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        body: fd,
        signal: AbortSignal.timeout(25000),
      });
      const uploadJson = (await uploadRes.json()) as {
        status?: string;
        data?: {file_id?: string};
        dev_message?: string;
      };
      const fileId = uploadJson?.data?.file_id;
      if (!fileId) {
        return {
          ok: false,
          error: uploadJson?.dev_message || 'آپلود فایل در سرور روبیکا ناموفق بود',
        };
      }

      const sendRes = await this.callRubikaApi('sendFile', {
        chat_id: params.chatId,
        file_id: fileId,
        text: params.caption,
        ...(params.replyToMessageId ? {reply_to_message_id: params.replyToMessageId} : {}),
      });

      if (sendRes.ok && sendRes.data) {
        const d = (sendRes.data.data as Record<string, unknown>) || sendRes.data;
        const messageId = d.message_id ? String(d.message_id) : undefined;
        this.addLog(
          'sendFile',
          'ok',
          `آهنگ «${params.title}» (${reqType}) با موفقیت به روبیکا ارسال شد.`,
        );
        return {ok: true, messageId};
      }
      return {ok: false, error: sendRes.error || 'خطا در sendFile'};
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'خطا در ارسال فایل صوتی به روبیکا';
      this.addLog('sendFile', 'error', msg);
      return {ok: false, error: msg};
    }
  }

  public async sendTrackToRubikaGroup(
    groupId: string,
    track: Track,
  ): Promise<{ok: boolean; error?: string; groupTitle?: string; chatId?: string}> {
    const group = this.state.groups[groupId] || this.state.groups[this.state.activeGroupId];
    if (!group || !group.rubikaChatId) {
      return {ok: false, error: 'شناسه چت روبیکا برای این گروه تنظیم نشده است.'};
    }
    const caption = `🎵 در حال پخش در ویسکال:\n🎶 ${track.title} — ${track.artist}\n👑 سازنده: ${this.state.creatorName}`;
    const res = await this.sendAudioFileToRubika({
      chatId: group.rubikaChatId,
      audioUrl: track.streamUrl,
      title: track.title,
      artist: track.artist,
      caption,
    });
    if (!res.ok) {
      const fallback = await this.callRubikaApi('sendMessage', {
        chat_id: group.rubikaChatId,
        text: `${caption}\n🔗 ${track.streamUrl}`,
      });
      return {
        ok: fallback.ok,
        error: fallback.error || res.error,
        groupTitle: group.title,
        chatId: group.rubikaChatId,
      };
    }
    return {ok: true, groupTitle: group.title, chatId: group.rubikaChatId};
  }

  public async verifyToken(): Promise<BotConfigState['lastVerifyResult']> {
    const res = await this.callRubikaApi('getMe', {});
    if (res.ok && res.data && (res.data.status === 'OK' || res.data.data || res.data.bot)) {
      const dataObj = (res.data.data as Record<string, unknown>) || res.data;
      const botObj = (dataObj.bot as Record<string, unknown>) || dataObj;
      if (typeof botObj.username === 'string' && botObj.username.trim()) {
        this.state.botUsername = `@${botObj.username.replace(/^@/, '')}`;
      }
      if (typeof botObj.bot_title === 'string' && botObj.bot_title.trim()) {
        this.state.botName = botObj.bot_title.trim();
      }
      this.state.lastVerifyResult = {
        verified: true,
        checkedAt: new Date().toISOString(),
        botInfo: dataObj,
      };
    } else {
      this.state.lastVerifyResult = {
        verified: false,
        checkedAt: new Date().toISOString(),
        error: res.error || JSON.stringify(res.data || {}),
      };
    }
    this.saveState();
    return this.state.lastVerifyResult;
  }

  private cacheRubikaMessageMeta(chatId: string, msg: Record<string, unknown>): void {
    const msgId = String(msg.message_id || '');
    if (!chatId || !msgId) return;
    const fObj =
      (msg.file_inline as Record<string, unknown> | undefined) ||
      (msg.file as Record<string, unknown> | undefined);
    const meta = {
      fileId: fObj?.file_id ? String(fObj.file_id) : undefined,
      fileUrl: fObj?.file_url ? String(fObj.file_url) : undefined,
      fileName: fObj?.file_name ? String(fObj.file_name) : undefined,
      text: typeof msg.text === 'string' ? msg.text : undefined,
    };
    if (!meta.fileId && !meta.fileUrl && !meta.text) return;
    const key = `${chatId}:${msgId}`;
    this.rubikaMessageCache.set(key, meta);
    if (this.rubikaMessageCache.size > 400) {
      const oldest = this.rubikaMessageCache.keys().next().value;
      if (oldest) this.rubikaMessageCache.delete(oldest);
    }
  }

  private async resolveRubikaFileIdToUrl(
    fileId: string,
    fileName?: string,
  ): Promise<string | undefined> {
    if (!fileId) return undefined;
    try {
      const res = await this.callRubikaApi('getFile', {file_id: fileId}, true);
      if (!res.ok || !res.data) return undefined;
      const dataObj = (res.data.data as Record<string, unknown>) || res.data;
      const downloadUrl = String(
        dataObj.download_url || dataObj.file_url || dataObj.url || '',
      ).trim();
      if (!downloadUrl) return undefined;

      const extMatch = /\.(mp3|m4a|ogg|wav|aac|webm)$/i.exec(fileName || downloadUrl);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'mp3';
      const voiceDir = path.join(DATA_DIR, 'voice-notes');
      if (!fs.existsSync(voiceDir)) {
        fs.mkdirSync(voiceDir, {recursive: true});
      }
      const safeId = fileId.replace(/[^A-Za-z0-9_-]/g, '').slice(-16) || String(Date.now());
      const outName = `rubika_bot_${safeId}.${ext}`;
      const outPath = path.join(voiceDir, outName);
      if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 256) {
        const dl = await fetch(downloadUrl, {signal: AbortSignal.timeout(15000)});
        if (dl.ok) {
          const buf = Buffer.from(await dl.arrayBuffer());
          if (buf.length > 256) {
            fs.writeFileSync(outPath, buf);
            return `/api/voice-notes/${outName}`;
          }
        }
      } else {
        return `/api/voice-notes/${outName}`;
      }
      return downloadUrl;
    } catch {
      return undefined;
    }
  }

  public startPolling(): BotConfigState {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.state.pollingActive = true;
    this.addLog('POLLING_START', 'info', 'حلقه دریافت پیام‌های زنده روبیکا (getUpdates) فعال شد.');
    this.saveState();

    const pollOnce = async () => {
      if (!this.state.pollingActive || this.isPollingBusy) return;
      this.isPollingBusy = true;
      try {
        const payload: Record<string, unknown> = {limit: 50};
        if (this.pollingOffset) {
          payload.offset_id = this.pollingOffset;
        }
        const res = await this.callRubikaApi('getUpdates', payload, true);
        if (res.ok && res.data) {
          const dataObj = (res.data.data as Record<string, unknown>) || res.data;
          const updates = (dataObj.updates as Array<Record<string, unknown>>) || [];

          if (typeof dataObj.next_offset_id === 'string' && dataObj.next_offset_id) {
            this.pollingOffset = dataObj.next_offset_id;
            if (this.state.rubikaOffsetId !== dataObj.next_offset_id) {
              this.state.rubikaOffsetId = dataObj.next_offset_id;
              this.saveState();
            }
          }

          for (const upd of updates) {
            const outerChatId = typeof upd.chat_id === 'string' ? upd.chat_id : '';
            if (upd.type === 'EventData' && outerChatId) {
              await this.ensureRubikaGroup(outerChatId);
              continue;
            }
            const newMsg = upd.new_message as Record<string, unknown> | undefined;
            if (newMsg) {
              const targetChatId = outerChatId || String(newMsg.chat_id || '');
              this.cacheRubikaMessageMeta(targetChatId, newMsg);
            }
            const msgAux = newMsg?.aux_data as Record<string, unknown> | undefined;
            const hasTextOrBtn =
              newMsg &&
              (typeof newMsg.text === 'string' ||
                (msgAux && typeof msgAux.button_id === 'string' && msgAux.button_id.trim().length > 0));
            if (hasTextOrBtn && newMsg) {
              if (newMsg.sender_type === 'Bot') continue;
              const msgId = String(newMsg.message_id || '');
              if (msgId && this.processedMessageIds.has(msgId)) continue;
              if (msgId) {
                this.processedMessageIds.add(msgId);
                if (this.processedMessageIds.size > 500) {
                  const first = this.processedMessageIds.values().next().value;
                  if (first) this.processedMessageIds.delete(first);
                }
              }
              await this.handleIncomingRubikaUpdate({
                ...newMsg,
                chat_id: outerChatId || String(newMsg.chat_id || ''),
              });
            }
          }
        }
      } finally {
        this.isPollingBusy = false;
      }
    };

    void pollOnce();
    this.pollingTimer = setInterval(() => {
      void pollOnce();
    }, 2200);

    return this.state;
  }

  public stopPolling(): BotConfigState {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.state.pollingActive = false;
    this.addLog('POLLING_STOP', 'info', 'دریافت پیام‌های روبیکا متوقف شد.');
    this.saveState();
    return this.state;
  }

  private isRecentDuplicateCommand(chatId: string, text: string): boolean {
    const key = `${chatId}::${text.trim()}`;
    const now = Date.now();
    const prev = this.recentCommandDedup.get(key);
    if (prev && now - prev < 5000) {
      return true;
    }
    this.recentCommandDedup.set(key, now);
    if (this.recentCommandDedup.size > 120) {
      for (const [k, ts] of this.recentCommandDedup.entries()) {
        if (now - ts > 10000) this.recentCommandDedup.delete(k);
      }
    }
    return false;
  }

  public async handleIncomingRubikaUpdate(rawMsg: Record<string, unknown>): Promise<void> {
    const chatId = String(rawMsg.chat_id || '');
    const senderId = String(rawMsg.sender_id || 'rubika_user');
    const auxData = rawMsg.aux_data as Record<string, unknown> | undefined;
    const buttonId = auxData?.button_id ? String(auxData.button_id) : '';
    const rawText = String(rawMsg.text || '').trim();
    const text = rawText || buttonId;
    const messageId = String(rawMsg.message_id || '');
    if (!chatId || !text) return;

    if (this.isRecentDuplicateCommand(chatId, text)) return;

    const group = await this.ensureRubikaGroup(chatId, senderId);

    const replyToObj = rawMsg.reply_to_message as Record<string, unknown> | undefined;
    const directReplyId =
      typeof rawMsg.reply_to_message_id === 'string' ? rawMsg.reply_to_message_id : undefined;
    const replyToId = replyToObj ? String(replyToObj.message_id || '') : directReplyId;
    const cachedReply = replyToId ? this.rubikaMessageCache.get(`${chatId}:${replyToId}`) : undefined;

    const replyFile =
      (replyToObj?.file_inline as Record<string, unknown> | undefined) ||
      (replyToObj?.file as Record<string, unknown> | undefined) ||
      (rawMsg.file_inline as Record<string, unknown> | undefined) ||
      (rawMsg.file as Record<string, unknown> | undefined);
    const replyTextStr = replyToObj?.text
      ? String(replyToObj.text)
      : cachedReply?.text || '';
    const replyUrlFromText = replyTextStr.match(/https?:\/\/\S+/i)?.[0];

    let resolvedAudioUrl = replyFile?.file_url
      ? String(replyFile.file_url)
      : cachedReply?.fileUrl || replyUrlFromText;
    const resolvedFileId = replyFile?.file_id
      ? String(replyFile.file_id)
      : cachedReply?.fileId;
    const resolvedFileName = replyFile?.file_name
      ? String(replyFile.file_name)
      : cachedReply?.fileName;

    if (!resolvedAudioUrl && resolvedFileId) {
      resolvedAudioUrl = await this.resolveRubikaFileIdToUrl(resolvedFileId, resolvedFileName);
    }

    await this.executeCommand({
      groupId: group.groupId,
      senderId,
      senderName: String(rawMsg.sender_name || `کاربر روبیکا (${senderId.slice(0, 6)})`),
      text,
      replyToMessageId: replyToId,
      replyToSenderId: replyToObj ? String(replyToObj.sender_id || '') : undefined,
      replyToAudioUrl: resolvedAudioUrl,
      replyToTitle: resolvedFileName,
      sendToRubika: true,
      rubikaReplyMessageId: messageId,
    });
  }

  public async handleUserbotIncomingMessage(params: {
    chatGuid: string;
    chatTitle?: string;
    messageId?: string;
    senderId?: string;
    senderName?: string;
    senderUsername?: string;
    senderIsAdmin?: boolean;
    isSelfAccount?: boolean;
    text: string;
    replyToMessageId?: string;
    replyToSenderId?: string;
    replyToSenderName?: string;
    replyToAudioUrl?: string;
    replyToTitle?: string;
    deferAdminExec?: boolean;
  }): Promise<{
    duplicate: boolean;
    botMessage?: ChatMessage | null;
    group?: GroupState;
    deferredAdminAction?: {
      rubikaChatId: string;
      targetUserId: string;
      targetName: string;
      adminAction: 'SetAdmin' | 'UnsetAdmin';
    };
  }> {
    const msgId = (params.messageId || '').trim();
    const isLocalReplyVoiceNote = Boolean(
      params.replyToAudioUrl && params.replyToAudioUrl.startsWith('/api/voice-notes/'),
    );
    if (msgId && this.processedMessageIds.has(msgId) && !isLocalReplyVoiceNote) {
      return {duplicate: true};
    }
    if (!isLocalReplyVoiceNote && this.isRecentDuplicateCommand(params.chatGuid, params.text)) {
      return {duplicate: true};
    }
    if (msgId) {
      this.processedMessageIds.add(msgId);
      if (this.processedMessageIds.size > 500) {
        const first = this.processedMessageIds.values().next().value;
        if (first) this.processedMessageIds.delete(first);
      }
    }

    let group = Object.values(this.state.groups).find(
      (g) => g.rubikaChatId === params.chatGuid,
    );
    if (!group) {
      const placeholder = this.state.groups['g_main_rubika'];
      if (placeholder && placeholder.rubikaChatId === 'g0D8xP912RubikaMain') {
        placeholder.rubikaChatId = params.chatGuid;
        placeholder.chatType = params.chatGuid.startsWith('c0') ? 'channel' : 'group';
        if (params.chatTitle?.trim()) {
          placeholder.title = params.chatTitle.trim();
        }
        this.state.activeGroupId = placeholder.groupId;
        this.saveState();
        group = placeholder;
      } else {
        const isChan = params.chatGuid.startsWith('c0');
        group = this.addOrUpdateGroup({
          title: params.chatTitle?.trim() || `${isChan ? 'کانال' : 'گروه'} روبیکا (${params.chatGuid.slice(0, 8)})`,
          rubikaChatId: params.chatGuid,
          chatType: isChan ? 'channel' : 'group',
        });
      }
    }

    const cleanSenderUname = (params.senderUsername || '').trim();
    const creatorUname = (this.state.creatorUsername || DEFAULT_CREATOR_USERNAME).trim();
    const matchesCreatorUsername = Boolean(
      cleanSenderUname &&
        creatorUname &&
        cleanSenderUname.replace(/^@+/, '').toLowerCase() ===
          creatorUname.replace(/^@+/, '').toLowerCase(),
    );

    if (params.senderId && params.senderId !== 'rubika_user') {
      const sid = params.senderId.trim();
      const sName = params.senderName?.trim();
      if (matchesCreatorUsername && sid.startsWith('u0') && this.state.creatorRubikaGuid !== sid) {
        this.state.creatorRubikaGuid = sid;
        this.addLog('CREATOR_VERIFIED', 'ok', `هویت سازنده ${creatorUname} با شناسه ${sid} تایید و ذخیره شد.`);
      }
      const isCreatorUser = this.isCreatorIdentity(sid, cleanSenderUname);
      const existingMember = group.members.find((m) => m.userId === sid);
      const inferredRole: UserRole = isCreatorUser
        ? 'creator'
        : params.isSelfAccount
          ? 'owner'
          : params.senderIsAdmin
            ? 'admin'
            : 'member';
      if (existingMember) {
        if (sName && !sName.startsWith('u0')) {
          existingMember.name = sName;
        }
        if (cleanSenderUname) {
          existingMember.username = cleanSenderUname;
        }
        if (isCreatorUser) {
          existingMember.role = 'creator';
        } else if (existingMember.role !== 'creator') {
          if (params.isSelfAccount) {
            existingMember.role = 'owner';
          } else if (params.senderIsAdmin && (existingMember.role === 'member' || existingMember.role === 'vip')) {
            existingMember.role = 'admin';
          }
        }
      } else {
        group.members.push({
          userId: sid,
          name: sName || `کاربر روبیکا (${sid.slice(0, 6)})`,
          ...(cleanSenderUname ? {username: cleanSenderUname} : {}),
          role: inferredRole,
          joinedAt: new Date().toISOString(),
        });
      }
      this.saveState();
    }

    if (params.replyToSenderId && params.replyToSenderName?.trim()) {
      const rid = params.replyToSenderId.trim();
      const rName = params.replyToSenderName.trim();
      const existingReplyMember = group.members.find((m) => m.userId === rid);
      if (existingReplyMember) {
        if (!rName.startsWith('u0')) {
          existingReplyMember.name = rName;
        }
      } else {
        group.members.push({
          userId: rid,
          name: rName,
          role: 'member',
          joinedAt: new Date().toISOString(),
        });
      }
    }

    const res = await this.executeCommand({
      groupId: group.groupId,
      senderId: params.senderId || this.state.creatorId,
      senderName: params.senderName,
      senderUsername: cleanSenderUname || undefined,
      text: params.text,
      replyToMessageId: params.replyToMessageId,
      replyToSenderId: params.replyToSenderId,
      replyToSenderName: params.replyToSenderName,
      replyToAudioUrl: params.replyToAudioUrl,
      replyToTitle: params.replyToTitle,
      sendToRubika: false,
      deferAdminExec: params.deferAdminExec,
    });
    return {
      duplicate: false,
      botMessage: res.botMessage,
      group: res.group,
      deferredAdminAction: res.deferredAdminAction,
    };
  }

  private isCreatorIdentity(userId?: string, username?: string): boolean {
    const uid = (userId || '').trim();
    const uname = (username || '').trim().replace(/^@+/, '').toLowerCase();
    const creatorUname = (this.state.creatorUsername || DEFAULT_CREATOR_USERNAME)
      .trim()
      .replace(/^@+/, '')
      .toLowerCase();
    if (uid && uid === this.state.creatorId) return true;
    if (uid && this.state.creatorRubikaGuid && uid === this.state.creatorRubikaGuid) return true;
    if (uname && creatorUname && uname === creatorUname) return true;
    for (const sudo of this.state.sudoUserIds || []) {
      const sClean = sudo.trim();
      if (!sClean) continue;
      if (uid && sClean === uid) return true;
      if (uname && sClean.replace(/^@+/, '').toLowerCase() === uname) return true;
    }
    return false;
  }

  private getMemberRole(group: GroupState, userId: string, username?: string): UserRole {
    if (this.isCreatorIdentity(userId, username)) return 'creator';
    if (group.ownerId === userId) return 'owner';
    const member = group.members.find((m) => m.userId === userId);
    if (member?.username && this.isCreatorIdentity(member.userId, member.username)) return 'creator';
    return member?.role || 'member';
  }

  private getRoleTitleFa(role: UserRole): string {
    switch (role) {
      case 'creator':
        return `سازنده ربات (${this.state.creatorUsername || this.state.creatorName})`;
      case 'owner':
        return 'مالک گروه';
      case 'admin':
        return 'ادمین گروه';
      case 'vip':
        return 'کاربر ویژه';
      default:
        return 'کاربر عادی';
    }
  }

  private formatTrackInfo(track: Track): string {
    return `${track.title} — ${track.artist}`;
  }

  private pushHistory(group: GroupState, track: Track | null): void {
    if (!track) return;
    group.history = [...group.history.filter((t) => t.id !== track.id), track].slice(-30);
  }

  private recordTrackPlay(group: GroupState, track: Track | null): void {
    if (!track) return;
    const evt: PlaybackAnalyticsEvent = {
      id: `play_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      mood: track.mood,
      source: track.source,
      requestedBy: track.requestedBy || 'کاربر',
      timestamp: new Date().toISOString(),
    };
    group.playbackEvents = [...(group.playbackEvents || []), evt].slice(-500);
  }

  private getTodayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private getDailyQuota(group: GroupState): {count: number; limit: number} {
    const today = this.getTodayKey();
    if (group.dailyPlayDate !== today) {
      group.dailyPlayDate = today;
      group.dailyPlayCount = 0;
    }
    const resolvedLimit = group.dailyPlayLimit ?? this.state.globalDailyPlayLimit ?? 10;
    return {
      count: group.dailyPlayCount || 0,
      limit: resolvedLimit === 0 ? 9999 : resolvedLimit,
    };
  }

  private incrementDailyQuota(group: GroupState): {count: number; limit: number} {
    const today = this.getTodayKey();
    if (group.dailyPlayDate !== today) {
      group.dailyPlayDate = today;
      group.dailyPlayCount = 0;
    }
    group.dailyPlayCount = (group.dailyPlayCount || 0) + 1;
    const resolvedLimit = group.dailyPlayLimit ?? this.state.globalDailyPlayLimit ?? 10;
    return {
      count: group.dailyPlayCount,
      limit: resolvedLimit === 0 ? 9999 : resolvedLimit,
    };
  }

  private buildRubikaKeypad(menu: 'main' | 'help'): Record<string, unknown> {
    const btn = (id: string, text: string) => ({
      id,
      type: 'Simple',
      button_text: text,
    });

    if (menu === 'help') {
      return {
        rows: [
          {buttons: [btn('btn_locks', 'قفل‌ها 🔒'), btn('btn_admins', 'مدیران 🛡️'), btn('btn_install', 'نصب 📦')]},
          {buttons: [btn('btn_mute', 'سکوت 🔇'), btn('btn_warn', 'اخطار ⚠️'), btn('btn_violations', 'تخلفات 🚨')]},
          {buttons: [btn('btn_stats', 'آمار 📊'), btn('btn_clean', 'پاکسازی 🧹'), btn('btn_kill', 'Kill ⚔️')]},
          {buttons: [btn('btn_tips', 'نکات 📝'), btn('btn_filter', 'فیلتر 🔍'), btn('btn_fun', 'سرگرمی 🎭')]},
          {buttons: [btn('btn_back_menu', 'بازگشت به منو 🔙')]},
        ],
        resize_keyboard: true,
        on_time_keyboard: false,
      };
    }

    return {
      rows: [
        {buttons: [btn('btn_help', 'راهنمای جامع 📚'), btn('btn_play', 'پخش آهنگ 🎵'), btn('btn_call', 'ویسکال 📞')]},
        {buttons: [btn('btn_join_vc', 'پیوستن به ویسکال 🎧'), btn('btn_playlists', 'پلی‌لیست‌ها 🎶'), btn('btn_queue', 'صف پخش 📋')]},
        {buttons: [btn('btn_status', 'وضعیت اشتراک 🔐'), btn('btn_stats', 'آمار 📊'), btn('btn_install', 'نصب 📦')]},
      ],
      resize_keyboard: true,
      on_time_keyboard: false,
    };
  }

  private buildVoiceCallJoinInlineKeypad(): Record<string, unknown> {
    return {
      rows: [
        {
          buttons: [
            {id: 'btn_join_vc', type: 'Simple', button_text: 'پیوستن به ویسکال 🎧'},
            {id: 'btn_play', type: 'Simple', button_text: 'پخش آهنگ 🎵'},
          ],
        },
      ],
    };
  }

  private buildVoiceJoinUrl(groupId: string): string | null {
    const base = (this.state.publicBaseUrl || '').trim();
    if (!base) return null;
    return `${base}/?joinCall=${encodeURIComponent(groupId)}&openVoice=1`;
  }

  private normalizePlaylistCmd(input: string): string {
    return input.replace(/\u200c/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private findPlaylistByName(group: GroupState, nameQuery: string): CustomPlaylist | undefined {
    const lists = group.customPlaylists || [];
    const target = this.normalizePlaylistCmd(nameQuery).toLowerCase();
    if (!target) return undefined;
    return (
      lists.find((p) => this.normalizePlaylistCmd(p.name).toLowerCase() === target) ||
      lists.find((p) => this.normalizePlaylistCmd(p.name).toLowerCase().includes(target))
    );
  }

  private stripEmojiCmd(text: string): string {
    return text
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '')
      .replace(/^[«»\s]+|[«»\s]+$/g, '')
      .replace(/\s+[«»]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  public async executeCommand(params: {
    groupId: string;
    senderId: string;
    senderName?: string;
    senderUsername?: string;
    text: string;
    replyToMessageId?: string;
    replyToSenderId?: string;
    replyToSenderName?: string;
    replyToAudioUrl?: string;
    replyToTitle?: string;
    sendToRubika?: boolean;
    rubikaReplyMessageId?: string;
    allowBroadcastText?: boolean;
    deferAdminExec?: boolean;
  }): Promise<{
    group: GroupState;
    userMessage: ChatMessage;
    botMessage: ChatMessage | null;
    searchResults?: Track[];
    uiAction?: 'open_voice_panel';
    deferredAdminAction?: {
      rubikaChatId: string;
      targetUserId: string;
      targetName: string;
      adminAction: 'SetAdmin' | 'UnsetAdmin';
    };
  }> {
    const group =
      this.state.groups[params.groupId] ||
      this.state.groups[this.state.activeGroupId] ||
      Object.values(this.state.groups)[0];
    if (!group) {
      throw new Error('هیچ گروه یا کانالی در ربات ثبت نشده است.');
    }
    const senderRole = this.getMemberRole(group, params.senderId, params.senderUsername);
    const memberRecord = (group.members || []).find((m) => m.userId === params.senderId);
    const senderName = params.senderName || memberRecord?.name || `کاربر ${params.senderId}`;
    const trimmed = params.text.trim();
    const nowIso = new Date().toISOString();

    let replyMsgObj: ChatMessage | undefined;
    if (params.replyToMessageId) {
      replyMsgObj = group.messages.find((m) => m.id === params.replyToMessageId);
    }

    const userMessage: ChatMessage = {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      groupId: group.groupId,
      senderId: params.senderId,
      senderName,
      senderRole,
      text: trimmed,
      isBot: false,
      replyToMessageId: params.replyToMessageId,
      replyPreview: replyMsgObj ? `${replyMsgObj.senderName}: ${replyMsgObj.text.slice(0, 48)}` : undefined,
      timestamp: nowIso,
    };
    group.messages = [...group.messages, userMessage].slice(-120);

    let replyText = '';
    let botAudioAttachment: ChatMessage['audioAttachment'] | undefined;
    let searchResults: Track[] | undefined;
    let systemBannerText: string | undefined;
    let uiAction: 'open_voice_panel' | undefined;
    let deferredAdminAction:
      | {
          rubikaChatId: string;
          targetUserId: string;
          targetName: string;
          adminAction: 'SetAdmin' | 'UnsetAdmin';
        }
      | undefined;
    let customInlineKeypad: Record<string, unknown> | undefined;
    const wasCallActiveBefore = Boolean(group.voiceCallActive);

    const cmd = this.stripEmojiCmd(trimmed);
    const cmdLower = cmd.toLowerCase();
    const plNormalized = this.normalizePlaylistCmd(cmd);

    const replyTargetSenderId = params.replyToSenderId || replyMsgObj?.senderId;
    const replyTargetAudioUrl =
      params.replyToAudioUrl ||
      replyMsgObj?.audioAttachment?.url ||
      (replyMsgObj?.text.match(/https?:\/\/\S+/i)?.[0] ?? undefined);
    const replyTargetTitle =
      params.replyToTitle || replyMsgObj?.audioAttachment?.title || 'فایل صوتی ریپلای شده';

    const hasMusicAccess =
      group.publicAccess === 'open' || ['creator', 'owner', 'admin', 'vip'].includes(senderRole);

    const creatorTag = this.state.creatorUsername || DEFAULT_CREATOR_USERNAME;
    const isCreatorCmdMatch =
      ['پنل سازنده', 'پنل', 'دستورات سازنده', 'منوی سازنده', 'ربات خاموش', 'خاموش کردن ربات', 'حالت تعمیرات', 'ربات روشن', 'روشن کردن ربات', 'اشتراک نامحدود', 'سهمیه نامحدود', 'قطع همه ویسکال ها', 'قطع همه کال ها', 'قطع همه ویسکال‌ها', 'آمار کل'].includes(cmd) ||
      /^(?:تمدید\s*اشتراک|تنظیم\s*سهمیه|ارسال\s*همگانی|افزودن\s*سودو|حذف\s*سودو)\s+.+$/s.test(cmd);

    // -1. Global Bot Maintenance Gate (creator always bypasses)
    if (this.state.botEnabled === false && senderRole !== 'creator') {
      replyText = `🔌 ربات در حال حاضر توسط سازنده (${creatorTag}) در حالت تعمیرات موقت قرار دارد.`;
    } else if (isCreatorCmdMatch) {
      if (senderRole !== 'creator') {
        replyText = `⛔ این دستور فقط مخصوص سازنده ربات (${creatorTag}) است.`;
      } else if (['پنل سازنده', 'پنل', 'دستورات سازنده', 'منوی سازنده'].includes(cmd)) {
        const allGroups = Object.values(this.state.groups);
        const vcActiveCount = allGroups.filter((g) => g.voiceCallActive).length;
        const chanCount = allGroups.filter(
          (g) => g.chatType === 'channel' || g.rubikaChatId.startsWith('c0'),
        ).length;
        const grpCount = allGroups.filter((g) => g.rubikaChatId.startsWith('g0')).length;
        const daysLeft = Math.max(
          0,
          Math.ceil((new Date(group.subscription.expiresAt).getTime() - Date.now()) / 86400000),
        );
        replyText = [
          `👑 پنل سازنده ربات موزیکال (${creatorTag})`,
          `• وضعیت ربات: ${this.state.botEnabled === false ? 'خاموش (تعمیرات)' : 'روشن و آنلاین ✅'}`,
          `• گروه‌ها: ${grpCount} | کانال‌ها: ${chanCount} | ویسکال فعال: ${vcActiveCount}`,
          `• گروه فعلی: «${group.title}» (${daysLeft} روز اشتراک | سهمیه: ${group.dailyPlayLimit ?? this.state.globalDailyPlayLimit ?? 10})`,
          '━━━━━━━━━━━━━━━',
          '🎛 دستورات اختصاصی سازنده:',
          '• تنظیم مالک (با ریپلای)',
          '• تنظیم مدیر / حذف مدیر (@آیدی یا ریپلای)',
          '• تمدید اشتراک 30 | اشتراک نامحدود',
          '• سهمیه نامحدود | تنظیم سهمیه 50',
          '• ارسال همگانی {متن پیام}',
          '• ربات خاموش | ربات روشن',
          '• قطع همه ویسکال ها | آمار کل',
          '• افزودن سودو @آیدی | حذف سودو @آیدی',
        ].join('\n');
      } else if (['ربات خاموش', 'خاموش کردن ربات', 'حالت تعمیرات'].includes(cmd)) {
        this.state.botEnabled = false;
        this.saveState();
        replyText = '🔌 وضعیت ربات روی «خاموش (حالت تعمیرات)» قرار گرفت. فقط دستورات سازنده اجرا می‌شوند.';
      } else if (['ربات روشن', 'روشن کردن ربات'].includes(cmd)) {
        this.state.botEnabled = true;
        this.saveState();
        replyText = '🔌 وضعیت ربات دوباره «روشن و فعال ✅» شد.';
      } else if (cmd === 'اشتراک نامحدود') {
        this.updateGroupCreatorSettings(group.groupId, {setUnlimited: true});
        replyText = `💳 اشتراک گروه «${group.title}» به صورت دائمی و نامحدود (۳۶۵۰ روز) فعال شد ✅`;
      } else if (/^تمدید\s*اشتراک\s+([0-9۰-۹٠-٩]+)$/.test(cmd)) {
        const m = /^تمدید\s*اشتراک\s+([0-9۰-۹٠-٩]+)$/.exec(cmd)!;
        const days = Math.max(1, Number(this.normalizeDigits(m[1])) || 30);
        this.updateGroupCreatorSettings(group.groupId, {addDays: days});
        replyText = `💳 اشتراک گروه «${group.title}» به مدت ${days} روز دیگر تمدید شد ✅`;
      } else if (cmd === 'سهمیه نامحدود') {
        this.updateGroupCreatorSettings(group.groupId, {dailyPlayLimit: 9999});
        replyText = `📊 سهمیه پخش روزانه گروه «${group.title}» نامحدود شد ✅`;
      } else if (/^تنظیم\s*سهمیه\s+([0-9۰-۹٠-٩]+)$/.test(cmd)) {
        const m = /^تنظیم\s*سهمیه\s+([0-9۰-۹٠-٩]+)$/.exec(cmd)!;
        const lim = Math.max(1, Number(this.normalizeDigits(m[1])) || 10);
        this.updateGroupCreatorSettings(group.groupId, {dailyPlayLimit: lim});
        replyText = `📊 سهمیه پخش روزانه گروه «${group.title}» روی ${lim} آهنگ در روز تنظیم شد.`;
      } else if (/^ارسال\s*همگانی\s+(.+)$/s.test(cmd)) {
        const m = /^ارسال\s*همگانی\s+(.+)$/s.exec(cmd)!;
        const bcRes = await this.broadcastToAllGroups({text: m[1].trim(), targetScope: 'all'});
        replyText = `📢 ارسال همگانی انجام شد:\n• ارسال موفق: ${bcRes.sentCount}\n• ناموفق: ${bcRes.failedCount}`;
      } else if (['قطع همه ویسکال ها', 'قطع همه ویسکال‌ها', 'قطع همه کال ها'].includes(cmd)) {
        const stopRes = this.stopAllVoiceCalls();
        replyText = `🛑 تعداد ${stopRes.stoppedCount} ویسکال فعال در تمام گروه‌ها و کانال‌ها قطع شد.`;
      } else if (cmd === 'آمار کل') {
        const allGroups = Object.values(this.state.groups);
        const totalMembers = allGroups.reduce((acc, g) => acc + g.members.length, 0);
        const totalActiveVc = allGroups.filter((g) => g.voiceCallActive).length;
        const totalTracks = musicCatalog.getStats().total;
        replyText = [
          `🌐 آمار کل ربات (${creatorTag})`,
          `• تعداد کل چت‌های متصل: ${allGroups.length}`,
          `• ویسکال‌های فعال همزمان: ${totalActiveVc}`,
          `• مجموع اعضای ثبت‌شده: ${totalMembers} نفر`,
          `• بانک آهنگ کاتالوگ: ${totalTracks} آهنگ`,
          `• وضعیت اتصال Userbot: ${this.state.userbotStatus?.connected ? 'متصل ✅' : 'آفلاین'}`,
        ].join('\n');
      } else if (/^افزودن\s*سودو\s+(.+)$/.test(cmd)) {
        const m = /^افزودن\s*سودو\s+(.+)$/.exec(cmd)!;
        this.addOrRemoveSudoUser('add', m[1].trim());
        replyText = `👑 دسترسی همکار سازنده (Sudo) برای «${m[1].trim()}» فعال شد ✅`;
      } else if (/^حذف\s*سودو\s+(.+)$/.test(cmd)) {
        const m = /^حذف\s*سودو\s+(.+)$/.exec(cmd)!;
        this.addOrRemoveSudoUser('remove', m[1].trim());
        replyText = `🗑 دسترسی Sudo برای «${m[1].trim()}» حذف شد.`;
      }
    }
    // 0. Rubika Reply Keyboard Navigation: بازگشت به منو / راهنمای جامع / /get
    else if (
      cmd === 'بازگشت به منو' ||
      cmd === 'منو' ||
      cmd === 'منوی اصلی' ||
      cmdLower === '/menu' ||
      cmdLower === 'btn_back_menu'
    ) {
      group.activeKeypadMenu = 'main';
      replyText = 'به منوی اصلی بازگشتید: 👋';
    } else if (
      cmd === 'راهنمای جامع' ||
      cmd === 'راهنما' ||
      cmd === 'راهنمای ربات' ||
      cmd === 'راهنمای ربات موزیکال' ||
      cmdLower === '/help' ||
      /^\/start(@\S+)?$/i.test(cmd) ||
      cmdLower === 'btn_help'
    ) {
      group.activeKeypadMenu = 'help';
      replyText = [
        'راهنمای جامع ربات 📚',
        '',
        'برای مطالعه آموزش هر بخش، روی دکمه مربوطه کلیک کنید:',
        '━━━━━━━━━━━━━━━',
      ].join('\n');
    } else if (
      ['#موزیکال', 'موزیکال', 'دستور جدید بتمن', 'دستورات بتمن', 'بتمن'].includes(cmdLower) ||
      cmd.startsWith('دستور جدید بتمن')
    ) {
      replyText = [
        '🦇 دستور جدید بتمن #موزیکال',
        '',
        '• قطع آهنگ «',
        '• قطع کال «',
        '• کال «',
        '• پخش آهنگ تتلو جدید «',
        '• دانلود آهنگ تتلو جدید «',
        '  (هر آهنگی بخاید میاره، فقط نام آهنگ یا خواننده را بنویسید)',
        '• حذف 100 «',
        '  (برای حذف پیام باید بات کمکی بیارید: ورود موزیک لینک گپتون)',
        '',
        `🔗 لینک گپ پشتیبانی بتمن برای رفع مشکلات شما:`,
        group.inviteLink || DEFAULT_GROUP_INVITE_LINK,
      ].join('\n');
    } else if (
      /^(ورود\s*موزیک|ورود\s*بات|ورود\s*کمکی|ورود\s*گروه|ورود\s*کانال|عضویت\s*کانال|کال\s*کانال|ویسکال\s*کانال|پخش\s*در\s*کانال|پخش\s*تو\s*کانال)\s+(.+)$/s.test(cmd) ||
      /(?:https?:\/\/)?rubika\.ir\/(?:joing|joinc)\/[A-Za-z0-9_\-]+/i.test(cmd) ||
      /(?:https?:\/\/)?rubika\.ir\/[A-Za-z0-9_]{3,}/i.test(cmd) ||
      /^(?:کال(?:\s+بزار|\s+بذار|\s+بزن)?|ویسکال|شروع\s*ویسکال|ساخت\s*کال)\s+@[A-Za-z0-9_]{3,}/.test(cmd) ||
      /^(?:پخش(?:\s+آهنگ|\s+موزیک)?)\s+.*@[A-Za-z0-9_]{3,}/.test(cmd) ||
      ((group.rubikaChatId.startsWith('b0') ||
        group.rubikaChatId.startsWith('u0') ||
        !params.sendToRubika ||
        ['creator', 'owner', 'admin'].includes(senderRole)) &&
        (/^@[A-Za-z0-9_]{3,}$/.test(cmd) || /\b(?:c0|g0)[A-Za-z0-9]{15,}\b/.test(cmd)))
    ) {
      const extracted = this.extractJoinTarget(cmd);
      const isBareAtMentionInGroup =
        /^@[A-Za-z0-9_]{3,}$/.test(cmd) &&
        group.rubikaChatId.startsWith('g0') &&
        Boolean(params.sendToRubika);
      if (extracted) {
        const songQueryRaw = cmd
          .replace(extracted, ' ')
          .replace(
            /^(?:ورود\s*موزیک|ورود\s*بات|ورود\s*کمکی|ورود\s*گروه|ورود\s*کانال|عضویت\s*کانال|کال\s*کانال|ویسکال\s*کانال|پخش\s*در\s*کانال|پخش\s*تو\s*کانال|کال(?:\s+بزار|\s+بذار|\s+بزن)?|ویسکال|شروع\s*ویسکال|ساخت\s*کال|پخش\s*آهنگ|پخش\s*موزیک|پخش)\b/i,
            '',
          )
          .replace(/\b(?:در|تو|داخل|به|بزار|بذار|بزن)\b/g, ' ')
          .trim();
        const songQuery = songQueryRaw.length >= 2 ? songQueryRaw : undefined;

        const joinOut = await this.joinRubikaTarget(extracted, {
          sourceGroupId: group.groupId,
          autoPlayInCall: true,
          songQuery,
          requestedBy: senderName,
        });
        if (joinOut.ok && joinOut.group) {
          const kindLabel = joinOut.chatType === 'channel' ? 'کانال' : 'گروه';
          const track = joinOut.startedTrack || joinOut.group.currentTrack;
          if (track) {
            botAudioAttachment = {
              title: track.title,
              artist: track.artist,
              url: track.streamUrl,
              durationSec: track.durationSec,
            };
          }
          replyText = [
            `✅ ربات وارد ${kindLabel} «${joinOut.group.title}» شد و ویس‌چت را باز کرد!`,
            `🆔 شناسه: ${joinOut.group.rubikaChatId}`,
            track
              ? `🎶 پخش زنده در کال آغاز شد:\n🎵 ${this.formatTrackInfo(track)}`
              : `📞 ویسکال ${kindLabel} فعال و آماده پخش شد.`,
          ].join('\n');
        } else if (
          !isBareAtMentionInGroup ||
          joinOut.queued ||
          (joinOut.error &&
            !joinOut.error.includes('مربوط به کانال یا گروه') &&
            !joinOut.error.includes('پیدا نشد'))
        ) {
          replyText = [
            `🔗 هدف ثبت شد: ${extracted}`,
            `⚠️ ${joinOut.error || 'برای عضویت خودکار، ابتدا اکانت Userbot را در تب اتصال روبیکا متصل کنید.'}`,
          ].join('\n');
        }
      }
    } else if (
      /^(?:حذف|حذف\s+پیام|حذف\s+پیام‌ها|حذف\s+پیامها|پاکسازی)\s+([0-9۰-۹٠-٩]+)$/.test(cmd)
    ) {
      if (!['creator', 'owner', 'admin'].includes(senderRole)) {
        replyText = '⛔ فقط مالک، ادمین‌ها یا سازنده ربات می‌توانند پیام‌ها را حذف کنند.';
      } else {
        const m = cmd.match(/([0-9۰-۹٠-٩]+)$/);
        const rawNum = Number(this.normalizeDigits(m?.[1] || '10'));
        const count = Math.max(1, Math.min(200, Number.isFinite(rawNum) ? rawNum : 10));
        const beforeLen = group.messages.length;
        const sliceKeep = Math.max(0, group.messages.length - count);
        group.messages = group.messages.slice(0, sliceKeep);
        const removedLocal = Math.max(0, beforeLen - group.messages.length);

        const helperConnected = Boolean(this.state.userbotStatus?.connected);
        const hasRealGroupGuid = this.isRealGroupGuid(group.rubikaChatId);

        if (helperConnected && hasRealGroupGuid) {
          this.enqueueVoiceCallTask({
            action: 'delete_messages',
            groupId: group.groupId,
            rubikaChatId: group.rubikaChatId,
            deleteCount: count,
          });
          replyText = `🧹 تعداد ${count} پیام اخیر در روبیکا توسط مدیر کمکی پاکسازی شد ✅`;
        } else {
          replyText = [
            `🧹 ${removedLocal} پیام اخیر در کنسول گروه پاکسازی شد.`,
            '⚠️ برای حذف واقعی پیام‌ها داخل گروه روبیکا باید اکانت Userbot متصل باشد:',
            `ورود موزیک ${group.inviteLink || DEFAULT_GROUP_INVITE_LINK}`,
          ].join('\n');
        }
      }
    } else if (cmd === 'حذف' && params.replyToMessageId) {
      if (!['creator', 'owner', 'admin'].includes(senderRole)) {
        replyText = '⛔ فقط مالک، ادمین یا سازنده ربات می‌تواند پیام را حذف کند.';
      } else {
        group.messages = group.messages.filter((m) => m.id !== params.replyToMessageId);
        if (this.isRealGroupGuid(group.rubikaChatId)) {
          this.enqueueVoiceCallTask({
            action: 'delete_single_message',
            groupId: group.groupId,
            rubikaChatId: group.rubikaChatId,
            messageId: params.replyToMessageId,
          });
        }
        replyText = '🗑 پیام انتخاب‌شده در گروه روبیکا حذف شد ✅';
      }
    } else if (['بن', 'اخراج', 'ریمو', 'مسدود'].includes(cmd)) {
      if (!['creator', 'owner', 'admin'].includes(senderRole)) {
        replyText = '⛔ فقط مالک، ادمین یا سازنده ربات می‌تواند کاربر را اخراج کند.';
      } else if (!replyTargetSenderId) {
        replyText = '⚠ روی پیام کاربر مورد نظر ریپلای کنید و بنویسید: بن';
      } else {
        const targetName =
          group.members.find((m) => m.userId === replyTargetSenderId)?.name ||
          replyMsgObj?.senderName ||
          replyTargetSenderId;
        if (this.isRealGroupGuid(group.rubikaChatId) && group.rubikaChatId.startsWith('g0')) {
          this.enqueueVoiceCallTask({
            action: 'ban_member',
            groupId: group.groupId,
            rubikaChatId: group.rubikaChatId,
            targetUserId: replyTargetSenderId,
          });
          if (params.replyToMessageId) {
            this.enqueueVoiceCallTask({
              action: 'delete_single_message',
              groupId: group.groupId,
              rubikaChatId: group.rubikaChatId,
              messageId: params.replyToMessageId,
            });
          }
        }
        group.violationLogs = [
          {
            id: `viol_${Date.now()}`,
            userId: replyTargetSenderId,
            userName: targetName,
            reason: 'اخراج دستی توسط مدیر',
            actionTaken: 'مسدودسازی و حذف از گروه روبیکا',
            timestamp: nowIso,
          },
          ...(group.violationLogs || []),
        ].slice(0, 50);
        replyText = `🚫 کاربر «${targetName}» از گروه روبیکا اخراج/مسدود شد ✅`;
      }
    } else if (['آنبن', 'رفع مسدودی', 'آزاد'].includes(cmd)) {
      if (!['creator', 'owner', 'admin'].includes(senderRole)) {
        replyText = '⛔ فقط مالک، ادمین یا سازنده ربات می‌تواند مسدودی را رفع کند.';
      } else if (!replyTargetSenderId) {
        replyText = '⚠ روی پیام کاربر ریپلای کنید و بنویسید: آنبن';
      } else {
        if (this.isRealGroupGuid(group.rubikaChatId) && group.rubikaChatId.startsWith('g0')) {
          this.enqueueVoiceCallTask({
            action: 'unban_member',
            groupId: group.groupId,
            rubikaChatId: group.rubikaChatId,
            targetUserId: replyTargetSenderId,
          });
        }
        replyText = `✅ مسدودی کاربر (${replyTargetSenderId}) در گروه رفع شد.`;
      }
    } else if (['پین', 'سنجاق'].includes(cmd)) {
      if (!['creator', 'owner', 'admin'].includes(senderRole)) {
        replyText = '⛔ فقط مدیران مجاز به سنجاق کردن پیام هستند.';
      } else if (!params.replyToMessageId) {
        replyText = '⚠ روی پیام مورد نظر ریپلای کنید و بنویسید: پین';
      } else {
        if (this.isRealGroupGuid(group.rubikaChatId)) {
          this.enqueueVoiceCallTask({
            action: 'pin_message',
            groupId: group.groupId,
            rubikaChatId: group.rubikaChatId,
            messageId: params.replyToMessageId,
          });
        }
        replyText = '📌 پیام انتخاب‌شده در گروه سنجاق (Pin) شد ✅';
      }
    } else if (['حذف پین', 'برداشتن پین', 'لغو سنجاق'].includes(cmd)) {
      if (!['creator', 'owner', 'admin'].includes(senderRole)) {
        replyText = '⛔ فقط مدیران مجاز به برداشتن سنجاق هستند.';
      } else if (!params.replyToMessageId) {
        replyText = '⚠ روی پیام سنجاق‌شده ریپلای کنید و بنویسید: حذف پین';
      } else {
        if (this.isRealGroupGuid(group.rubikaChatId)) {
          this.enqueueVoiceCallTask({
            action: 'unpin_message',
            groupId: group.groupId,
            rubikaChatId: group.rubikaChatId,
            messageId: params.replyToMessageId,
          });
        }
        replyText = '📌 سنجاق پیام برداشته شد ✅';
      }
    } else if (['قفل لینک', 'لینک قفل', 'باز کردن لینک', 'لینک باز'].includes(cmd)) {
      if (!['creator', 'owner', 'admin'].includes(senderRole)) {
        replyText = '⛔ فقط مالک، ادمین یا سازنده ربات مجاز است.';
      } else {
        const enable = cmd.includes('قفل');
        group.locks = {...(group.locks || {}), antiLink: enable};
        replyText = enable
          ? '🔒 قفل لینک فعال شد: مدیر کمکی هر لینک یا آیدی تبلیغاتی را در گروه فوراً حذف می‌کند.'
          : '🔓 قفل لینک غیرفعال شد.';
      }
    } else if (['قفل فوروارد', 'فوروارد قفل', 'باز کردن فوروارد', 'فوروارد باز'].includes(cmd)) {
      if (!['creator', 'owner', 'admin'].includes(senderRole)) {
        replyText = '⛔ فقط مالک، ادمین یا سازنده ربات مجاز است.';
      } else {
        const enable = cmd.includes('قفل');
        group.locks = {...(group.locks || {}), antiForward: enable};
        replyText = enable
          ? '🔒 قفل فوروارد فعال شد: پیام‌های فورواردی اعضای عادی خودکار حذف می‌شوند.'
          : '🔓 قفل فوروارد غیرفعال شد.';
      }
    } else if (['قفل اسپم', 'ضد اسپم', 'باز کردن اسپم', 'اسپم باز'].includes(cmd)) {
      if (!['creator', 'owner', 'admin'].includes(senderRole)) {
        replyText = '⛔ فقط مالک، ادمین یا سازنده ربات مجاز است.';
      } else {
        const enable = !cmd.includes('باز');
        group.locks = {...(group.locks || {}), antiSpam: enable};
        replyText = enable
          ? '🛡️ ضد اسپم فعال شد: پیام‌های رگباری (بیش از ۵ پیام در ۶ ثانیه) خودکار حذف می‌شوند.'
          : '🔓 ضد اسپم غیرفعال شد.';
      }
    } else if (['قفل گروه', 'قفل چت', 'باز کردن گروه', 'گروه باز'].includes(cmd)) {
      if (!['creator', 'owner', 'admin'].includes(senderRole)) {
        replyText = '⛔ فقط مالک، ادمین یا سازنده ربات مجاز است.';
      } else {
        const enable = cmd.includes('قفل');
        group.locks = {...(group.locks || {}), lockChat: enable};
        if (this.isRealGroupGuid(group.rubikaChatId) && group.rubikaChatId.startsWith('g0')) {
          this.enqueueVoiceCallTask({
            action: 'set_group_locks',
            groupId: group.groupId,
            rubikaChatId: group.rubikaChatId,
            lockChat: enable,
          });
        }
        replyText = enable
          ? '🔒 چت گروه روبیکا برای اعضای عادی قفل شد (توسط مدیر کمکی).'
          : '🔓 چت گروه روبیکا برای همه اعضا باز شد.';
      }
    } else if (
      /^(تنظیم\s*ادمین|تنظیم\s*مدیر|ادمین\s*کردن|مدیر\s*کردن|ارتقا\s*به\s*(?:مدیر|ادمین)|حذف\s*ادمین|حذف\s*مدیر|عزل\s*(?:ادمین|مدیر)|برکناری\s*(?:ادمین|مدیر)|ادمین|مدیر)(?:\s+(.+))?$/.test(
        cmd,
      )
    ) {
      const adminCmdMatch =
        /^(تنظیم\s*ادمین|تنظیم\s*مدیر|ادمین\s*کردن|مدیر\s*کردن|ارتقا\s*به\s*(?:مدیر|ادمین)|حذف\s*ادمین|حذف\s*مدیر|عزل\s*(?:ادمین|مدیر)|برکناری\s*(?:ادمین|مدیر)|ادمین|مدیر)(?:\s+(.+))?$/.exec(
          cmd,
        );
      const verb = (adminCmdMatch?.[1] || '').trim();
      const rawArg = (adminCmdMatch?.[2] || '').trim();
      const inlineTargetMatch = rawArg.match(/(@[A-Za-z0-9_]{3,}|\bu0[A-Za-z0-9]{15,}\b)/);
      const inlineTarget = inlineTargetMatch?.[1] || '';

      // Avoid hijacking plain conversational "ادمین" / "مدیر" unless replying or passing @username / u0...
      if ((verb === 'ادمین' || verb === 'مدیر') && !replyTargetSenderId && !inlineTarget) {
        // Show quick usage tip only if no reply/target; do not block if user wrote "تنظیم مدیر"
        replyText = [
          '🛡️ راهنمای تنظیم مدیر / ادمین واقعی گروه:',
          '• روی پیام کاربر ریپلای کنید و بنویسید: تنظیم مدیر (یا تنظیم ادمین)',
          '• یا با آیدی بنویسید: تنظیم مدیر @username',
          '• برای برداشتن مقام: حذف مدیر (یا حذف ادمین)',
        ].join('\n');
      } else if (!['creator', 'owner', 'admin'].includes(senderRole)) {
        replyText = '⛔ فقط سازنده، مالک یا ادمین گروه می‌تواند مدیر/ادمین تعیین یا عزل کند.';
      } else {
        const resolvedTarget = inlineTarget || replyTargetSenderId || '';
        const isPromote = !/(حذف|عزل|برکناری)/.test(verb);
        if (!resolvedTarget) {
          replyText = isPromote
            ? '⚠ روی پیام کاربر ریپلای کنید و بنویسید «تنظیم مدیر» یا آیدی بدهید: تنظیم مدیر @username'
            : '⚠ روی پیام کاربر ریپلای کنید و بنویسید «حذف مدیر» یا آیدی بدهید: حذف مدیر @username';
        } else {
          const matchedMember = group.members.find(
            (m) =>
              m.userId === resolvedTarget ||
              (m.username &&
                m.username.replace(/^@/, '').toLowerCase() ===
                  resolvedTarget.replace(/^@/, '').toLowerCase()),
          );
          const targetName =
            matchedMember?.name ||
            params.replyToSenderName ||
            replyMsgObj?.senderName ||
            resolvedTarget;
          const isRealTargetChat = this.isRealGroupGuid(group.rubikaChatId);

          if (params.deferAdminExec && isRealTargetChat) {
            deferredAdminAction = {
              rubikaChatId: group.rubikaChatId,
              targetUserId: matchedMember?.userId || resolvedTarget,
              targetName,
              adminAction: isPromote ? 'SetAdmin' : 'UnsetAdmin',
            };
          } else {
            if (matchedMember) {
              if (matchedMember.role !== 'creator') {
                matchedMember.role = isPromote ? 'admin' : 'member';
              }
            } else if (isPromote) {
              group.members.push({
                userId: resolvedTarget,
                name: targetName,
                ...(resolvedTarget.startsWith('@') ? {username: resolvedTarget} : {}),
                role: 'admin',
                joinedAt: nowIso,
              });
            }
            if (isRealTargetChat) {
              this.enqueueVoiceCallTask({
                action: 'set_group_admin',
                groupId: group.groupId,
                rubikaChatId: group.rubikaChatId,
                targetUserId: matchedMember?.userId || resolvedTarget,
                targetName,
                adminAction: isPromote ? 'SetAdmin' : 'UnsetAdmin',
              });
            }
            replyText = isPromote
              ? `🛡️ کاربر «${targetName}» به عنوان ادمین/مدیر گروه ارتقا یافت ✅`
              : `🗑 مقام مدیر/ادمین کاربر «${targetName}» برداشته شد.`;
          }
        }
      }
    } else if (cmdLower === '/get') {
      const quota = this.getDailyQuota(group);
      replyText = [
        `📡 گزارش زنده گروه «${group.title}»`,
        `👥 تعداد اعضا: ${group.members.length} عضو`,
        `📞 گفتگوی گروهی (ویسکال): ${group.voiceCallActive ? 'فعال ✅' : 'غیرفعال'}`,
        `🎵 آهنگ جاری: ${group.currentTrack ? this.formatTrackInfo(group.currentTrack) : 'هیچ'}`,
        `📋 تعداد صف پخش: ${group.queue.length}`,
        `📊 سهمیهٔ امروز: ${quota.count}/${quota.limit}`,
      ].join('\n');
    }
    // 0b. 12 Interactive Help & Moderation Menu Sections (Screenshot keypad)
    else if (cmd === 'قفل‌ها' || cmd === 'قفل ها' || cmdLower === 'btn_locks') {
      const lk = group.locks || {};
      replyText = [
        '🔒 بخش قفل‌ها و مدیر کمکی گروه',
        '',
        `• دسترسی عمومی ربات: ${group.publicAccess === 'open' ? 'باز 🔓 (همه اعضا مجازند)' : 'قفل 🔒 (فقط ویژه و مدیران)'}`,
        `• قفل لینک: ${lk.antiLink ? 'فعال 🔒' : 'غیرفعال 🔓'}  (دستور: قفل لینک / باز کردن لینک)`,
        `• قفل فوروارد: ${lk.antiForward ? 'فعال 🔒' : 'غیرفعال 🔓'}  (دستور: قفل فوروارد / باز کردن فوروارد)`,
        `• ضد اسپم: ${lk.antiSpam ? 'فعال 🛡️' : 'غیرفعال'}  (دستور: قفل اسپم / باز کردن اسپم)`,
        `• قفل چت گروه: ${lk.lockChat ? 'قفل 🔒' : 'باز 🔓'}  (دستور: قفل گروه / باز کردن گروه)`,
        `• کلمات فیلترشده: ${(group.filteredWords || []).length} کلمه (دستور: فیلتر {کلمه})`,
      ].join('\n');
    } else if (cmd === 'مدیران' || cmdLower === 'btn_admins') {
      const adminsList = group.members
        .filter((m) => ['creator', 'owner', 'admin', 'vip'].includes(m.role))
        .map((m) => `• ${m.name} (${this.getRoleTitleFa(m.role)})`)
        .join('\n');
      replyText = [
        '🛡️ لیست مدیران و کاربران ویژه گروه:',
        adminsList || '• هنوز مدیری ثبت نشده است.',
        '',
        'دستورات مدیریتی (با ریپلای یا @آیدی):',
        '• تنظیم مدیر | تنظیم ادمین | حذف مدیر | حذف ادمین',
        '• تنظیم مالک | ویژه | حذف ویژه | بن | آنبن | پین',
      ].join('\n');
    } else if (cmd === 'نصب' || cmdLower === 'btn_install') {
      const daysLeft = Math.max(
        0,
        Math.ceil((new Date(group.subscription.expiresAt).getTime() - Date.now()) / 86400000),
      );
      const helperOk = Boolean(this.state.userbotStatus?.connected && this.isRealGroupGuid(group.rubikaChatId));
      replyText = [
        '📦 وضعیت نصب و مدیر کمکی در روبیکا',
        '',
        `• نام چت: ${group.title} (${group.chatType === 'channel' ? 'کانال 📢' : 'گروه 👥'})`,
        `• شناسه چت: ${group.rubikaChatId}`,
        `• مدیر کمکی و ویسکال زنده: ${helperOk ? 'متصل و فعال ✅' : 'در انتظار اتصال Userbot ⚠️'}`,
        `• اعتبار اشتراک: ${daysLeft} روز باقیمانده`,
        '• ارسال لینک گروه یا @آیدی کانال در پیوی ربات، خودکار گروه/کانال را نصب و متصل می‌کند.',
      ].join('\n');
    } else if (cmd === 'حذف سکوت' || cmd === 'لغو سکوت') {
      if (replyTargetSenderId && ['creator', 'owner', 'admin'].includes(senderRole)) {
        group.mutedUserIds = (group.mutedUserIds || []).filter((id) => id !== replyTargetSenderId);
        replyText = `🔊 سکوت کاربر (${replyTargetSenderId}) در گروه برداشته شد.`;
      } else {
        replyText = '⚠ روی پیام کاربر ریپلای کنید و بنویسید: حذف سکوت';
      }
    } else if (cmd === 'سکوت' || cmdLower === 'btn_mute') {
      if (replyTargetSenderId && ['creator', 'owner', 'admin'].includes(senderRole)) {
        const muted = new Set(group.mutedUserIds || []);
        if (muted.has(replyTargetSenderId)) {
          muted.delete(replyTargetSenderId);
          group.mutedUserIds = Array.from(muted);
          replyText = `🔊 سکوت کاربر (${replyTargetSenderId}) در گروه برداشته شد.`;
        } else {
          muted.add(replyTargetSenderId);
          group.mutedUserIds = Array.from(muted);
          if (params.replyToMessageId && this.isRealGroupGuid(group.rubikaChatId)) {
            this.enqueueVoiceCallTask({
              action: 'delete_single_message',
              groupId: group.groupId,
              rubikaChatId: group.rubikaChatId,
              messageId: params.replyToMessageId,
            });
          }
          replyText = `🔇 کاربر (${replyTargetSenderId}) در حالت سکوت قرار گرفت و پیام‌های بعدی او خودکار حذف می‌شوند.`;
        }
      } else {
        replyText = [
          '🔇 راهنمای بخش سکوت (ویسکال و اعضا)',
          '',
          `• وضعیت صدای ربات در ویسکال: ${group.isMuted ? 'بیصدا 🔇' : 'باصدا 🔊'}`,
          `• تعداد کاربران در سکوت: ${(group.mutedUserIds || []).length}`,
          '• بیصدا کردن ربات در کال: بیصدا | باز کردن صدا: باصدا',
          '• سکوت/رفع سکوت عضو: روی پیام کاربر ریپلای کنید و بنویسید: سکوت | حذف سکوت',
        ].join('\n');
      }
    } else if (cmd === 'حذف اخطار' || cmd === 'پاک کردن اخطارها') {
      if (!['creator', 'owner', 'admin'].includes(senderRole)) {
        replyText = '⛔ فقط مدیران مجاز هستند.';
      } else if (replyTargetSenderId) {
        const warns = {...(group.warnings || {})};
        delete warns[replyTargetSenderId];
        group.warnings = warns;
        replyText = `✅ اخطارهای کاربر (${replyTargetSenderId}) پاک شد.`;
      } else {
        group.warnings = {};
        replyText = '✅ تمام اخطارهای گروه پاکسازی شد.';
      }
    } else if (cmd === 'اخطار' || cmdLower === 'btn_warn') {
      if (replyTargetSenderId && ['creator', 'owner', 'admin'].includes(senderRole)) {
        const warns = {...(group.warnings || {})};
        const nextCount = (warns[replyTargetSenderId] || 0) + 1;
        warns[replyTargetSenderId] = nextCount;
        group.warnings = warns;
        const targetName =
          group.members.find((m) => m.userId === replyTargetSenderId)?.name ||
          replyMsgObj?.senderName ||
          replyTargetSenderId;
        let autoBanNote = '';
        if (nextCount >= 3 && this.isRealGroupGuid(group.rubikaChatId) && group.rubikaChatId.startsWith('g0')) {
          this.enqueueVoiceCallTask({
            action: 'ban_member',
            groupId: group.groupId,
            rubikaChatId: group.rubikaChatId,
            targetUserId: replyTargetSenderId,
          });
          autoBanNote = '\n🚫 به دلیل رسیدن به ۳/۳ اخطار، کاربر توسط مدیر کمکی اخراج شد!';
        }
        group.violationLogs = [
          {
            id: `viol_${Date.now()}`,
            userId: replyTargetSenderId,
            userName: targetName,
            reason: `اخطار مدیر (${nextCount}/3)`,
            actionTaken: nextCount >= 3 ? 'ثبت اخطار + اخراج خودکار' : 'ثبت اخطار',
            timestamp: nowIso,
          },
          ...(group.violationLogs || []),
        ].slice(0, 50);
        replyText = `⚠️ اخطار به «${targetName}» ثبت شد.\n🚨 تعداد اخطارها: ${nextCount}/3${autoBanNote}`;
      } else {
        const totalWarns = Object.values(group.warnings || {}).reduce((a, b) => a + b, 0);
        replyText = [
          '⚠️ سیستم اخطار هوشمند گروه (۳ اخطار = اخراج خودکار)',
          '',
          `• مجموع اخطارهای ثبت‌شده: ${totalWarns}`,
          '• برای ثبت اخطار: روی پیام کاربر ریپلای کنید و بفرستید: اخطار',
          '• برای پاک کردن اخطار: حذف اخطار',
        ].join('\n');
      }
    } else if (cmd === 'تخلفات' || cmdLower === 'btn_violations') {
      const warnEntries = Object.entries(group.warnings || {});
      const recentViolations = (group.violationLogs || []).slice(0, 6);
      const warnLines = warnEntries.map(([uid, cnt]) => {
        const name = group.members.find((m) => m.userId === uid)?.name || uid;
        return `• ${name}: ${cnt}/3 اخطار`;
      });
      const logLines = recentViolations.map(
        (v) => `• ${v.userName}: ${v.reason} (${v.actionTaken})`,
      );
      const details =
        warnLines.length > 0 || logLines.length > 0
          ? [...warnLines, ...(logLines.length ? ['', '🛡 اقدامات خودکار اخیر مدیر کمکی:', ...logLines] : [])].join('\n')
          : '• هیچ تخلف یا اخطاری تا این لحظه ثبت نشده است ✅';
      replyText = ['🚨 گزارش تخلفات و اخطارهای گروه:', '', details].join('\n');
    } else if (cmd === 'آمار' || cmdLower === 'btn_stats') {
      const quota = this.getDailyQuota(group);
      const archiveStats = musicCatalog.getStats();
      replyText = [
        `📊 آمار زنده گروه «${group.title}»`,
        '',
        `👥 اعضا: ${group.members.length} کاربر`,
        `🎵 آهنگ‌های پخش‌شده: ${(group.playbackEvents || []).length || group.history.length}`,
        `📊 سهمیهٔ امروز: ${quota.count}/${quota.limit}`,
        `📋 صف انتظار: ${group.queue.length} آهنگ`,
        `📚 آرشیو موسیقی آماده: ${archiveStats.total} آهنگ`,
        `📞 وضعیت ویسکال: ${group.voiceCallActive ? 'فعال و متصل ✅' : 'غیرفعال'}`,
      ].join('\n');
    } else if (cmd === 'پاکسازی' || cmdLower === 'btn_clean') {
      replyText = [
        '🧹 بخش پاکسازی گروه و صف پخش',
        '',
        `• تعداد آهنگ‌های در صف: ${group.queue.length}`,
        '• حذف پیام‌های گروه روبیکا: حذف 50 (یا حذف 100)',
        '• پاک کردن کل صف: پاک کردن صف',
        '• حذف یک مورد از صف: حذف از صف {شماره}',
        '• پاک کردن فیلترها: حذف فیلتر {کلمه} | حذف اخطار',
      ].join('\n');
    } else if (cmdLower === 'kill' || cmdLower === 'btn_kill') {
      if (group.voiceCallActive && ['creator', 'owner', 'admin'].includes(senderRole)) {
        if (group.currentTrack) {
          group.pausedTrack = group.currentTrack;
          group.currentTrack = null;
        }
        group.isPlaying = false;
        group.voiceCallActive = false;
        const mins = group.voiceCallStartedAt
          ? Math.max(1, Math.round((Date.now() - new Date(group.voiceCallStartedAt).getTime()) / 60000))
          : 1;
        group.voiceCallStartedAt = undefined;
        systemBannerText = `گفتگوی گروهی به پایان رسید (${mins} دقیقه)`;
        replyText = '⚔️ دستور Kill اجرا شد: تماس صوتی و پخش ویسکال فوراً متوقف گردید.';
        this.enqueueVoiceCallTask({
          action: 'stop_vc',
          groupId: group.groupId,
          rubikaChatId: group.rubikaChatId,
        });
      } else {
        replyText = [
          '⚔️ دستور Kill (قطع اضطراری ویسکال و پاکسازی)',
          '',
          '• وقتی ویسکال فعال باشد، زدن Kill ⚔️ فوراً تماس صوتی و پخش را قطع می‌کند.',
          '• دستورات مشابه: قطع ویسکال | توقف آهنگ | خروج',
        ].join('\n');
      }
    } else if (cmd === 'نکات' || cmdLower === 'btn_tips') {
      replyText = [
        '📝 نکات کلیدی ربات موزیکال',
        '',
        '1️⃣ با دستور «پخش آهنگ بهنام بانی» یا «آهنگ لری» ربات خودکار وارد گفتگوی گروهی می‌شود و آهنگ را پخش می‌کند.',
        '2️⃣ برای پخش فایل صوتی داخل چت، روی آن ریپلای کنید و بنویسید: پخش ریپلای',
        '3️⃣ با دستور /get گزارش کامل گروه و سهمیهٔ امروز را ببینید.',
        '4️⃣ با دستور «تنظیم خاموشی 23:30» ساعت قطع خودکار ویسکال را تعیین کنید.',
      ].join('\n');
    } else if (cmd.startsWith('فیلتر ') || cmd === 'فیلتر' || cmdLower === 'btn_filter') {
      if (cmd.startsWith('فیلتر ') && ['creator', 'owner', 'admin'].includes(senderRole)) {
        const word = cmd.slice('فیلتر '.length).trim();
        if (word) {
          const set = new Set(group.filteredWords || []);
          set.add(word);
          group.filteredWords = Array.from(set);
          replyText = `🔍 کلمه «${word}» به لیست فیلتر گروه اضافه شد.`;
        } else {
          replyText = '⚠ لطفاً کلمه مورد نظر را بعد از «فیلتر» بنویسید.';
        }
      } else {
        const list = group.filteredWords || [];
        replyText = [
          '🔍 بخش فیلتر کلمات گروه',
          '',
          `• کلمات فیلترشده (${list.length}): ${list.length ? list.join('، ') : 'خالی'}`,
          '• افزودن فیلتر: فیلتر {کلمه}',
          '• حذف فیلتر: حذف فیلتر {کلمه}',
        ].join('\n');
      }
    } else if (cmd.startsWith('حذف فیلتر ') && ['creator', 'owner', 'admin'].includes(senderRole)) {
      const word = cmd.slice('حذف فیلتر '.length).trim();
      group.filteredWords = (group.filteredWords || []).filter((w) => w !== word);
      replyText = `🗑 کلمه «${word}» از لیست فیلتر حذف شد.`;
    } else if (cmd === 'سرگرمی' || cmdLower === 'btn_fun') {
      const funItems = [
        '🎭 فال روز: امروز دلت روشن و ریتمت شاد است؛ یک آهنگ لری یا شاد پخش کن!',
        '🎲 چالش گروهی: هر کی اسم خواننده آهنگ بعدی رو درست حدس بزنه برنده‌ست!',
        '🎶 پیشنهاد سرگرمی: برای پخش تصادفی یک آهنگ جدید بنویس «پخش رندوم»!',
      ];
      const pick = funItems[Math.floor(Math.random() * funItems.length)];
      replyText = `${pick}\n\n• دستور سریع: پخش رندوم | پخش رندوم شاد | آهنگ لری`;
    } else if ((cmd === 'پخش آهنگ' && !replyTargetAudioUrl && !params.replyToMessageId) || cmdLower === 'btn_play') {
      let chosen =
        group.pausedTrack ||
        musicCatalog.pickRandom(undefined, 1, senderName)[0];
      if (!chosen) {
        const res = await searchMusicReal('بهنام بانی', senderName);
        chosen = res[0];
      }
      if (!chosen) {
        replyText = [
          '🎵 برای پخش فوری در گفتگوی گروهی، نام آهنگ یا خواننده را بنویسید:',
          '• پخش آهنگ بهنام بانی',
          '• پخش آهنگ شادمهر عقیلی',
          '• آهنگ لری',
        ].join('\n');
      } else {
        if (group.currentTrack) this.pushHistory(group, group.currentTrack);
        group.currentTrack = chosen;
        group.pausedTrack = null;
        group.isPlaying = true;
        group.voiceCallActive = true;
        group.voiceCallId = group.voiceCallId || `vc_${Date.now()}`;
        group.voiceCallStartedAt = group.voiceCallStartedAt || nowIso;
        if (!wasCallActiveBefore) {
          systemBannerText = `${this.state.botName} یک گفتگوی گروهی را شروع کرد`;
        }
        this.recordTrackPlay(group, chosen);
        this.enqueueVoiceCallTask({
          action: 'play_in_vc',
          groupId: group.groupId,
          rubikaChatId: group.rubikaChatId,
          trackTitle: chosen.title,
          trackArtist: chosen.artist,
          streamUrl: chosen.streamUrl,
          volume: group.volume,
        });
        const quota = this.incrementDailyQuota(group);
        botAudioAttachment = {
          title: chosen.title,
          artist: chosen.artist,
          url: chosen.streamUrl,
          durationSec: chosen.durationSec,
        };
        replyText = [
          '🎶 پخش آغاز شد',
          `🎵 ${chosen.artist}   ${chosen.title}`,
          `📊 سهمیه امروز: ${quota.count}/${quota.limit}`,
        ].join('\n');
      }
    } else if (cmd === 'صف پخش' || cmdLower === 'btn_queue') {
      if (group.queue.length === 0) {
        replyText = '📋 صف پخش در حال حاضر خالی است.\nبرای افزودن آهنگ بنویسید: اضافه به صف {لینک} یا از بخش جستجو اضافه کنید.';
      } else {
        const list = group.queue.map((t, idx) => `${idx + 1}. ${this.formatTrackInfo(t)}`).join('\n');
        replyText = `📋 لیست صف پخش (${group.queue.length} آهنگ):\n${list}`;
      }
    } else if (cmd === 'وضعیت اشتراک' || cmdLower === 'btn_status') {
      const expDate = new Date(group.subscription.expiresAt);
      const buyDate = new Date(group.subscription.purchasedAt);
      const daysLeft = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      const accessLabel =
        group.publicAccess === 'open' ? 'باز (همه اعضا مجاز هستند)' : 'قفل (فقط کاربران ویژه و ادمین‌ها)';
      replyText = [
        `🔐 وضعیت اشتراک و دسترسی گروه «${group.title}»`,
        `📅 تاریخ خرید: ${buyDate.toLocaleDateString('fa-IR')}`,
        `⏳ تاریخ انقضا: ${expDate.toLocaleDateString('fa-IR')}`,
        `📆 روزهای باقیمانده: ${daysLeft} روز`,
        `🔓 وضعیت دسترسی عمومی: ${accessLabel}`,
        `📞 وضعیت ویسکال: ${group.voiceCallActive ? 'فعال و متصل' : 'غیرفعال'}`,
        `👑 سازنده: ${this.state.creatorName}`,
      ].join('\n');
    }
    // 1. Bot ping
    else if (cmd === 'ربات' || cmd === 'بات' || cmd === 'آنلاین') {
      replyText = [
        `🤖 بله! ربات موزیکال آنلاین و فعال است ✅`,
        `🎧 برای پخش آهنگ در ویسکال بنویسید: پخش آهنگ بهنام بانی یا آهنگ لری`,
        `📞 برای ساخت ویس‌چت بنویسید: ساخت کال`,
        `📚 برای منوی دکمه‌ای بنویسید: راهنمای جامع`,
      ].join('\n');
    }
    // 2. Role check
    else if (trimmed === 'مقام') {
      replyText = `🔵 مقام شما در این گروه: ${this.getRoleTitleFa(senderRole)}`;
    }
    // 3. Group Owner display
    else if (trimmed === 'مالک گروه') {
      replyText = `🟢 مالک فعلی گروه:\n👤 نام: ${group.ownerName}\n🆔 شناسه: ${group.ownerId}\n👑 سازنده ربات: ${this.state.creatorName}`;
    }
    // 4. Subscription status
    else if (trimmed === 'وضعیت') {
      const expDate = new Date(group.subscription.expiresAt);
      const buyDate = new Date(group.subscription.purchasedAt);
      const daysLeft = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      const accessLabel =
        group.publicAccess === 'open' ? 'باز (همه اعضا مجاز هستند)' : 'قفل (فقط کاربران ویژه و ادمین‌ها)';
      replyText = [
        `🔐 وضعیت اشتراک و دسترسی گروه «${group.title}»`,
        `📅 تاریخ خرید: ${buyDate.toLocaleDateString('fa-IR')}`,
        `⏳ تاریخ انقضا: ${expDate.toLocaleDateString('fa-IR')}`,
        `📆 روزهای باقیمانده: ${daysLeft} روز`,
        `🔓 وضعیت دسترسی عمومی: ${accessLabel}`,
        `📞 وضعیت ویسکال: ${group.voiceCallActive ? 'فعال و متصل' : 'غیرفعال'}`,
        `👑 سازنده: ${this.state.creatorName}`,
      ].join('\n');
    }
    // 5. Set Owner (Creator ONLY)
    else if (trimmed === 'تنظیم مالک') {
      if (senderRole !== 'creator') {
        replyText = `⛔ فقط سازنده ربات (${this.state.creatorName}) مجاز به تعیین مالک گروه است.`;
      } else if (!replyTargetSenderId) {
        replyText = '⚠ لطفاً روی پیام کاربر مورد نظر ریپلای کنید و ارسال کنید: تنظیم مالک';
      } else {
        const targetMember = group.members.find((m) => m.userId === replyTargetSenderId);
        const targetName =
          targetMember?.name ||
          params.replyToSenderName ||
          replyMsgObj?.senderName ||
          replyTargetSenderId;
        group.ownerId = replyTargetSenderId;
        group.ownerName = targetName;
        if (targetMember) {
          targetMember.role = 'owner';
        } else {
          group.members.push({
            userId: replyTargetSenderId,
            name: targetName,
            role: 'owner',
            joinedAt: nowIso,
          });
        }
        replyText = `👑 کاربر «${targetName}» (${replyTargetSenderId}) به عنوان مالک گروه تنظیم شد.`;
      }
    }
    // 6. Add VIP (Creator / Owner / Admin)
    else if (trimmed === 'ویژه') {
      if (!['creator', 'owner', 'admin'].includes(senderRole)) {
        replyText = '⛔ فقط مالک گروه، ادمین یا سازنده ربات می‌تواند کاربر را ویژه کند.';
      } else if (!replyTargetSenderId) {
        replyText = '⚠ لطفاً روی پیام کاربر مورد نظر ریپلای کنید و بنویسید: ویژه';
      } else {
        const targetMember = group.members.find((m) => m.userId === replyTargetSenderId);
        const targetName =
          targetMember?.name ||
          params.replyToSenderName ||
          replyMsgObj?.senderName ||
          replyTargetSenderId;
        if (targetMember) {
          if (targetMember.role === 'member') targetMember.role = 'vip';
        } else {
          group.members.push({
            userId: replyTargetSenderId,
            name: targetName,
            role: 'vip',
            joinedAt: nowIso,
          });
        }
        replyText = `⭐ کاربر «${targetName}» با موفقیت ویژه شد و دسترسی به ربات را دریافت کرد.`;
      }
    }
    // 7. Remove VIP (Owner or Creator ONLY)
    else if (trimmed === 'حذف ویژه') {
      if (!['creator', 'owner'].includes(senderRole)) {
        replyText = '⛔ فقط مالک گروه یا سازنده ربات می‌تواند وضعیت ویژه کاربر را حذف کند.';
      } else if (!replyTargetSenderId) {
        replyText = '⚠ لطفاً روی پیام کاربر مورد نظر ریپلای کنید و بنویسید: حذف ویژه';
      } else {
        const targetMember = group.members.find((m) => m.userId === replyTargetSenderId);
        if (targetMember && targetMember.role === 'vip') {
          targetMember.role = 'member';
          replyText = `🗑 دسترسی ویژه کاربر «${targetMember.name}» حذف شد.`;
        } else {
          replyText = 'ℹ این کاربر در لیست کاربران ویژه نیست.';
        }
      }
    }
    // 8. Public access open / locked
    else if (trimmed === 'دسترسی عموم باز') {
      if (!['creator', 'owner', 'admin'].includes(senderRole)) {
        replyText = '⛔ فقط مالک، ادمین یا سازنده ربات می‌تواند دسترسی عمومی را تغییر دهد.';
      } else {
        group.publicAccess = 'open';
        replyText = '🔓 دسترسی عمومی باز شد. از این پس همه اعضای گروه می‌توانند از ربات استفاده کنند.';
      }
    } else if (trimmed === 'دسترسی عموم قفل باشد' || trimmed === 'دسترسی عموم قفل') {
      if (!['creator', 'owner', 'admin'].includes(senderRole)) {
        replyText = '⛔ فقط مالک، ادمین یا سازنده ربات می‌تواند دسترسی عمومی را تغییر دهد.';
      } else {
        group.publicAccess = 'locked';
        replyText = '🔒 دسترسی عمومی قفل شد. فقط کاربران ویژه، ادمین‌ها و مالک گروه دسترسی دارند.';
      }
    }
    // 9. Music / Voice Call commands permission check
    else if (!hasMusicAccess) {
      replyText = '🔒 دسترسی عمومی گروه قفل است. فقط کاربران ویژه و ادمین‌ها می‌توانند از دستورات موزیک استفاده کنند.';
    }
    // 10. Create voice call / ویسکال / پیوستن به ویسکال
    else if (
      [
        'ویسکال',
        'باز کردن ویسکال',
        'باز کن ویسکال',
        'شروع ویسکال',
        'ویس چت',
        'ویس‌چت',
        'کال',
        'ساخت کال',
        'تماس',
        'شروع تماس',
        'تماس صوتی',
        'تماس تلفنی',
        'برقراری تماس',
      ].includes(cmd) ||
      cmdLower === 'btn_call'
    ) {
      group.voiceCallActive = true;
      group.voiceCallId = group.voiceCallId || `vc_${Date.now()}`;
      group.voiceCallStartedAt = group.voiceCallStartedAt || nowIso;
      if (!wasCallActiveBefore) {
        systemBannerText = `${this.state.botName} یک گفتگوی گروهی را شروع کرد`;
      }
      const activeOrPaused = group.currentTrack || group.pausedTrack;
      if (!group.currentTrack && group.pausedTrack) {
        group.currentTrack = group.pausedTrack;
        group.pausedTrack = null;
        group.isPlaying = true;
      }
      this.enqueueVoiceCallTask({
        action: 'start_call',
        groupId: group.groupId,
        rubikaChatId: group.rubikaChatId,
        volume: group.volume,
        ...(activeOrPaused
          ? {
              streamUrl: activeOrPaused.streamUrl,
              trackTitle: activeOrPaused.title,
              trackArtist: activeOrPaused.artist,
            }
          : {}),
      });
      uiAction = 'open_voice_panel';
      customInlineKeypad = this.buildVoiceCallJoinInlineKeypad();
      const joinUrl = this.buildVoiceJoinUrl(group.groupId);
      const resolvedGuid = this.resolveVoiceCallChatGuid(group.rubikaChatId);
      const isValidGroupGuid = this.isRealGroupGuid(resolvedGuid);
      replyText = [
        `📞 گفتگوی گروهی (ویسکال) در گروه «${group.title}» باز و فعال شد ✅`,
        isValidGroupGuid
          ? '🎙 وضعیت: در حال برقراری ویس‌چت زنده داخل گروه روبیکا'
          : 'ℹ️ برای ورود واقعی ربات به ویسکال گروه روبیکا، لینک دعوت گروه را در تب اتصال روبیکا ثبت کنید.',
        '🎧 برای پیوستن و کنترل پخش، دکمه «پیوستن» را بزنید:',
        ...(joinUrl ? [`🔗 ورود به پنل ویسکال: ${joinUrl}`] : []),
      ].join('\n');
    }
    // 10a. Join Voice Call button / command
    else if (
      ['پیوستن به ویسکال', 'پیوستن به تماس', 'پیوستن', 'ورود به ویسکال'].includes(cmd) ||
      cmdLower === 'btn_join_vc'
    ) {
      const joinedGroup = this.joinVoiceCallAndPlay(group.groupId) || group;
      uiAction = 'open_voice_panel';
      customInlineKeypad = this.buildVoiceCallJoinInlineKeypad();
      const joinUrl = this.buildVoiceJoinUrl(group.groupId);
      if (joinedGroup.currentTrack) {
        botAudioAttachment = {
          title: joinedGroup.currentTrack.title,
          artist: joinedGroup.currentTrack.artist,
          url: joinedGroup.currentTrack.streamUrl,
          durationSec: joinedGroup.currentTrack.durationSec,
        };
      }
      replyText = [
        `🎧 اتصال به ویسکال گروه «${joinedGroup.title}» برقرار شد ✅`,
        joinedGroup.currentTrack
          ? `🎵 در حال پخش: ${this.formatTrackInfo(joinedGroup.currentTrack)}`
          : '📞 ویسکال گروه باز است و آماده پخش آهنگ می‌باشد.',
        ...(joinUrl ? [`🔗 پنل استودیوی ویسکال: ${joinUrl}`] : []),
      ].join('\n');
    }
    // 10a-pl. Custom Playlists Management Commands
    else if (
      ['پلی لیست ها', 'پلی لیستها', 'لیست پلی لیست', 'لیست پلی لیست ها', 'پلی لیست'].includes(
        plNormalized,
      ) ||
      cmdLower === 'btn_playlists'
    ) {
      const lists = group.customPlaylists || [];
      if (lists.length === 0) {
        replyText = [
          '🎶 هنوز هیچ پلی‌لیست اختصاصی در این گروه ساخته نشده است.',
          '',
          '💡 برای ساخت پلی‌لیست جدید بنویسید:',
          '• ساخت پلی‌لیست {نام}',
          '• افزودن به پلی‌لیست {نام} | {نام آهنگ یا لینک}',
        ].join('\n');
      } else {
        const lines = lists.map(
          (pl, idx) =>
            `${idx + 1}. 🎵 ${pl.name} (${pl.tracks.length} آهنگ · سازنده: ${pl.createdBy})`,
        );
        replyText = [
          `🎶 پلی‌لیست‌های گروه «${group.title}» (${lists.length}):`,
          ...lines,
          '',
          '• پخش: پخش پلی‌لیست {نام}',
          '• مشاهده آهنگ‌ها: مشاهده پلی‌لیست {نام}',
          '• افزودن آهنگ: افزودن به پلی‌لیست {نام} | {آهنگ یا لینک}',
        ].join('\n');
      }
    } else if (/^(?:ساخت|ایجاد)\s+پلی\s*لیست\s+(.+)$/.test(plNormalized)) {
      const match = /^(?:ساخت|ایجاد)\s+پلی\s*لیست\s+(.+)$/.exec(plNormalized);
      const rawName = (match?.[1] || '').trim();
      const created = this.createCustomPlaylist(group.groupId, {
        name: rawName,
        createdBy: senderName,
        createdById: params.senderId,
      });
      if (!created.ok) {
        replyText = `⚠ ${created.error}`;
      } else {
        replyText = [
          `✅ پلی‌لیست جدید «${created.playlist!.name}» با موفقیت ساخته شد.`,
          `➕ برای افزودن آهنگ (با جستجو یا ریپلای روی فایل صوتی/لینک) بنویسید:`,
          `افزودن به پلی‌لیست ${created.playlist!.name} | {نام آهنگ یا لینک}`,
          `▶️ برای پخش: پخش پلی‌لیست ${created.playlist!.name}`,
        ].join('\n');
      }
    } else if (/^پلی\s*لیست\s+جدید\s+(.+)$/.test(plNormalized)) {
      const match = /^پلی\s*لیست\s+جدید\s+(.+)$/.exec(plNormalized);
      const rawName = (match?.[1] || '').trim();
      const created = this.createCustomPlaylist(group.groupId, {
        name: rawName,
        createdBy: senderName,
        createdById: params.senderId,
      });
      if (!created.ok) {
        replyText = `⚠ ${created.error}`;
      } else {
        replyText = `✅ پلی‌لیست جدید «${created.playlist!.name}» ساخته شد.\n➕ برای افزودن آهنگ بنویسید: افزودن به پلی‌لیست ${created.playlist!.name} | {نام آهنگ}`;
      }
    } else if (
      /^تغییر\s+نام\s+پلی\s*لیست\s+(.+?)(?:\s+به\s+|\s*\|\s*)(.+)$/.test(plNormalized)
    ) {
      const match = /^تغییر\s+نام\s+پلی\s*لیست\s+(.+?)(?:\s+به\s+|\s*\|\s*)(.+)$/.exec(
        plNormalized,
      );
      const oldName = (match?.[1] || '').trim();
      const newName = (match?.[2] || '').trim();
      const pl = this.findPlaylistByName(group, oldName);
      if (!pl) {
        replyText = `❌ پلی‌لیست «${oldName}» پیدا نشد.`;
      } else {
        const renamed = this.renameCustomPlaylist(group.groupId, pl.id, newName);
        replyText = renamed.ok
          ? `✏️ نام پلی‌لیست از «${oldName}» به «${renamed.playlist!.name}» تغییر یافت.`
          : `⚠ ${renamed.error}`;
      }
    } else if (/^حذف\s+پلی\s*لیست\s+(.+)$/.test(plNormalized)) {
      const match = /^حذف\s+پلی\s*لیست\s+(.+)$/.exec(plNormalized);
      const targetName = (match?.[1] || '').trim();
      const pl = this.findPlaylistByName(group, targetName);
      if (!pl) {
        replyText = `❌ پلی‌لیست «${targetName}» پیدا نشد.`;
      } else {
        this.deleteCustomPlaylist(group.groupId, pl.id);
        replyText = `🗑 پلی‌لیست «${pl.name}» با موفقیت حذف شد.`;
      }
    } else if (/^حذف\s+از\s+پلی\s*لیست\s+(.+?)\s+(\d+)$/.test(plNormalized)) {
      const match = /^حذف\s+از\s+پلی\s*لیست\s+(.+?)\s+(\d+)$/.exec(plNormalized);
      const targetName = (match?.[1] || '').trim();
      const idx = Number(match?.[2] || '0') - 1;
      const pl = this.findPlaylistByName(group, targetName);
      if (!pl) {
        replyText = `❌ پلی‌لیست «${targetName}» پیدا نشد.`;
      } else {
        const resRem = this.removeTrackFromCustomPlaylist(group.groupId, pl.id, idx);
        replyText = resRem.ok
          ? `🗑 آهنگ ردیف ${idx + 1} از پلی‌لیست «${pl.name}» حذف شد.`
          : `⚠ ${resRem.error}`;
      }
    } else if (/^(?:افزودن|اضافه)\s+به\s+پلی\s*لیست\s+(.+)$/.test(plNormalized)) {
      const match = /^(?:افزودن|اضافه)\s+به\s+پلی\s*لیست\s+(.+)$/.exec(plNormalized);
      const body = (match?.[1] || '').trim();
      let plName = body;
      let songArg = '';
      const sepMatch = /^(.+?)\s*(?:\||:|—|-)\s*(.+)$/.exec(body);
      if (sepMatch) {
        plName = sepMatch[1].trim();
        songArg = sepMatch[2].trim();
      }
      const pl = this.findPlaylistByName(group, plName);
      if (!pl) {
        replyText = `❌ پلی‌لیست «${plName}» پیدا نشد. ابتدا با «ساخت پلی‌لیست ${plName}» آن را بسازید.`;
      } else {
        let trackToAdd: Track | null = null;
        const inlineUrl = songArg.match(/https?:\/\/\S+/i)?.[0];
        if (inlineUrl) {
          trackToAdd = buildTrackFromDirectUrl(inlineUrl, senderName, undefined, 'direct');
        } else if (!songArg && replyTargetAudioUrl) {
          trackToAdd = buildTrackFromDirectUrl(
            replyTargetAudioUrl,
            senderName,
            replyTargetTitle,
            'reply',
          );
        } else if (songArg) {
          const results = await searchMusicReal(songArg, senderName);
          searchResults = results;
          trackToAdd = results[0] || null;
        }
        if (!trackToAdd) {
          replyText = songArg
            ? `❌ آهنگی برای «${songArg}» پیدا نشد.`
            : `⚠ نام آهنگ یا لینک را بنویسید (مثال: افزودن به پلی‌لیست ${pl.name} | بهنام بانی) یا روی یک پیام صوتی/لینک ریپلای کنید.`;
        } else {
          this.addTrackToCustomPlaylist(group.groupId, pl.id, trackToAdd);
          botAudioAttachment = {
            title: trackToAdd.title,
            artist: trackToAdd.artist,
            url: trackToAdd.streamUrl,
            durationSec: trackToAdd.durationSec,
          };
          replyText = `➕ آهنگ «${trackToAdd.title} — ${trackToAdd.artist}» به پلی‌لیست «${pl.name}» اضافه شد (تعداد کل: ${pl.tracks.length} آهنگ).`;
        }
      }
    } else if (/^(?:مشاهده|نمایش|آهنگ های|آهنگ‌های)\s+پلی\s*لیست\s+(.+)$/.test(plNormalized)) {
      const match = /^(?:مشاهده|نمایش|آهنگ های|آهنگ‌های)\s+پلی\s*لیست\s+(.+)$/.exec(plNormalized);
      const targetName = (match?.[1] || '').trim();
      const pl = this.findPlaylistByName(group, targetName);
      if (!pl) {
        replyText = `❌ پلی‌لیست «${targetName}» پیدا نشد.`;
      } else if (pl.tracks.length === 0) {
        replyText = `🎶 پلی‌لیست «${pl.name}» هنوز خالی است.\n➕ افزودن آهنگ: افزودن به پلی‌لیست ${pl.name} | {نام آهنگ یا لینک}`;
      } else {
        const listLines = pl.tracks
          .slice(0, 30)
          .map((t, i) => `${i + 1}. ${this.formatTrackInfo(t)}`);
        replyText = [
          `🎶 آهنگ‌های پلی‌لیست «${pl.name}» (${pl.tracks.length} آهنگ):`,
          ...listLines,
          ...(pl.tracks.length > 30 ? [`... و ${pl.tracks.length - 30} آهنگ دیگر`] : []),
          '',
          `▶️ پخش: پخش پلی‌لیست ${pl.name}`,
        ].join('\n');
      }
    } else if (/^پخش\s+پلی\s*لیست\s+(.+)$/.test(plNormalized)) {
      const match = /^پخش\s+پلی\s*لیست\s+(.+)$/.exec(plNormalized);
      const targetName = (match?.[1] || '').trim();
      const pl = this.findPlaylistByName(group, targetName);
      if (!pl) {
        replyText = `❌ پلی‌لیست «${targetName}» پیدا نشد.`;
      } else {
        const playRes = this.playCustomPlaylist(group.groupId, pl.id, 'replace_and_play');
        if (!playRes.ok || !playRes.startedTrack) {
          replyText = `⚠ ${playRes.error || 'پلی‌لیست خالی است و آهنگی برای پخش ندارد.'}`;
        } else {
          uiAction = 'open_voice_panel';
          botAudioAttachment = {
            title: playRes.startedTrack.title,
            artist: playRes.startedTrack.artist,
            url: playRes.startedTrack.streamUrl,
            durationSec: playRes.startedTrack.durationSec,
          };
          replyText = [
            `🎶 پخش پلی‌لیست «${pl.name}» (${pl.tracks.length} آهنگ) در ویسکال آغاز شد ✅`,
            `🎵 آهنگ اول: ${this.formatTrackInfo(playRes.startedTrack)}`,
          ].join('\n');
        }
      }
    }
    // 10b. Auto-shutdown timer commands
    else if (/^(تنظیم خاموشی|خاموشی خودکار|تایمر قطع)\s+[0-9۰-۹]{1,2}:[0-9۰-۹]{2}$/.test(trimmed)) {
      if (!['creator', 'owner', 'admin'].includes(senderRole)) {
        replyText = '⛔ فقط مالک، ادمین یا سازنده ربات می‌تواند تایمر خاموشی خودکار تنظیم کند.';
      } else {
        const timePart = this.normalizeDigits(trimmed.split(/\s+/).pop() || '');
        const padded = timePart
          .split(':')
          .map((p) => p.padStart(2, '0'))
          .join(':');
        const tzOffset = group.autoShutdown?.timezoneOffsetMinutes ?? -210;
        const nextIso = this.computeNextTriggerIso(padded, tzOffset);
        if (!nextIso) {
          replyText = '⚠ فرمت ساعت معتبر نیست. مثال صحیح: تنظیم خاموشی 23:30';
        } else {
          group.autoShutdown = {
            enabled: true,
            targetTime: padded,
            timezoneOffsetMinutes: tzOffset,
            stopPollingAlso: group.autoShutdown?.stopPollingAlso ?? false,
            nextTriggerIso: nextIso,
            lastTriggeredAt: group.autoShutdown?.lastTriggeredAt || null,
          };
          replyText = `⏰ تایمر قطع خودکار ویسکال برای ساعت ${padded} تنظیم شد.`;
        }
      }
    } else if (['لغو خاموشی', 'حذف تایمر', 'لغو تایمر'].includes(trimmed)) {
      if (!['creator', 'owner', 'admin'].includes(senderRole)) {
        replyText = '⛔ فقط مالک، ادمین یا سازنده ربات می‌تواند تایمر را لغو کند.';
      } else {
        if (group.autoShutdown) {
          group.autoShutdown.enabled = false;
          group.autoShutdown.nextTriggerIso = null;
        }
        replyText = '⏰ تایمر خاموشی خودکار ویسکال لغو شد.';
      }
    } else if (trimmed === 'وضعیت تایمر' || trimmed === 'زمان خاموشی') {
      if (group.autoShutdown?.enabled && group.autoShutdown.nextTriggerIso) {
        const diffMin = Math.max(
          0,
          Math.round((new Date(group.autoShutdown.nextTriggerIso).getTime() - Date.now()) / 60000),
        );
        replyText = `⏰ خاموشی خودکار ویسکال روی ساعت ${group.autoShutdown.targetTime} فعال است (${diffMin} دقیقه باقیمانده).`;
      } else {
        replyText = '⏰ هیچ تایمر خاموشی خودکاری برای این گروه فعال نیست.';
      }
    }
    // 11. Mute / Unmute
    else if (trimmed === 'بیصدا') {
      group.isMuted = true;
      this.enqueueVoiceCallTask({action: 'mute_vc', groupId: group.groupId, rubikaChatId: group.rubikaChatId});
      replyText = '🟣 ربات در کال بی‌صدا شد (پخش آهنگ در پس‌زمینه ادامه دارد).';
    } else if (trimmed === 'باصدا') {
      group.isMuted = false;
      this.enqueueVoiceCallTask({action: 'unmute_vc', groupId: group.groupId, rubikaChatId: group.rubikaChatId});
      replyText = '🟠 ربات از حالت بی‌صدا خارج شد و آهنگ در حال پخش است ✅';
    }
    // 12. Set Volume
    else if (/^تنظیم صدا\s+\d{1,3}$/.test(trimmed)) {
      const volNum = Number(trimmed.replace('تنظیم صدا', '').trim());
      const clamped = Math.max(0, Math.min(100, volNum));
      group.volume = clamped;
      this.enqueueVoiceCallTask({
        action: 'set_volume',
        groupId: group.groupId,
        rubikaChatId: group.rubikaChatId,
        volume: clamped,
      });
      replyText = `🔊 صدای پخش ربات روی ${clamped} درصد تنظیم شد.`;
    }
    // 13. Stop & Save paused track / End Voice Call
    else if (
      [
        'قطع ویسکال',
        'قطع کال',
        'قطع تماس',
        'پایان تماس',
        'توقف آهنگ',
        'قطع آهنگ',
        'قطع موزیک',
        'خروج',
        'توقف',
      ].includes(cmd)
    ) {
      const endCall = ['خروج', 'قطع ویسکال', 'قطع کال', 'قطع تماس', 'پایان تماس'].includes(cmd);
      const mins = group.voiceCallStartedAt
        ? Math.max(1, Math.round((Date.now() - new Date(group.voiceCallStartedAt).getTime()) / 60000))
        : 1;
      if (group.currentTrack) {
        group.pausedTrack = group.currentTrack;
        group.currentTrack = null;
        group.isPlaying = false;
        if (endCall) {
          if (wasCallActiveBefore) {
            systemBannerText = `گفتگوی گروهی به پایان رسید (${mins} دقیقه)`;
          }
          group.voiceCallActive = false;
          group.voiceCallStartedAt = undefined;
          this.enqueueVoiceCallTask({action: 'stop_vc', groupId: group.groupId, rubikaChatId: group.rubikaChatId});
        } else {
          this.enqueueVoiceCallTask({action: 'pause_vc', groupId: group.groupId, rubikaChatId: group.rubikaChatId});
        }
        replyText = endCall
          ? `⏹ ویسکال و پخش آهنگ «${group.pausedTrack.title}» متوقف شد.`
          : `⏹ پخش آهنگ «${group.pausedTrack.title}» قطع و ذخیره شد. برای ادامه بنویسید: ادامه آهنگ`;
      } else {
        group.isPlaying = false;
        if (endCall) {
          if (wasCallActiveBefore) {
            systemBannerText = `گفتگوی گروهی به پایان رسید (${mins} دقیقه)`;
          }
          group.voiceCallActive = false;
          group.voiceCallStartedAt = undefined;
          this.enqueueVoiceCallTask({action: 'stop_vc', groupId: group.groupId, rubikaChatId: group.rubikaChatId});
          replyText = '⏹ کال (ویسکال) گروه قطع و بسته شد.';
        } else {
          this.enqueueVoiceCallTask({action: 'pause_vc', groupId: group.groupId, rubikaChatId: group.rubikaChatId});
          replyText = '⏹ پخش آهنگ متوقف شد.';
        }
      }
    }
    // 14. Resume paused track
    else if (trimmed === 'ادامه آهنگ') {
      if (group.pausedTrack) {
        group.currentTrack = group.pausedTrack;
        group.pausedTrack = null;
        group.isPlaying = true;
        group.voiceCallActive = true;
        group.voiceCallId = group.voiceCallId || `vc_${Date.now()}`;
        group.voiceCallStartedAt = group.voiceCallStartedAt || nowIso;
        if (!wasCallActiveBefore) {
          systemBannerText = `${this.state.botName} یک گفتگوی گروهی را شروع کرد`;
        }
        this.recordTrackPlay(group, group.currentTrack);
        this.enqueueVoiceCallTask({
          action: 'play_in_vc',
          groupId: group.groupId,
          rubikaChatId: group.rubikaChatId,
          trackTitle: group.currentTrack.title,
          trackArtist: group.currentTrack.artist,
          streamUrl: group.currentTrack.streamUrl,
          volume: group.volume,
        });
        botAudioAttachment = {
          title: group.currentTrack.title,
          artist: group.currentTrack.artist,
          url: group.currentTrack.streamUrl,
          durationSec: group.currentTrack.durationSec,
        };
        replyText = `▶️ ادامه پخش آهنگ «${group.currentTrack.title}» در ویسکال.`;
      } else {
        replyText = '⚠ آهنگ متوقف‌شده‌ای برای ادامه وجود ندارد.';
      }
    }
    // 15. Queue display
    else if (trimmed === 'صف' || trimmed === 'لیست پخش') {
      if (group.queue.length === 0) {
        replyText = '📋 صف پخش در حال حاضر خالی است.';
      } else {
        const list = group.queue.map((t, idx) => `${idx + 1}. ${this.formatTrackInfo(t)}`).join('\n');
        replyText = `📋 لیست صف پخش (${group.queue.length} آهنگ):\n${list}`;
      }
    }
    // 16. Clear queue
    else if (trimmed === 'پاک کردن صف') {
      group.queue = [];
      replyText = '🗑 کل صف پخش خالی شد.';
    }
    // 17. Delete from queue by index
    else if (/^حذف از صف\s+\d+$/.test(trimmed)) {
      const idx = Number(trimmed.replace('حذف از صف', '').trim()) - 1;
      if (idx >= 0 && idx < group.queue.length) {
        const [removed] = group.queue.splice(idx, 1);
        replyText = `🗑 آهنگ «${removed.title}» از ردیف ${idx + 1} صف حذف شد.`;
      } else {
        replyText = `⚠ شماره ${idx + 1} در صف وجود ندارد.`;
      }
    }
    // 18. History (last 5)
    else if (trimmed === 'تاریخچه آهنگها' || trimmed === 'تاریخچه آهنگ‌ها') {
      const last5 = group.history.slice(-5).reverse();
      if (last5.length === 0) {
        replyText = '📜 هنوز آهنگی در تاریخچه ثبت نشده است.';
      } else {
        const lines = last5.map((t, idx) => `${idx + 1}. ${this.formatTrackInfo(t)}`).join('\n');
        replyText = `📜 ۵ آهنگ آخر پخش‌شده:\n${lines}`;
      }
    }
    // 19. Next track
    else if (trimmed === 'بعدی') {
      if (group.queue.length === 0) {
        replyText = '⚠ آهنگ بعدی در صف وجود ندارد.';
      } else {
        if (group.currentTrack) this.pushHistory(group, group.currentTrack);
        const nextTrack = group.queue.shift()!;
        group.currentTrack = nextTrack;
        group.pausedTrack = null;
        group.isPlaying = true;
        group.voiceCallActive = true;
        this.recordTrackPlay(group, nextTrack);
        botAudioAttachment = {
          title: nextTrack.title,
          artist: nextTrack.artist,
          url: nextTrack.streamUrl,
          durationSec: nextTrack.durationSec,
        };
        this.enqueueVoiceCallTask({
          action: 'play_in_vc',
          groupId: group.groupId,
          rubikaChatId: group.rubikaChatId,
          trackTitle: nextTrack.title,
          trackArtist: nextTrack.artist,
          streamUrl: nextTrack.streamUrl,
          volume: group.volume,
        });
        replyText = `⏭ پخش آهنگ بعدی از صف:\n🎶 ${this.formatTrackInfo(nextTrack)}`;
      }
    }
    // 20. Previous track
    else if (trimmed === 'قبلی') {
      if (group.history.length === 0) {
        replyText = '⚠ آهنگی در تاریخچه برای بازگشت وجود ندارد.';
      } else {
        const prevTrack = group.history.pop()!;
        if (group.currentTrack) {
          group.queue.unshift(group.currentTrack);
        }
        group.currentTrack = prevTrack;
        group.pausedTrack = null;
        group.isPlaying = true;
        group.voiceCallActive = true;
        this.recordTrackPlay(group, prevTrack);
        this.enqueueVoiceCallTask({
          action: 'play_in_vc',
          groupId: group.groupId,
          rubikaChatId: group.rubikaChatId,
          trackTitle: prevTrack.title,
          trackArtist: prevTrack.artist,
          streamUrl: prevTrack.streamUrl,
          volume: group.volume,
        });
        botAudioAttachment = {
          title: prevTrack.title,
          artist: prevTrack.artist,
          url: prevTrack.streamUrl,
          durationSec: prevTrack.durationSec,
        };
        replyText = `⏮ بازگشت به آهنگ قبلی:\n🎶 ${this.formatTrackInfo(prevTrack)}`;
      }
    }
    // 20b. Archive stats command
    else if (trimmed === 'آمار آرشیو' || trimmed === 'تعداد آهنگها' || trimmed === 'تعداد آهنگ‌ها') {
      const stats = musicCatalog.getStats();
      replyText = [
        `📚 آمار آرشیو موسیقی ربات:`,
        `🎵 کل آهنگ‌های آماده پخش: ${stats.total} آهنگ`,
        `🎉 آهنگ‌های شاد: ${stats.countsByMood['شاد'] || 0}`,
        `💔 آهنگ‌های غمگین: ${stats.countsByMood['غمگین'] || 0}`,
        `🏔 محلی و لری: ${stats.countsByMood['محلی و لری'] || 0}`,
        `🎼 سنتی و اصیل: ${stats.countsByMood['سنتی'] || 0}`,
        `🎤 پاپ و نوستالژی: ${(stats.countsByMood['پاپ'] || 0) + (stats.countsByMood['نوستالژی'] || 0)}`,
      ].join('\n');
    }
    // 21. Random playback (including mood variants: پخش رندوم شاد / پخش رندوم غمگین)
    else if (
      trimmed === 'پخش رندوم' ||
      trimmed === 'پخش رندوم شاد' ||
      trimmed === 'پخش شاد' ||
      trimmed === 'آهنگ شاد' ||
      trimmed === 'پخش رندوم غمگین' ||
      trimmed === 'پخش غمگین' ||
      trimmed === 'آهنگ غمگین'
    ) {
      const requestedMood: MusicMood | undefined = trimmed.includes('شاد')
        ? 'شاد'
        : trimmed.includes('غمگین')
          ? 'غمگین'
          : undefined;

      let chosen: Track | undefined;
      if (!requestedMood && group.queue.length > 0) {
        const randIdx = Math.floor(Math.random() * group.queue.length);
        [chosen] = group.queue.splice(randIdx, 1);
      } else {
        const fromCatalog = musicCatalog.pickRandom(requestedMood, 1, senderName);
        if (fromCatalog.length > 0) {
          chosen = fromCatalog[0];
        } else if (group.history.length > 0 && !requestedMood) {
          chosen = group.history[Math.floor(Math.random() * group.history.length)];
        } else {
          const fallbackQuery =
            requestedMood === 'شاد'
              ? 'بهنام بانی شاد'
              : requestedMood === 'غمگین'
                ? 'محسن چاوشی غمگین'
                : 'آهنگ شاد ایرانی';
          const results = await searchMusicReal(fallbackQuery, senderName);
          if (results.length > 0) {
            chosen = results[Math.floor(Math.random() * results.length)];
          }
        }
      }
      if (!chosen) {
        replyText = '⚠ آهنگی برای پخش تصادفی یافت نشد.';
      } else {
        if (group.currentTrack) this.pushHistory(group, group.currentTrack);
        group.currentTrack = chosen;
        group.pausedTrack = null;
        group.isPlaying = true;
        group.voiceCallActive = true;
        group.voiceCallId = group.voiceCallId || `vc_${Date.now()}`;
        group.voiceCallStartedAt = group.voiceCallStartedAt || nowIso;
        if (!wasCallActiveBefore) {
          systemBannerText = `${this.state.botName} یک گفتگوی گروهی را شروع کرد`;
        }
        this.recordTrackPlay(group, chosen);
        this.enqueueVoiceCallTask({
          action: 'play_in_vc',
          groupId: group.groupId,
          rubikaChatId: group.rubikaChatId,
          trackTitle: chosen.title,
          trackArtist: chosen.artist,
          streamUrl: chosen.streamUrl,
          volume: group.volume,
        });
        botAudioAttachment = {
          title: chosen.title,
          artist: chosen.artist,
          url: chosen.streamUrl,
          durationSec: chosen.durationSec,
        };
        const moodLabel = requestedMood ? ` (${requestedMood})` : '';
        replyText = `🎲 پخش تصادفی${moodLabel} در ویسکال:\n🎶 ${this.formatTrackInfo(chosen)}`;
      }
    }
    // 22. Direct link / Reply play / Instant play / Add to queue
    else if (
      trimmed.startsWith('پخش ویسکال ') ||
      trimmed === 'پخش ریپلای' ||
      trimmed === 'پخش فوری' ||
      trimmed.startsWith('پخش فوری ') ||
      trimmed === 'اضافه به صف' ||
      trimmed.startsWith('اضافه به صف ') ||
      trimmed === 'افزودن به صف' ||
      trimmed === 'به صف' ||
      ((Boolean(replyTargetAudioUrl) || Boolean(params.replyToMessageId)) &&
        [
          'پخش',
          'پخش کن',
          'اینو پخش کن',
          'پخش ریپلای',
          'پخش در ویسکال',
          'پخش تو ویسکال',
          'پخش ویسکال',
          'پخش فوری',
          'پخش آهنگ',
          'پخش موزیک',
          'بخوان',
          'بخون',
          'play',
          'اضافه به صف',
          'افزودن به صف',
          'به صف',
        ].includes(cmdLower))
    ) {
      const inlineUrl = trimmed.match(/https?:\/\/\S+/i)?.[0];
      const rawUrl = inlineUrl || replyTargetAudioUrl;
      const isQueueAction =
        cmdLower.startsWith('اضافه به صف') || cmdLower === 'افزودن به صف' || cmdLower === 'به صف';
      if (!rawUrl) {
        replyText =
          '⚠ لطفاً روی یک پیام حاوی فایل صوتی، ویس یا لینک مستقیم ریپلای کنید و بنویسید: پخش';
      } else {
        const track = buildTrackFromDirectUrl(
          rawUrl,
          senderName,
          inlineUrl ? undefined : replyTargetTitle,
          replyTargetAudioUrl ? 'reply' : 'direct',
        );
        if (!track) {
          replyText = '❌ لینک یا فایل صوتی وارد شده معتبر نیست.';
        } else if (isQueueAction) {
          group.queue.push(track);
          replyText = `➕ آهنگ «${track.title}» به انتهای صف اضافه شد (موقعیت: ${group.queue.length}).`;
        } else {
          if (group.currentTrack) this.pushHistory(group, group.currentTrack);
          group.currentTrack = track;
          group.pausedTrack = null;
          group.isPlaying = true;
          group.voiceCallActive = true;
          group.voiceCallId = group.voiceCallId || `vc_${Date.now()}`;
          group.voiceCallStartedAt = group.voiceCallStartedAt || nowIso;
          uiAction = 'open_voice_panel';
          if (!wasCallActiveBefore) {
            systemBannerText = `${this.state.botName} یک گفتگوی گروهی را شروع کرد`;
          }
          this.recordTrackPlay(group, track);
          const quota = this.incrementDailyQuota(group);
          this.enqueueVoiceCallTask({
            action: 'play_in_vc',
            groupId: group.groupId,
            rubikaChatId: group.rubikaChatId,
            trackTitle: track.title,
            trackArtist: track.artist,
            streamUrl: track.streamUrl,
            volume: group.volume,
          });
          botAudioAttachment = {
            title: track.title,
            artist: track.artist,
            url: track.streamUrl,
            durationSec: track.durationSec,
          };
          replyText = [
            '🎶 پخش آغاز شد',
            `🎵 ${track.artist}   ${track.title}`,
            `📊 سهمیه امروز: ${quota.count}/${quota.limit}`,
          ].join('\n');
        }
      }
    }
    // 22b. Download & Send Song to Chat: دانلود آهنگ {نام} | دانلود موزیک {نام} | دانلود {نام}
    else if (
      cmd.startsWith('دانلود آهنگ ') ||
      cmd.startsWith('دانلود موزیک ') ||
      cmd.startsWith('دانلود ')
    ) {
      const query = cmd
        .replace(/^(دانلود آهنگ|دانلود موزیک|دانلود)\s+/, '')
        .trim();
      if (!query) {
        replyText = '⚠ لطفاً نام آهنگ یا خواننده را بنویسید. مثال: دانلود آهنگ تتلو جدید';
      } else {
        let results = await searchMusicReal(query, senderName);
        if (results.length === 0) {
          const smartRes = await smartSearchOnlineSongs(query);
          results = smartRes.suggestions.map((s) => ({...s.track, requestedBy: senderName}));
        }
        searchResults = results;
        if (results.length === 0) {
          replyText = `❌ نتیجه‌ای برای «${query}» پیدا نشد. عبارت دیگری را امتحان کنید.`;
        } else {
          const chosen = results[0];
          const quota = this.incrementDailyQuota(group);
          botAudioAttachment = {
            title: chosen.title,
            artist: chosen.artist,
            url: chosen.streamUrl,
            durationSec: chosen.durationSec,
          };
          if (
            this.state.userbotStatus?.connected &&
            (group.rubikaChatId.startsWith('g0') || group.rubikaChatId.startsWith('c0'))
          ) {
            this.enqueueVoiceCallTask({
              action: 'send_audio_in_chat',
              groupId: group.groupId,
              rubikaChatId: group.rubikaChatId,
              trackTitle: chosen.title,
              trackArtist: chosen.artist,
              streamUrl: chosen.streamUrl,
            });
          }
          const mins = Math.floor((chosen.durationSec || 30) / 60);
          const secs = Math.floor((chosen.durationSec || 30) % 60);
          const durLabel = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
          replyText = [
            '⬇️ فایل آهنگ آماده دانلود و پخش است ✅',
            `🎵 ${chosen.artist} — ${chosen.title}`,
            `⏱ مدت: ${durLabel}`,
            `📊 سهمیه امروز: ${quota.count}/${quota.limit}`,
          ].join('\n');
        }
      }
    }
    // 23. Music search & auto voice call playback: پخش آهنگ {نام} | آهنگ {نام} | پخش موزیک {نام} | پخش {نام}
    else if (
      cmd.startsWith('پخش آهنگ ') ||
      cmd.startsWith('پخش موزیک ') ||
      cmd.startsWith('آهنگ ') ||
      cmd.startsWith('موزیک ') ||
      (cmd.startsWith('پخش ') &&
        !cmd.startsWith('پخش ویسکال ') &&
        !cmd.startsWith('پخش فوری ') &&
        !cmd.startsWith('پخش رندوم') &&
        !cmd.startsWith('پخش پلی') &&
        !['پخش کن', 'پخش شاد', 'پخش غمگین', 'پخش ریپلای', 'پخش در ویسکال', 'پخش تو ویسکال'].includes(
          cmd,
        ))
    ) {
      const query = cmd
        .replace(/^(پخش آهنگ|پخش موزیک|آهنگ|موزیک|پخش)\s+/, '')
        .trim();
      if (!query) {
        replyText = '⚠ لطفاً نام آهنگ را وارد کنید. مثال: پخش آهنگ تتلو جدید';
      } else {
        let results = await searchMusicReal(query, senderName);
        if (results.length === 0) {
          const smartRes = await smartSearchOnlineSongs(query);
          results = smartRes.suggestions.map((s) => ({...s.track, requestedBy: senderName}));
        }
        searchResults = results;
        if (results.length === 0) {
          replyText = `❌ نتیجه‌ای برای «${query}» پیدا نشد. عبارت دیگری را امتحان کنید یا لینک مستقیم بفرستید.`;
        } else {
          const chosen = results[0];
          if (group.currentTrack) this.pushHistory(group, group.currentTrack);
          group.currentTrack = chosen;
          group.pausedTrack = null;
          group.isPlaying = true;
          group.voiceCallActive = true;
          group.voiceCallId = group.voiceCallId || `vc_${Date.now()}`;
          group.voiceCallStartedAt = group.voiceCallStartedAt || nowIso;
          if (!wasCallActiveBefore) {
            systemBannerText = `${this.state.botName} یک گفتگوی گروهی را شروع کرد`;
          }
          this.recordTrackPlay(group, chosen);
          this.enqueueVoiceCallTask({
            action: 'play_in_vc',
            groupId: group.groupId,
            rubikaChatId: group.rubikaChatId,
            trackTitle: chosen.title,
            trackArtist: chosen.artist,
            streamUrl: chosen.streamUrl,
            volume: group.volume,
          });
          const quota = this.incrementDailyQuota(group);
          botAudioAttachment = {
            title: chosen.title,
            artist: chosen.artist,
            url: chosen.streamUrl,
            durationSec: chosen.durationSec,
          };
          replyText = [
            '🎶 پخش آغاز شد',
            `🎵 ${chosen.artist}   ${chosen.title}`,
            `📊 سهمیه امروز: ${quota.count}/${quota.limit}`,
          ].join('\n');
        }
      }
    }
    // 23b. Calm / Mellow music shortcut command (موزیک ملایم / آهنگ آرام)
    else if (
      ['موزیک ملایم', 'آهنگ ملایم', 'موسیقی ملایم', 'آهنگ آرام', 'موزیک آرام', 'ملایم'].includes(
        trimmed,
      )
    ) {
      let chosen = musicCatalog.pickRandom('آرام', 1, senderName)[0];
      if (!chosen) {
        const results = await searchMusicReal('آهنگ ملایم بی کلام آرام', senderName);
        chosen = results[0];
      }
      if (!chosen) {
        replyText = '⚠ آهنگی با حال‌وهوای ملایم یافت نشد.';
      } else {
        if (group.currentTrack) this.pushHistory(group, group.currentTrack);
        group.currentTrack = chosen;
        group.pausedTrack = null;
        group.isPlaying = true;
        group.voiceCallActive = true;
        group.voiceCallId = group.voiceCallId || `vc_${Date.now()}`;
        group.voiceCallStartedAt = group.voiceCallStartedAt || nowIso;
        if (!wasCallActiveBefore) {
          systemBannerText = `${this.state.botName} یک گفتگوی گروهی را شروع کرد`;
        }
        this.recordTrackPlay(group, chosen);
        this.enqueueVoiceCallTask({
          action: 'play_in_vc',
          groupId: group.groupId,
          rubikaChatId: group.rubikaChatId,
          trackTitle: chosen.title,
          trackArtist: chosen.artist,
          streamUrl: chosen.streamUrl,
          volume: group.volume,
        });
        botAudioAttachment = {
          title: chosen.title,
          artist: chosen.artist,
          url: chosen.streamUrl,
          durationSec: chosen.durationSec,
        };
        replyText = `🌿 پخش موزیک ملایم و آرام در ویسکال:\n🎶 ${this.formatTrackInfo(chosen)}`;
      }
    }
    // 23c. Rest / Break shortcut command (استراحت)
    else if (['استراحت', 'حالت استراحت', 'استراحت ویسکال'].includes(trimmed)) {
      if (group.currentTrack) {
        group.pausedTrack = group.currentTrack;
        group.currentTrack = null;
      }
      group.isPlaying = false;
      replyText = group.pausedTrack
        ? `☕ حالت استراحت فعال شد؛ آهنگ «${group.pausedTrack.title}» موقتاً متوقف گردید (برای ادامه: ادامه آهنگ).`
        : '☕ ویسکال در حالت استراحت قرار گرفت.';
    } else if (deferredAdminAction) {
      this.saveState();
      return {group, userMessage, botMessage: null, deferredAdminAction};
    } else if (params.allowBroadcastText) {
      replyText = `📣 پیام میانبر ویس‌چت:\n${trimmed}`;
    } else {
      // Unknown text — no bot spam unless it looks like a command
      this.saveState();
      return {group, userMessage, botMessage: null};
    }

    let deliveredToRubika = false;
    let rubikaMessageId: string | undefined;

    if (params.sendToRubika && group.rubikaChatId) {
      const canAttachKeypad =
        !group.rubikaChatId.startsWith('g0') && !group.rubikaChatId.startsWith('c0');
      const activeKeypad = canAttachKeypad
        ? this.buildRubikaKeypad(group.activeKeypadMenu || 'main')
        : undefined;
      const keypadFields = activeKeypad
        ? {chat_keypad: activeKeypad, chat_keypad_type: 'New' as const}
        : {};
      const shouldSendFileInChat =
        Boolean(botAudioAttachment?.url) &&
        this.state.rubikaMode === 'bot_api_v3' &&
        Boolean(this.state.autoSyncAudioToRubika);
      if (shouldSendFileInChat && botAudioAttachment?.url) {
        const audioSend = await this.sendAudioFileToRubika({
          chatId: group.rubikaChatId,
          audioUrl: botAudioAttachment.url,
          title: botAudioAttachment.title,
          artist: botAudioAttachment.artist || 'ربات موزیکال',
          caption: replyText,
          replyToMessageId: params.rubikaReplyMessageId,
        });
        if (audioSend.ok) {
          deliveredToRubika = true;
          rubikaMessageId = audioSend.messageId;
        } else {
          const sendRes = await this.callRubikaApi('sendMessage', {
            chat_id: group.rubikaChatId,
            text: `${replyText}\n🔗 ${botAudioAttachment.url}`,
            ...keypadFields,
            ...(params.rubikaReplyMessageId ? {reply_to_message_id: params.rubikaReplyMessageId} : {}),
          });
          deliveredToRubika = sendRes.ok;
          if (sendRes.ok && sendRes.data) {
            const d = (sendRes.data.data as Record<string, unknown>) || sendRes.data;
            if (d.message_id) rubikaMessageId = String(d.message_id);
          }
        }
      } else {
        const inlineFields =
          canAttachKeypad && customInlineKeypad ? {inline_keypad: customInlineKeypad} : {};
        let sendRes = await this.callRubikaApi('sendMessage', {
          chat_id: group.rubikaChatId,
          text: replyText,
          ...inlineFields,
          ...keypadFields,
          ...(params.rubikaReplyMessageId ? {reply_to_message_id: params.rubikaReplyMessageId} : {}),
        });
        if (!sendRes.ok && (canAttachKeypad || customInlineKeypad)) {
          sendRes = await this.callRubikaApi('sendMessage', {
            chat_id: group.rubikaChatId,
            text: replyText,
            ...(params.rubikaReplyMessageId ? {reply_to_message_id: params.rubikaReplyMessageId} : {}),
          });
        }
        deliveredToRubika = sendRes.ok;
        if (sendRes.ok && sendRes.data) {
          const d = (sendRes.data.data as Record<string, unknown>) || sendRes.data;
          if (d.message_id) rubikaMessageId = String(d.message_id);
        }
      }
    }

    const botMessage: ChatMessage = {
      id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      groupId: group.groupId,
      senderId: 'bot_rubika',
      senderName: this.state.botName,
      senderRole: 'creator',
      text: replyText,
      isBot: true,
      replyToMessageId: userMessage.id,
      replySenderName: userMessage.senderName,
      replyPreview: userMessage.text.slice(0, 64),
      audioAttachment: botAudioAttachment,
      deliveredToRubika,
      rubikaMessageId,
      timestamp: new Date().toISOString(),
    };
    const newMsgs: ChatMessage[] = [botMessage];
    if (systemBannerText) {
      newMsgs.push({
        id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        groupId: group.groupId,
        senderId: 'system',
        senderName: this.state.botName,
        senderRole: 'creator',
        text: systemBannerText,
        isBot: true,
        isSystemEvent: true,
        timestamp: new Date().toISOString(),
      });
    }
    group.messages = [...group.messages, ...newMsgs].slice(-120);
    this.saveState();

    return {group, userMessage, botMessage, searchResults, uiAction, deferredAdminAction};
  }

  public playSpecificTrack(groupId: string, track: Track, mode: 'play_now' | 'queue'): GroupState | null {
    const group = this.state.groups[groupId];
    if (!group) return null;
    if (mode === 'queue') {
      group.queue.push(track);
      const queuedMsg: ChatMessage = {
        id: `b_${Date.now()}`,
        groupId: group.groupId,
        senderId: 'bot_rubika',
        senderName: this.state.botName,
        senderRole: 'creator',
        text: `➕ آهنگ «${track.title}» به صف پخش اضافه شد (شماره ${group.queue.length}).`,
        isBot: true,
        timestamp: new Date().toISOString(),
      };
      group.messages = [...group.messages, queuedMsg].slice(-120);
    } else {
      const wasCallActiveBefore = Boolean(group.voiceCallActive);
      if (group.currentTrack) this.pushHistory(group, group.currentTrack);
      group.currentTrack = track;
      group.pausedTrack = null;
      group.isPlaying = true;
      group.voiceCallActive = true;
      group.voiceCallId = group.voiceCallId || `vc_${Date.now()}`;
      group.voiceCallStartedAt = group.voiceCallStartedAt || new Date().toISOString();
      this.recordTrackPlay(group, track);
      const quota = this.incrementDailyQuota(group);
      this.enqueueVoiceCallTask({
        action: 'play_in_vc',
        groupId: group.groupId,
        rubikaChatId: group.rubikaChatId,
        trackTitle: track.title,
        trackArtist: track.artist,
        streamUrl: track.streamUrl,
        volume: group.volume,
      });
      const playMsg: ChatMessage = {
        id: `b_${Date.now()}`,
        groupId: group.groupId,
        senderId: 'bot_rubika',
        senderName: this.state.botName,
        senderRole: 'creator',
        text: `🎶 پخش آغاز شد\n🎵 ${track.title} — ${track.artist} 320\n📊 سهمیهٔ امروز: ${quota.count}/${quota.limit}`,
        isBot: true,
        audioAttachment: {
          title: track.title,
          artist: track.artist,
          url: track.streamUrl,
          durationSec: track.durationSec,
        },
        timestamp: new Date().toISOString(),
      };
      const added: ChatMessage[] = [playMsg];
      if (!wasCallActiveBefore) {
        added.push({
          id: `sys_${Date.now()}_start`,
          groupId: group.groupId,
          senderId: 'system',
          senderName: this.state.botName,
          senderRole: 'creator',
          text: `${this.state.botName} یک گفتگوی گروهی را شروع کرد`,
          isBot: true,
          isSystemEvent: true,
          timestamp: new Date().toISOString(),
        });
      }
      group.messages = [...group.messages, ...added].slice(-120);
      if (this.state.autoSyncAudioToRubika && this.state.pollingActive && group.rubikaChatId) {
        void this.sendTrackToRubikaGroup(group.groupId, track);
      }
    }
    this.saveState();
    return group;
  }

  public enqueueBulkTracks(groupId: string, tracks: Track[], moodLabel?: string): GroupState | null {
    const group = this.state.groups[groupId];
    if (!group || tracks.length === 0) return null;
    const wasCallActiveBefore = Boolean(group.voiceCallActive);
    let startedTrack: Track | null = null;
    group.queue.push(...tracks);
    if (!group.currentTrack) {
      const first = group.queue.shift()!;
      group.currentTrack = first;
      group.isPlaying = true;
      group.voiceCallActive = true;
      group.voiceCallId = group.voiceCallId || `vc_${Date.now()}`;
      group.voiceCallStartedAt = group.voiceCallStartedAt || new Date().toISOString();
      this.recordTrackPlay(group, first);
      startedTrack = first;
      this.enqueueVoiceCallTask({
        action: 'play_in_vc',
        groupId: group.groupId,
        rubikaChatId: group.rubikaChatId,
        trackTitle: first.title,
        trackArtist: first.artist,
        streamUrl: first.streamUrl,
        volume: group.volume,
      });
    }
    const noticeMsg: ChatMessage = {
      id: `b_${Date.now()}`,
      groupId: group.groupId,
      senderId: 'bot_rubika',
      senderName: this.state.botName,
      senderRole: 'creator',
      text: `🎶 ${tracks.length} آهنگ ${moodLabel ? `(${moodLabel}) ` : ''}به صف پخش ویسکال اضافه شد.`,
      isBot: true,
      timestamp: new Date().toISOString(),
    };
    const added: ChatMessage[] = [noticeMsg];
    if (startedTrack && !wasCallActiveBefore) {
      added.push({
        id: `sys_${Date.now()}_bulk`,
        groupId: group.groupId,
        senderId: 'system',
        senderName: this.state.botName,
        senderRole: 'creator',
        text: `${this.state.botName} یک گفتگوی گروهی را شروع کرد`,
        isBot: true,
        isSystemEvent: true,
        timestamp: new Date().toISOString(),
      });
    }
    group.messages = [...group.messages, ...added].slice(-120);
    this.saveState();
    return group;
  }

  public applySmartPlaylist(
    groupId: string,
    input: {
      name: string;
      moods: MusicMood[];
      tracks: Track[];
      balanceMode: 'interleaved' | 'shuffled';
      startMode: 'replace_and_play' | 'append_queue';
      savePreset?: boolean;
      adaptMode?: SmartPlaylistAdaptMode;
      timeSlot?: SmartPlaylistTimeSlot;
      autoAdaptEnabled?: boolean;
      timezoneOffsetMinutes?: number;
      adaptSummary?: string;
      resolvedSlot?: string;
    },
  ): GroupState | null {
    const group = this.state.groups[groupId];
    if (!group || input.tracks.length === 0) return null;

    const wasCallActiveBefore = Boolean(group.voiceCallActive);
    let startedTrack: Track | null = null;

    if (input.startMode === 'replace_and_play') {
      if (group.currentTrack) {
        this.pushHistory(group, group.currentTrack);
      }
      const [first, ...rest] = input.tracks;
      group.currentTrack = first;
      group.pausedTrack = null;
      group.queue = rest;
      group.isPlaying = true;
      group.voiceCallActive = true;
      group.voiceCallId = group.voiceCallId || `vc_${Date.now()}`;
      group.voiceCallStartedAt = group.voiceCallStartedAt || new Date().toISOString();
      this.recordTrackPlay(group, first);
      startedTrack = first;
    } else {
      group.queue.push(...input.tracks);
      if (!group.currentTrack) {
        const first = group.queue.shift()!;
        group.currentTrack = first;
        group.isPlaying = true;
        group.voiceCallActive = true;
        group.voiceCallId = group.voiceCallId || `vc_${Date.now()}`;
        group.voiceCallStartedAt = group.voiceCallStartedAt || new Date().toISOString();
        this.recordTrackPlay(group, first);
        startedTrack = first;
      }
    }

    if (startedTrack) {
      this.enqueueVoiceCallTask({
        action: 'play_in_vc',
        groupId: group.groupId,
        rubikaChatId: group.rubikaChatId,
        trackTitle: startedTrack.title,
        trackArtist: startedTrack.artist,
        streamUrl: startedTrack.streamUrl,
        volume: group.volume,
      });
    }

    if (input.savePreset) {
      const preset: SmartPlaylistPreset = {
        id: `pl_${Date.now()}`,
        name: input.name,
        moods: input.moods,
        trackCount: input.tracks.length,
        balanceMode: input.balanceMode,
        adaptMode: input.adaptMode || 'manual',
        timeSlot: input.timeSlot,
        createdAt: new Date().toISOString(),
      };
      group.savedPlaylists = [preset, ...(group.savedPlaylists || [])].slice(0, 12);
    }

    if (typeof input.autoAdaptEnabled === 'boolean' || (input.adaptMode && input.adaptMode !== 'manual')) {
      const resolvedAdaptMode = input.adaptMode || group.smartPlaylistRule?.mode || 'manual';
      group.smartPlaylistRule = {
        enabled:
          typeof input.autoAdaptEnabled === 'boolean'
            ? input.autoAdaptEnabled
            : resolvedAdaptMode !== 'manual',
        mode: resolvedAdaptMode,
        timeSlot: input.timeSlot || group.smartPlaylistRule?.timeSlot || 'auto_now',
        moods: input.moods,
        trackCount: input.tracks.length,
        balanceMode: input.balanceMode,
        timezoneOffsetMinutes:
          input.timezoneOffsetMinutes ?? group.smartPlaylistRule?.timezoneOffsetMinutes ?? -210,
        lastAdaptedAt: new Date().toISOString(),
        lastSlotApplied: input.resolvedSlot || group.smartPlaylistRule?.lastSlotApplied || null,
        lastEventCount: group.playbackEvents?.length || 0,
        lastReason: input.adaptSummary || null,
      };
    }

    const moodStr = input.moods.join(' + ');
    const actionLabel =
      input.startMode === 'replace_and_play'
        ? 'پخش متوالی در ویس‌چت آغاز شد'
        : 'به صف پخش اضافه شد';

    const msg: ChatMessage = {
      id: `b_mix_${Date.now()}`,
      groupId: group.groupId,
      senderId: 'bot_rubika',
      senderName: this.state.botName,
      senderRole: 'creator',
      text: `🎛 پلی‌لیست هوشمند «${input.name}» (${input.tracks.length} آهنگ · ${moodStr}) ${actionLabel}.${input.adaptSummary ? `\n✨ ${input.adaptSummary}` : ''}\n🎵 آهنگ اول: ${group.currentTrack?.title || input.tracks[0].title}`,
      isBot: true,
      audioAttachment: {
        title: input.tracks[0].title,
        artist: input.tracks[0].artist,
        url: input.tracks[0].streamUrl,
        durationSec: input.tracks[0].durationSec,
      },
      timestamp: new Date().toISOString(),
    };
    const added: ChatMessage[] = [msg];
    if (startedTrack && !wasCallActiveBefore) {
      added.push({
        id: `sys_${Date.now()}_mix`,
        groupId: group.groupId,
        senderId: 'system',
        senderName: this.state.botName,
        senderRole: 'creator',
        text: `${this.state.botName} یک گفتگوی گروهی را شروع کرد`,
        isBot: true,
        isSystemEvent: true,
        timestamp: new Date().toISOString(),
      });
    }
    group.messages = [...group.messages, ...added].slice(-120);
    this.addLog('SMART_PLAYLIST', 'info', `${group.title}: ${input.name} (${input.tracks.length} tracks)`);
    this.saveState();
    return group;
  }

  public setSmartPlaylistRule(
    groupId: string,
    input: {
      enabled: boolean;
      mode: SmartPlaylistAdaptMode;
      timeSlot: SmartPlaylistTimeSlot;
      moods: MusicMood[];
      trackCount: number;
      balanceMode: 'interleaved' | 'shuffled';
      timezoneOffsetMinutes?: number;
      applyNow?: boolean;
    },
  ): {group: GroupState | null; adaptSummary?: string} {
    const group = this.state.groups[groupId];
    if (!group) return {group: null};

    const tzOffset =
      typeof input.timezoneOffsetMinutes === 'number' && Number.isFinite(input.timezoneOffsetMinutes)
        ? input.timezoneOffsetMinutes
        : group.smartPlaylistRule?.timezoneOffsetMinutes ?? -210;

    let adaptSummary: string | undefined;
    let resolvedSlot: string | undefined;
    let effectiveMoods = input.moods;

    if (input.applyNow || (input.enabled && input.mode !== 'manual')) {
      const mix = musicCatalog.buildSmartMix({
        moods: input.moods,
        totalCount: input.trackCount || 20,
        balanceMode: input.balanceMode || 'interleaved',
        requestedBy:
          input.mode === 'vc_popularity' ? 'تطبیق محبوبیت ویسکال' : 'تطبیق بازه زمانی',
        adaptMode: input.mode,
        timeSlot: input.timeSlot,
        timezoneOffsetMinutes: tzOffset,
        popularityEvents: group.playbackEvents || [],
        history: group.history || [],
      });
      if (mix.tracks.length > 0) {
        group.queue = mix.tracks;
        adaptSummary = mix.adaptSummary;
        resolvedSlot = mix.resolvedSlot;
        effectiveMoods = mix.effectiveMoods;
      }
    }

    const rule: SmartPlaylistRule = {
      enabled: Boolean(input.enabled),
      mode: input.mode,
      timeSlot: input.timeSlot,
      moods: effectiveMoods,
      trackCount: Math.min(80, Math.max(2, input.trackCount || 20)),
      balanceMode: input.balanceMode || 'interleaved',
      timezoneOffsetMinutes: tzOffset,
      lastAdaptedAt: adaptSummary ? new Date().toISOString() : group.smartPlaylistRule?.lastAdaptedAt || null,
      lastSlotApplied: resolvedSlot || group.smartPlaylistRule?.lastSlotApplied || null,
      lastEventCount: group.playbackEvents?.length || 0,
      lastReason: adaptSummary || group.smartPlaylistRule?.lastReason || null,
    };

    group.smartPlaylistRule = rule;
    if (adaptSummary) {
      const ruleMsg: ChatMessage = {
        id: `b_rule_${Date.now()}`,
        groupId: group.groupId,
        senderId: 'bot_rubika',
        senderName: this.state.botName,
        senderRole: 'creator',
        text: `🔄 لیست آهنگ‌های پلی‌لیست هوشمند بر اساس «${input.mode === 'vc_popularity' ? 'محبوبیت در ویسکال‌ها' : input.mode === 'time_slot' ? 'بازه زمانی مشخص' : 'چیدمان دستی'}» به‌روزرسانی شد.\n✨ ${adaptSummary}`,
        isBot: true,
        timestamp: new Date().toISOString(),
      };
      group.messages = [...group.messages, ruleMsg].slice(-120);
      this.addLog('SMART_PLAYLIST_RULE', 'info', `${group.title}: ${adaptSummary}`);
    }
    this.saveState();
    return {group, adaptSummary};
  }

  public deleteSavedPlaylist(groupId: string, playlistId: string): GroupState | null {
    const group = this.state.groups[groupId];
    if (!group) return null;
    group.savedPlaylists = (group.savedPlaylists || []).filter((p) => p.id !== playlistId);
    this.saveState();
    return group;
  }

  public getCustomPlaylists(groupId: string): CustomPlaylist[] {
    const group = this.state.groups[groupId] || this.state.groups[this.state.activeGroupId];
    return group?.customPlaylists || [];
  }

  public createCustomPlaylist(
    groupId: string,
    input: {
      name: string;
      createdBy?: string;
      createdById?: string;
      initialTracks?: Track[];
    },
  ): {ok: boolean; playlist?: CustomPlaylist; group?: GroupState; error?: string} {
    const group = this.state.groups[groupId] || this.state.groups[this.state.activeGroupId];
    if (!group) return {ok: false, error: 'گروه پیدا نشد.'};
    const cleanName = this.normalizePlaylistCmd(input.name);
    if (!cleanName) {
      return {ok: false, error: 'نام پلی‌لیست نمی‌تواند خالی باشد.'};
    }
    const existing = (group.customPlaylists || []).find(
      (p) => this.normalizePlaylistCmd(p.name).toLowerCase() === cleanName.toLowerCase(),
    );
    if (existing) {
      return {ok: false, error: `پلی‌لیست با نام «${existing.name}» از قبل وجود دارد.`};
    }
    const nowIso = new Date().toISOString();
    const playlist: CustomPlaylist = {
      id: `cpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      createdBy: input.createdBy || this.state.creatorName,
      createdById: input.createdById || this.state.creatorId,
      tracks: Array.isArray(input.initialTracks) ? [...input.initialTracks] : [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    group.customPlaylists = [playlist, ...(group.customPlaylists || [])].slice(0, 50);
    this.addLog('CUSTOM_PLAYLIST_CREATE', 'info', `${group.title}: ساخته شد «${playlist.name}»`);
    this.saveState();
    return {ok: true, playlist, group};
  }

  public renameCustomPlaylist(
    groupId: string,
    playlistId: string,
    newName: string,
  ): {ok: boolean; playlist?: CustomPlaylist; group?: GroupState; error?: string} {
    const group = this.state.groups[groupId] || this.state.groups[this.state.activeGroupId];
    if (!group) return {ok: false, error: 'گروه پیدا نشد.'};
    const lists = group.customPlaylists || [];
    const target = lists.find((p) => p.id === playlistId);
    if (!target) return {ok: false, error: 'پلی‌لیست پیدا نشد.'};
    const cleanNew = this.normalizePlaylistCmd(newName);
    if (!cleanNew) return {ok: false, error: 'نام جدید پلی‌لیست معتبر نیست.'};
    const duplicate = lists.find(
      (p) =>
        p.id !== playlistId &&
        this.normalizePlaylistCmd(p.name).toLowerCase() === cleanNew.toLowerCase(),
    );
    if (duplicate) {
      return {ok: false, error: `پلی‌لیست دیگری با نام «${duplicate.name}» وجود دارد.`};
    }
    target.name = cleanNew;
    target.updatedAt = new Date().toISOString();
    this.addLog('CUSTOM_PLAYLIST_RENAME', 'info', `${group.title}: تغییر نام به «${cleanNew}»`);
    this.saveState();
    return {ok: true, playlist: target, group};
  }

  public deleteCustomPlaylist(
    groupId: string,
    playlistId: string,
  ): {ok: boolean; group?: GroupState; error?: string} {
    const group = this.state.groups[groupId] || this.state.groups[this.state.activeGroupId];
    if (!group) return {ok: false, error: 'گروه پیدا نشد.'};
    const before = (group.customPlaylists || []).length;
    group.customPlaylists = (group.customPlaylists || []).filter((p) => p.id !== playlistId);
    if (group.customPlaylists.length === before) {
      return {ok: false, error: 'پلی‌لیست پیدا نشد.'};
    }
    this.addLog('CUSTOM_PLAYLIST_DELETE', 'info', `${group.title}: حذف پلی‌لیست ${playlistId}`);
    this.saveState();
    return {ok: true, group};
  }

  public addTrackToCustomPlaylist(
    groupId: string,
    playlistId: string,
    track: Track,
  ): {ok: boolean; playlist?: CustomPlaylist; group?: GroupState; error?: string} {
    const group = this.state.groups[groupId] || this.state.groups[this.state.activeGroupId];
    if (!group) return {ok: false, error: 'گروه پیدا نشد.'};
    const target = (group.customPlaylists || []).find((p) => p.id === playlistId);
    if (!target) return {ok: false, error: 'پلی‌لیست پیدا نشد.'};
    target.tracks = [...target.tracks, track].slice(0, 150);
    target.updatedAt = new Date().toISOString();
    this.addLog(
      'CUSTOM_PLAYLIST_ADD_TRACK',
      'info',
      `${group.title}: «${track.title}» -> «${target.name}»`,
    );
    this.saveState();
    return {ok: true, playlist: target, group};
  }

  public removeTrackFromCustomPlaylist(
    groupId: string,
    playlistId: string,
    trackIndex: number,
  ): {ok: boolean; playlist?: CustomPlaylist; group?: GroupState; error?: string} {
    const group = this.state.groups[groupId] || this.state.groups[this.state.activeGroupId];
    if (!group) return {ok: false, error: 'گروه پیدا نشد.'};
    const target = (group.customPlaylists || []).find((p) => p.id === playlistId);
    if (!target) return {ok: false, error: 'پلی‌لیست پیدا نشد.'};
    if (trackIndex < 0 || trackIndex >= target.tracks.length) {
      return {ok: false, error: 'شماره آهنگ در پلی‌لیست معتبر نیست.'};
    }
    target.tracks.splice(trackIndex, 1);
    target.updatedAt = new Date().toISOString();
    this.saveState();
    return {ok: true, playlist: target, group};
  }

  public playCustomPlaylist(
    groupId: string,
    playlistId: string,
    mode: 'replace_and_play' | 'append_queue' = 'replace_and_play',
  ): {ok: boolean; group?: GroupState; startedTrack?: Track | null; error?: string} {
    const group = this.state.groups[groupId] || this.state.groups[this.state.activeGroupId];
    if (!group) return {ok: false, error: 'گروه پیدا نشد.'};
    const target = (group.customPlaylists || []).find((p) => p.id === playlistId);
    if (!target) return {ok: false, error: 'پلی‌لیست پیدا نشد.'};
    if (target.tracks.length === 0) {
      return {ok: false, error: `پلی‌لیست «${target.name}» خالی است.`};
    }

    const wasCallActiveBefore = Boolean(group.voiceCallActive);
    let startedTrack: Track | null = null;
    const tracksCopy = target.tracks.map((t) => ({...t}));

    if (mode === 'replace_and_play') {
      if (group.currentTrack) this.pushHistory(group, group.currentTrack);
      const [first, ...rest] = tracksCopy;
      group.currentTrack = first;
      group.pausedTrack = null;
      group.queue = rest;
      group.isPlaying = true;
      group.voiceCallActive = true;
      group.voiceCallId = group.voiceCallId || `vc_${Date.now()}`;
      group.voiceCallStartedAt = group.voiceCallStartedAt || new Date().toISOString();
      this.recordTrackPlay(group, first);
      startedTrack = first;
    } else {
      group.queue.push(...tracksCopy);
      if (!group.currentTrack) {
        const first = group.queue.shift()!;
        group.currentTrack = first;
        group.isPlaying = true;
        group.voiceCallActive = true;
        group.voiceCallId = group.voiceCallId || `vc_${Date.now()}`;
        group.voiceCallStartedAt = group.voiceCallStartedAt || new Date().toISOString();
        this.recordTrackPlay(group, first);
        startedTrack = first;
      } else {
        startedTrack = group.currentTrack;
      }
    }

    if (startedTrack) {
      this.enqueueVoiceCallTask({
        action: 'play_in_vc',
        groupId: group.groupId,
        rubikaChatId: group.rubikaChatId,
        trackTitle: startedTrack.title,
        trackArtist: startedTrack.artist,
        streamUrl: startedTrack.streamUrl,
        volume: group.volume,
      });
    }

    const actionText =
      mode === 'replace_and_play'
        ? `پخش آنی در ویسکال آغاز شد (آهنگ اول: ${tracksCopy[0].title})`
        : `به صف پخش اضافه شد (${tracksCopy.length} آهنگ)`;

    const added: ChatMessage[] = [
      {
        id: `b_cpl_${Date.now()}`,
        groupId: group.groupId,
        senderId: 'bot_rubika',
        senderName: this.state.botName,
        senderRole: 'creator',
        text: `🎶 پلی‌لیست «${target.name}» (${tracksCopy.length} آهنگ) ${actionText}.`,
        isBot: true,
        audioAttachment: {
          title: tracksCopy[0].title,
          artist: tracksCopy[0].artist,
          url: tracksCopy[0].streamUrl,
          durationSec: tracksCopy[0].durationSec,
        },
        timestamp: new Date().toISOString(),
      },
    ];
    if (!wasCallActiveBefore && mode === 'replace_and_play') {
      added.push({
        id: `sys_cpl_${Date.now()}`,
        groupId: group.groupId,
        senderId: 'system',
        senderName: this.state.botName,
        senderRole: 'creator',
        text: `${this.state.botName} یک گفتگوی گروهی را شروع کرد`,
        isBot: true,
        isSystemEvent: true,
        timestamp: new Date().toISOString(),
      });
    }
    group.messages = [...group.messages, ...added].slice(-120);
    this.addLog('CUSTOM_PLAYLIST_PLAY', 'info', `${group.title}: «${target.name}» (${mode})`);
    this.saveState();
    return {ok: true, group, startedTrack};
  }

  public addVoiceNoteMessage(
    groupId: string,
    senderId: string,
    audioUrl: string,
    durationSec: number,
    customTitle?: string,
  ): GroupState | null {
    const group = this.state.groups[groupId] || this.state.groups[this.state.activeGroupId];
    if (!group) return null;
    const senderRole = this.getMemberRole(group, senderId);
    const member = group.members.find((m) => m.userId === senderId);
    const senderName = member?.name || `کاربر ${senderId}`;
    const cleanTitle = customTitle?.trim();

    const voiceMsg: ChatMessage = {
      id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      groupId: group.groupId,
      senderId,
      senderName,
      senderRole,
      text: cleanTitle
        ? `🎵 فایل صوتی «${cleanTitle}» ارسال شد — برای پخش در ویسکال روی این پیام ریپلای کنید و «پخش» یا «پخش کن» بفرستید.`
        : `🎤 پیام صوتی (${Math.max(1, Math.round(durationSec))} ثانیه) — برای پخش در ویسکال روی این پیام ریپلای کنید و «پخش» یا «پخش کن» بفرستید.`,
      isBot: false,
      audioAttachment: {
        title: cleanTitle || `ویس ${senderName}`,
        artist: senderName,
        url: audioUrl,
        durationSec: Math.max(1, Math.round(durationSec)),
      },
      timestamp: new Date().toISOString(),
    };
    group.messages = [...group.messages, voiceMsg].slice(-120);
    this.saveState();
    return group;
  }

  public handleTrackEnded(groupId: string, expectedTitle?: string): GroupState | null {
    const group = this.state.groups[groupId];
    if (!group) return null;
    if (expectedTitle && group.currentTrack?.title !== expectedTitle) {
      return group;
    }
    if (group.currentTrack) {
      this.pushHistory(group, group.currentTrack);
    }
    if (group.queue.length > 0) {
      const nextTrack = group.queue.shift()!;
      group.currentTrack = nextTrack;
      group.isPlaying = true;
      this.recordTrackPlay(group, nextTrack);
      this.enqueueVoiceCallTask({
        action: 'play_in_vc',
        groupId: group.groupId,
        rubikaChatId: group.rubikaChatId,
        trackTitle: nextTrack.title,
        trackArtist: nextTrack.artist,
        streamUrl: nextTrack.streamUrl,
        volume: group.volume,
      });
    } else {
      group.currentTrack = null;
      group.isPlaying = false;
    }
    this.saveState();
    return group;
  }

  public joinVoiceCallAndPlay(groupId: string): GroupState | null {
    const group = this.state.groups[groupId] || this.state.groups[this.state.activeGroupId];
    if (!group) return null;

    const wasCallActiveBefore = Boolean(group.voiceCallActive);
    group.voiceCallActive = true;
    group.voiceCallId = group.voiceCallId || `vc_${Date.now()}`;
    group.voiceCallStartedAt = group.voiceCallStartedAt || new Date().toISOString();

    let activatedTrack = group.currentTrack;

    if (!activatedTrack && group.pausedTrack) {
      activatedTrack = group.pausedTrack;
      group.currentTrack = activatedTrack;
      group.pausedTrack = null;
      group.isPlaying = true;
    } else if (!activatedTrack && group.queue.length > 0) {
      activatedTrack = group.queue.shift()!;
      group.currentTrack = activatedTrack;
      group.isPlaying = true;
      this.recordTrackPlay(group, activatedTrack);
      this.incrementDailyQuota(group);
    } else if (!activatedTrack) {
      const picked = musicCatalog.pickRandom(undefined, 1, this.state.creatorName)[0];
      if (picked) {
        activatedTrack = picked;
        group.currentTrack = picked;
        group.isPlaying = true;
        this.recordTrackPlay(group, picked);
        const quota = this.incrementDailyQuota(group);
        group.messages = [
          ...group.messages,
          {
            id: `b_join_${Date.now()}`,
            groupId: group.groupId,
            senderId: 'bot_rubika',
            senderName: this.state.botName,
            senderRole: 'creator' as const,
            text: `🎶 پخش آغاز شد\n🎵 ${picked.title} — ${picked.artist} 320\n📊 سهمیهٔ امروز: ${quota.count}/${quota.limit}`,
            isBot: true,
            audioAttachment: {
              title: picked.title,
              artist: picked.artist,
              url: picked.streamUrl,
              durationSec: picked.durationSec,
            },
            timestamp: new Date().toISOString(),
          },
        ].slice(-120);
      }
    } else {
      group.isPlaying = true;
    }

    if (activatedTrack) {
      this.enqueueVoiceCallTask({
        action: 'play_in_vc',
        groupId: group.groupId,
        rubikaChatId: group.rubikaChatId,
        trackTitle: activatedTrack.title,
        trackArtist: activatedTrack.artist,
        streamUrl: activatedTrack.streamUrl,
        volume: group.volume,
      });
    } else {
      this.enqueueVoiceCallTask({
        action: 'start_call',
        groupId: group.groupId,
        rubikaChatId: group.rubikaChatId,
        volume: group.volume,
      });
    }

    if (!wasCallActiveBefore) {
      group.messages = [
        ...group.messages,
        {
          id: `sys_join_${Date.now()}`,
          groupId: group.groupId,
          senderId: 'system',
          senderName: this.state.botName,
          senderRole: 'creator' as const,
          text: `${this.state.botName} یک گفتگوی گروهی را شروع کرد`,
          isBot: true,
          isSystemEvent: true,
          timestamp: new Date().toISOString(),
        },
      ].slice(-120);
    }

    this.saveState();
    return group;
  }

  public getGroupAnalytics(groupId: string, tzOffsetMinutes?: number): GroupAnalyticsResponse | null {
    const group = this.state.groups[groupId] || this.state.groups[this.state.activeGroupId];
    if (!group) return null;

    const tzOffset =
      typeof tzOffsetMinutes === 'number' && Number.isFinite(tzOffsetMinutes)
        ? tzOffsetMinutes
        : group.autoShutdown?.timezoneOffsetMinutes ?? -210;

    const getLocalHour = (iso: string): number | null => {
      const ms = new Date(iso).getTime();
      if (!Number.isFinite(ms)) return null;
      const localDate = new Date(ms - tzOffset * 60 * 1000);
      return localDate.getUTCHours();
    };

    const hourly: HourlyAnalyticsBucket[] = Array.from({length: 24}, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      tracksPlayed: 0,
      commandsCount: 0,
      totalActivity: 0,
    }));

    // Primary playback log + backfill any pre-existing persisted tracks in history/currentTrack
    const events: PlaybackAnalyticsEvent[] = [...(group.playbackEvents || [])];
    const recordedTrackIds = new Set(events.map((e) => e.trackId));

    const legacyTracks: Track[] = [...group.history];
    if (group.currentTrack) {
      legacyTracks.push(group.currentTrack);
    }
    for (const track of legacyTracks) {
      if (!recordedTrackIds.has(track.id)) {
        recordedTrackIds.add(track.id);
        events.push({
          id: `legacy_${track.id}`,
          trackId: track.id,
          title: track.title,
          artist: track.artist,
          mood: track.mood,
          source: track.source,
          requestedBy: track.requestedBy || 'کاربر',
          timestamp: track.requestedAt || new Date().toISOString(),
        });
      }
    }

    const moodCounts = new Map<string, number>();
    for (const evt of events) {
      const h = getLocalHour(evt.timestamp);
      if (h !== null && hourly[h]) {
        hourly[h].tracksPlayed += 1;
      }
      const moodLabel =
        evt.mood ||
        (evt.source === 'direct'
          ? 'لینک مستقیم'
          : evt.source === 'reply'
            ? 'ریپلای ویسکال'
            : 'جستجوی آنلاین');
      moodCounts.set(moodLabel, (moodCounts.get(moodLabel) || 0) + 1);
    }

    let totalCommands = 0;
    for (const msg of group.messages) {
      if (msg.isBot) continue;
      totalCommands += 1;
      const h = getLocalHour(msg.timestamp);
      if (h !== null && hourly[h]) {
        hourly[h].commandsCount += 1;
      }
    }

    let activeHoursCount = 0;
    let totalActivitySum = 0;
    let peakHour: HourlyAnalyticsBucket | null = null;

    for (const bucket of hourly) {
      bucket.totalActivity = bucket.tracksPlayed + bucket.commandsCount;
      if (bucket.totalActivity > 0) {
        activeHoursCount += 1;
        totalActivitySum += bucket.totalActivity;
        if (
          !peakHour ||
          bucket.totalActivity > peakHour.totalActivity ||
          (bucket.totalActivity === peakHour.totalActivity &&
            bucket.tracksPlayed > peakHour.tracksPlayed)
        ) {
          peakHour = {...bucket};
        }
      }
    }

    const moodBreakdown = Array.from(moodCounts.entries())
      .map(([mood, count]) => ({mood, count}))
      .sort((a, b) => b.count - a.count);

    const recentPlays = [...events]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 12);

    return {
      groupId: group.groupId,
      groupTitle: group.title,
      tzOffsetMinutes: tzOffset,
      hourly,
      summary: {
        totalTracksPlayed: events.length,
        totalCommands,
        peakHour,
        activeHoursCount,
        avgPerActiveHour:
          activeHoursCount > 0 ? Number((totalActivitySum / activeHoursCount).toFixed(1)) : 0,
      },
      moodBreakdown,
      recentPlays,
    };
  }

  private computeScheduleWindowIso(
    startTime: string,
    endTime: string,
    timezoneOffsetMinutes: number,
  ): {startTriggerIso: string; endTriggerIso: string | null} | null {
    const startMatch = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(
      this.normalizeDigits(startTime.trim()),
    );
    if (!startMatch) return null;

    const startH = Number(startMatch[1]);
    const startM = Number(startMatch[2]);

    const nowUtcMs = Date.now();
    const userOffsetMs = timezoneOffsetMinutes * 60 * 1000;
    const userLocalNow = new Date(nowUtcMs - userOffsetMs);

    const startLocal = new Date(userLocalNow.getTime());
    startLocal.setUTCHours(startH, startM, 0, 0);
    let startUtcMs = startLocal.getTime() + userOffsetMs;
    if (startUtcMs <= nowUtcMs - 30 * 1000) {
      startUtcMs += 24 * 60 * 60 * 1000;
    }

    let endTriggerIso: string | null = null;
    if (endTime && endTime.trim()) {
      const endMatch = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(
        this.normalizeDigits(endTime.trim()),
      );
      if (endMatch) {
        const endH = Number(endMatch[1]);
        const endM = Number(endMatch[2]);
        const startLocalAligned = new Date(startUtcMs - userOffsetMs);
        const endLocal = new Date(startLocalAligned.getTime());
        endLocal.setUTCHours(endH, endM, 0, 0);
        let endUtcMs = endLocal.getTime() + userOffsetMs;
        if (endUtcMs <= startUtcMs) {
          endUtcMs += 24 * 60 * 60 * 1000;
        }
        endTriggerIso = new Date(endUtcMs).toISOString();
      }
    }

    return {
      startTriggerIso: new Date(startUtcMs).toISOString(),
      endTriggerIso,
    };
  }

  public addTrackSchedule(
    groupId: string,
    input: {
      track: Track;
      startTime: string;
      endTime: string;
      timezoneOffsetMinutes?: number;
      endAction?: 'stop_playback' | 'next_in_queue' | 'stop_call';
    },
  ): GroupState | null {
    const group = this.state.groups[groupId];
    if (!group) return null;

    const tzOffset =
      typeof input.timezoneOffsetMinutes === 'number' && Number.isFinite(input.timezoneOffsetMinutes)
        ? input.timezoneOffsetMinutes
        : new Date().getTimezoneOffset();

    const normalizedStart = this.normalizeDigits(input.startTime.trim());
    const normalizedEnd = this.normalizeDigits((input.endTime || '').trim());
    const windowIso = this.computeScheduleWindowIso(normalizedStart, normalizedEnd, tzOffset);
    if (!windowIso) return null;

    const item: TrackScheduleItem = {
      id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      track: input.track,
      startTime: normalizedStart,
      endTime: normalizedEnd,
      timezoneOffsetMinutes: tzOffset,
      startTriggerIso: windowIso.startTriggerIso,
      endTriggerIso: windowIso.endTriggerIso,
      endAction: input.endAction || 'stop_playback',
      status: 'pending',
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    group.trackSchedules = [item, ...(group.trackSchedules || [])].slice(0, 25);

    const botMsg: ChatMessage = {
      id: `b_sched_add_${Date.now()}`,
      groupId: group.groupId,
      senderId: 'bot_rubika',
      senderName: this.state.botName,
      senderRole: 'creator',
      text: `🗓 زمان‌بندی پخش برای «${input.track.title}» ثبت شد: شروع ${normalizedStart}${normalizedEnd ? ` · پایان ${normalizedEnd}` : ''}.`,
      isBot: true,
      timestamp: new Date().toISOString(),
    };
    group.messages = [...group.messages, botMsg].slice(-120);
    this.addLog('TRACK_SCHEDULE_ADD', 'info', `${group.title}: ${input.track.title} @ ${normalizedStart}`);
    this.saveState();
    return group;
  }

  public toggleTrackSchedule(
    groupId: string,
    scheduleId: string,
    enabled: boolean,
  ): GroupState | null {
    const group = this.state.groups[groupId];
    if (!group || !group.trackSchedules) return null;
    const item = group.trackSchedules.find((s) => s.id === scheduleId);
    if (!item) return null;

    item.enabled = enabled;
    if (enabled && item.status === 'completed') {
      const windowIso = this.computeScheduleWindowIso(
        item.startTime,
        item.endTime,
        item.timezoneOffsetMinutes,
      );
      if (windowIso) {
        item.startTriggerIso = windowIso.startTriggerIso;
        item.endTriggerIso = windowIso.endTriggerIso;
        item.status = 'pending';
      }
    }
    this.saveState();
    return group;
  }

  public deleteTrackSchedule(groupId: string, scheduleId: string): GroupState | null {
    const group = this.state.groups[groupId];
    if (!group) return null;
    group.trackSchedules = (group.trackSchedules || []).filter((s) => s.id !== scheduleId);
    this.saveState();
    return group;
  }

  public setAutoRecordVoiceCall(groupId: string, enabled: boolean): GroupState | null {
    const group = this.state.groups[groupId];
    if (!group) return null;
    group.autoRecordVoiceCall = Boolean(enabled);
    this.saveState();
    return group;
  }

  public addCallRecording(
    groupId: string,
    recording: Omit<VoiceCallRecording, 'groupId'>,
  ): GroupState | null {
    const group = this.state.groups[groupId] || this.state.groups[this.state.activeGroupId];
    if (!group) return null;

    const fullRec: VoiceCallRecording = {
      ...recording,
      groupId: group.groupId,
    };
    group.callRecordings = [fullRec, ...(group.callRecordings || [])].slice(0, 30);

    const recMsg: ChatMessage = {
      id: `b_rec_${Date.now()}`,
      groupId: group.groupId,
      senderId: 'bot_rubika',
      senderName: this.state.botName,
      senderRole: 'creator',
      text: `🎙 ضبط خودکار جلسه ویسکال ذخیره شد (${Math.max(1, Math.round(recording.durationSec))} ثانیه). لینک دانلود در پنل ویسکال آماده است.`,
      isBot: true,
      audioAttachment: {
        title: `ضبط ویسکال · ${recording.tracksLabel || group.title}`,
        artist: group.title,
        url: recording.downloadUrl,
        durationSec: recording.durationSec,
      },
      timestamp: new Date().toISOString(),
    };
    group.messages = [...group.messages, recMsg].slice(-120);
    this.addLog('CALL_RECORDING_SAVED', 'ok', `${group.title}: ${recording.filename} (${recording.sizeBytes} bytes)`);
    this.saveState();
    return group;
  }

  public deleteCallRecording(groupId: string, recordingId: string): {group: GroupState; removedFilename?: string} | null {
    const group = this.state.groups[groupId];
    if (!group) return null;
    const target = (group.callRecordings || []).find((r) => r.id === recordingId);
    group.callRecordings = (group.callRecordings || []).filter((r) => r.id !== recordingId);
    this.saveState();
    return {group, removedFilename: target?.filename};
  }
}
