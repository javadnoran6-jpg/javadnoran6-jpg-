import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import JSZip from 'jszip';
import path from 'path';
import {createServer as createViteServer} from 'vite';
import {RubikaBotEngine} from './server/botEngine.js';
import {callRoomService} from './server/callRoomService.js';
import {musicCatalog} from './server/musicCatalog.js';
import {buildTrackFromDirectUrl, searchMusicReal} from './server/musicService.js';
import {generateProjectExportFiles} from './server/pythonTemplates.js';
import {discoverTrendingRubikaSongs, smartSearchOnlineSongs} from './server/trendingService.js';
import {userbotManager} from './server/userbotManager.js';
import {
  AudioEngineSettings,
  MusicMood,
  SmartPlaylistAdaptMode,
  SmartPlaylistTimeSlot,
  Track,
  UserRole,
  UserbotBridgeStatus,
} from './src/types/bot.js';

dotenv.config();

const VOICE_NOTES_DIR = path.resolve(process.cwd(), 'data', 'voice-notes');
const CALL_RECORDINGS_DIR = path.resolve(process.cwd(), 'data', 'call-recordings');

function normalizeAudioMime(rawType: string | null, urlPath: string): string {
  const lower = (rawType || '').toLowerCase().split(';')[0].trim();
  if (lower === 'audio/x-m4p' || lower === 'audio/mp4a-latm' || lower === 'audio/m4a') {
    return 'audio/mp4';
  }
  if (lower && lower !== 'application/octet-stream') {
    return lower;
  }
  const cleanUrl = urlPath.toLowerCase();
  if (cleanUrl.endsWith('.m4a') || cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.m4p')) {
    return 'audio/mp4';
  }
  if (cleanUrl.endsWith('.webm')) return 'audio/webm';
  if (cleanUrl.endsWith('.ogg')) return 'audio/ogg';
  if (cleanUrl.endsWith('.wav')) return 'audio/wav';
  if (cleanUrl.endsWith('.aac')) return 'audio/aac';
  return 'audio/mpeg';
}

function sendBufferWithRange(
  req: express.Request,
  res: express.Response,
  buffer: Buffer,
  contentType: string,
): void {
  const total = buffer.length;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const rangeHeader = req.headers.range;
  if (rangeHeader && typeof rangeHeader === 'string') {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(total - 1, Number(match[2])) : total - 1;
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < total) {
        const chunk = buffer.subarray(start, end + 1);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', String(chunk.length));
        res.send(chunk);
        return;
      }
    }
  }

  res.status(200);
  res.setHeader('Content-Length', String(total));
  res.send(buffer);
}

const audioBufferCache = new Map<string, {buffer: Buffer; contentType: string}>();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const engine = new RubikaBotEngine();

  if (!fs.existsSync(VOICE_NOTES_DIR)) {
    fs.mkdirSync(VOICE_NOTES_DIR, {recursive: true});
  }
  if (!fs.existsSync(CALL_RECORDINGS_DIR)) {
    fs.mkdirSync(CALL_RECORDINGS_DIR, {recursive: true});
  }

  // Warm up 1,000+ song catalog (شاد / غمگین / لری / سنتی / پاپ / نوستالژی) in background
  void musicCatalog.ensureHydrated(1200);

  app.use(express.json({limit: '50mb'}));

  // 1. Get full persisted bot state
  app.get('/api/state', (_req, res) => {
    res.json(engine.getState());
  });

  // 1b. Get real 24-hour Voice Chat playback & peak bot usage analytics
  app.get('/api/analytics', (req, res) => {
    const state = engine.getState();
    const groupId = String(req.query.groupId || state.activeGroupId);
    const rawTz = req.query.tzOffset;
    const tzOffset =
      rawTz !== undefined && rawTz !== '' && Number.isFinite(Number(rawTz))
        ? Number(rawTz)
        : undefined;
    const analytics = engine.getGroupAnalytics(groupId, tzOffset);
    if (!analytics) {
      res.status(404).json({error: 'گروه پیدا نشد.'});
      return;
    }
    res.json(analytics);
  });

  // 2. Update token, creator name/username, mode, public URL, audio profile, or active group
  app.post('/api/config', (req, res) => {
    const body = req.body as {
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
    };
    const updated = engine.updateConfig(body);
    res.json(updated);
  });

  // 2b. Create / Delete custom Voice Chat command shortcut buttons
  app.post('/api/shortcuts', (req, res) => {
    const {label, commandText, accent, sendToRubika} = req.body as {
      label?: string;
      commandText?: string;
      accent?: 'emerald' | 'amber' | 'slate' | 'rose';
      sendToRubika?: boolean;
    };
    if (!commandText || !commandText.trim()) {
      res.status(400).json({error: 'متن دستور میانبر الزامی است.'});
      return;
    }
    const updated = engine.addQuickShortcut({
      label,
      commandText,
      accent,
      sendToRubika,
    });
    res.json(updated);
  });

  app.delete('/api/shortcuts/:shortcutId', (req, res) => {
    const updated = engine.deleteQuickShortcut(req.params.shortcutId);
    res.json(updated);
  });

  // 3. Real Rubika Bot API v3 token verification (getMe)
  app.post('/api/bot/verify', async (_req, res) => {
    const result = await engine.verifyToken();
    res.json({
      result,
      state: engine.getState(),
    });
  });

  // 4. Start or stop real Rubika getUpdates polling loop
  app.post('/api/bot/polling', (req, res) => {
    const {action} = req.body as {action?: 'start' | 'stop'};
    const updated = action === 'start' ? engine.startPolling() : engine.stopPolling();
    res.json(updated);
  });

  // 4b. Rubika Userbot Voice Chat Bridge (rubpy[rtc] + aiortc live group call streamer)
  app.get('/api/userbot/next-task', (_req, res) => {
    const state = engine.getState();
    const task = engine.popNextVoiceCallTask();
    res.json({
      task,
      rubikaMode: state.rubikaMode,
      botName: state.botName,
      audioProfile: state.rubikaAudioProfile,
      activePlayback: engine.getActiveVoicePlaybackSnapshot(),
      moderationConfigs: engine.getModerationConfigMap(),
      creatorConfig: {
        creatorUsername: state.creatorUsername || '@Paria25805',
        creatorRubikaGuid: state.creatorRubikaGuid || '',
        sudoUserIds: state.sudoUserIds || [],
      },
    });
  });

  app.post('/api/userbot/status', (req, res) => {
    const body = req.body as Partial<UserbotBridgeStatus>;
    const updated = engine.updateUserbotStatus(body || {});
    res.json({ok: true, userbotStatus: updated.userbotStatus});
  });

  app.post('/api/userbot/moderation-event', (req, res) => {
    const body = (req.body || {}) as {
      chatGuid?: string;
      userId?: string;
      userName?: string;
      reason?: string;
      actionTaken?: string;
      messagePreview?: string;
    };
    if (!body.chatGuid || !body.reason) {
      res.status(400).json({ok: false, error: 'chatGuid و reason الزامی هستند.'});
      return;
    }
    const result = engine.recordModerationEvent({
      chatGuid: body.chatGuid,
      userId: body.userId || 'unknown',
      userName: body.userName,
      reason: body.reason,
      actionTaken: body.actionTaken || 'حذف خودکار',
      messagePreview: body.messagePreview,
    });
    res.json({ok: true, ...result});
  });

  app.post('/api/groups/:groupId/moderation', (req, res) => {
    const {groupId} = req.params;
    const body = (req.body || {}) as {
      locks?: {
        antiLink?: boolean;
        antiForward?: boolean;
        antiSpam?: boolean;
        lockChat?: boolean;
        autoDeleteFiltered?: boolean;
      };
      addFilterWord?: string;
      removeFilterWord?: string;
      unmuteUserId?: string;
      clearWarnings?: boolean;
      clearViolations?: boolean;
      deleteRecentCount?: number;
    };
    const updated = engine.updateGroupModeration(groupId, body);
    if (!updated) {
      res.status(404).json({ok: false, error: 'گروه پیدا نشد.'});
      return;
    }
    res.json({ok: true, group: updated, state: engine.getState()});
  });

  app.post('/api/userbot/incoming-message', async (req, res) => {
    const body = (req.body || {}) as {
      chatGuid?: string;
      chatTitle?: string;
      messageId?: string;
      senderId?: string;
      senderName?: string;
      senderUsername?: string;
      senderIsAdmin?: boolean;
      isSelfAccount?: boolean;
      text?: string;
      replyToMessageId?: string;
      replyToSenderId?: string;
      replyToSenderName?: string;
      replyToAudioUrl?: string;
      replyToTitle?: string;
      deferAdminExec?: boolean;
    };
    if (!body.chatGuid || !body.text) {
      res.status(400).json({ok: false, error: 'chatGuid و text الزامی هستند.'});
      return;
    }
    const result = await engine.handleUserbotIncomingMessage({
      chatGuid: body.chatGuid,
      chatTitle: body.chatTitle,
      messageId: body.messageId,
      senderId: body.senderId,
      senderName: body.senderName,
      senderUsername: body.senderUsername,
      senderIsAdmin: Boolean(body.senderIsAdmin),
      isSelfAccount: Boolean(body.isSelfAccount),
      text: body.text,
      replyToMessageId: body.replyToMessageId,
      replyToSenderId: body.replyToSenderId,
      replyToSenderName: body.replyToSenderName,
      replyToAudioUrl: body.replyToAudioUrl,
      replyToTitle: body.replyToTitle,
      deferAdminExec: Boolean(body.deferAdminExec),
    });
    res.json(result);
  });

  app.post('/api/userbot/creator-resolved', (req, res) => {
    const body = (req.body || {}) as {
      taskId?: string;
      ok?: boolean;
      userGuid?: string;
      name?: string;
      username?: string;
      error?: string;
    };
    engine.applyCreatorResolvedResult({
      taskId: body.taskId,
      ok: Boolean(body.ok),
      userGuid: body.userGuid,
      name: body.name,
      username: body.username,
      error: body.error,
    });
    res.json({ok: true, state: engine.getState()});
  });

  app.post('/api/userbot/admin-action-result', (req, res) => {
    const body = (req.body || {}) as {
      taskId?: string;
      groupId?: string;
      rubikaChatId?: string;
      targetUserId?: string;
      targetUsername?: string;
      targetName?: string;
      adminAction?: 'SetAdmin' | 'UnsetAdmin';
      ok?: boolean;
      error?: string;
    };
    const group = engine.applyAdminActionResult({
      taskId: body.taskId,
      groupId: body.groupId,
      rubikaChatId: body.rubikaChatId,
      targetUserId: body.targetUserId,
      targetUsername: body.targetUsername,
      targetName: body.targetName,
      adminAction: body.adminAction === 'UnsetAdmin' ? 'UnsetAdmin' : 'SetAdmin',
      ok: Boolean(body.ok),
      error: body.error,
    });
    res.json({ok: true, group, state: engine.getState()});
  });

  app.post('/api/userbot/sync-members-result', (req, res) => {
    const body = (req.body || {}) as {
      taskId?: string;
      groupId?: string;
      rubikaChatId?: string;
      ok?: boolean;
      members?: Array<{userId: string; name: string; username?: string; role: UserRole}>;
      error?: string;
    };
    const group = engine.applySyncMembersResult({
      taskId: body.taskId,
      groupId: body.groupId,
      rubikaChatId: body.rubikaChatId,
      ok: Boolean(body.ok),
      members: body.members,
      error: body.error,
    });
    res.json({ok: true, group, state: engine.getState()});
  });

  app.get('/api/userbot/daemon-status', async (_req, res) => {
    const info = await userbotManager.getSessionInfo();
    res.json({
      ...info,
      userbotStatus: engine.getState().userbotStatus,
    });
  });

  app.post('/api/userbot/install-runtime', async (_req, res) => {
    const result = await userbotManager.installAudioLibraries();
    userbotManager.ensureRunningIfSessionExists(PORT);
    const info = await userbotManager.getSessionInfo();
    res.json({
      ...result,
      ...info,
      userbotStatus: engine.getState().userbotStatus,
    });
  });

  app.post('/api/userbot/auth/send-code', async (req, res) => {
    const {phone, passKey} = req.body as {phone?: string; passKey?: string};
    if (!phone || !phone.trim()) {
      res.status(400).json({ok: false, error: 'شماره موبایل الزامی است.'});
      return;
    }
    const result = await userbotManager.sendCode(phone, passKey);
    res.json(result);
  });

  app.post('/api/userbot/auth/sign-in', async (req, res) => {
    const {phone, code, phoneCodeHash} = req.body as {
      phone?: string;
      code?: string;
      phoneCodeHash?: string;
    };
    if (!phone || !code || !phoneCodeHash) {
      res.status(400).json({ok: false, error: 'شماره موبایل، کد تایید و شناسه ارسال کد الزامی است.'});
      return;
    }
    const result = await userbotManager.signIn(phone, code, phoneCodeHash, PORT);
    let autoJoinedGroup: Record<string, unknown> | null = null;
    if (result.ok) {
      engine.updateConfig({rubikaMode: 'userbot_rubpy'});
      engine.updateUserbotStatus({
        connected: true,
        sessionName: 'parya_userbot',
        accountName: result.accountName || phone,
        lastError: '',
      });

      const currentState = engine.getState();
      const activeGroup = currentState.groups[currentState.activeGroupId];
      const targetsToJoin = Array.from(
        new Set([
          ...(currentState.pendingJoinTargets || []),
          activeGroup?.inviteLink || 'https://rubika.ir/joing/BCABACAHA0KBYOJFGCWRGGAGCVKPBTKR',
        ]),
      ).filter(Boolean);
      for (const target of targetsToJoin) {
        try {
          const jr = await engine.joinRubikaTarget(target);
          if (jr.ok && jr.group) {
            autoJoinedGroup = {
              ok: true,
              title: jr.group.title,
              chatGuid: jr.group.rubikaChatId,
              chatType: jr.chatType || 'group',
            };
          }
        } catch {
          // Ignore non-fatal auto-join failure
        }
      }
    }
    res.json({
      ...result,
      autoJoinedGroup,
      state: engine.getState(),
    });
  });

  app.post('/api/userbot/auth/logout', async (_req, res) => {
    await userbotManager.logout();
    engine.updateUserbotStatus({
      connected: false,
      activeVoiceChatId: '',
      activeChatGuid: '',
      streamingTrack: '',
      accountName: '',
      availableGroups: [],
      lastError: '',
    });
    res.json({ok: true, state: engine.getState()});
  });

  app.post('/api/userbot/daemon/start', (_req, res) => {
    const resStart = userbotManager.startDaemon(PORT);
    if (resStart.started) {
      engine.updateConfig({rubikaMode: 'userbot_rubpy'});
    }
    res.json({...resStart, state: engine.getState()});
  });

  app.post('/api/userbot/daemon/stop', (_req, res) => {
    userbotManager.stopDaemon();
    engine.updateUserbotStatus({
      connected: false,
      activeVoiceChatId: '',
      streamingTrack: '',
    });
    res.json({ok: true, state: engine.getState()});
  });

  app.post('/api/userbot/bind-group', async (req, res) => {
    const {chatGuid, chatType, username, title, inviteLink, autoPlayInCall, songQuery} =
      req.body as {
        chatGuid?: string;
        chatType?: 'group' | 'channel';
        username?: string;
        title?: string;
        inviteLink?: string;
        autoPlayInCall?: boolean;
        songQuery?: string;
      };
    if (!chatGuid || !chatGuid.trim()) {
      res.status(400).json({ok: false, error: 'شناسه گروه یا کانال روبیکا الزامی است.'});
      return;
    }
    const current = engine.getState();
    const existing = Object.values(current.groups).find(
      (g) => g.rubikaChatId === chatGuid.trim(),
    );
    const active = current.groups[current.activeGroupId];
    const shouldUpgradeActive =
      !existing &&
      active &&
      (active.rubikaChatId === 'g0D8xP912RubikaMain' || active.rubikaChatId.startsWith('b0'));
    const resolvedType =
      chatType || (chatGuid.trim().startsWith('c0') ? 'channel' : 'group');
    const group = engine.addOrUpdateGroup({
      groupId: existing?.groupId || (shouldUpgradeActive ? active.groupId : undefined),
      title: title?.trim() || existing?.title || 'گروه/کانال موزیکال روبیکا',
      rubikaChatId: chatGuid.trim(),
      chatType: resolvedType,
      channelUsername: username?.trim(),
      inviteLink: inviteLink?.trim(),
    });
    let track = group.currentTrack || undefined;
    if (autoPlayInCall || (autoPlayInCall !== false && resolvedType === 'channel')) {
      const playRes = await engine.startVoiceCallAndPlayInGroup(group.groupId, {songQuery});
      if (playRes.track) {
        track = playRes.track;
      }
    }
    res.json({ok: true, group, track, state: engine.getState()});
  });

  app.post('/api/userbot/join-invite', async (req, res) => {
    const {inviteLink, daysValid, autoPlayInCall, songQuery} = (req.body || {}) as {
      inviteLink?: string;
      daysValid?: number;
      autoPlayInCall?: boolean;
      songQuery?: string;
    };
    if (!inviteLink || !inviteLink.trim()) {
      res.status(400).json({ok: false, error: 'لینک دعوت گروه یا آیدی کانال روبیکا الزامی است.'});
      return;
    }
    const result = await engine.joinRubikaTarget(inviteLink.trim(), {
      daysValid,
      autoPlayInCall: autoPlayInCall !== false,
      songQuery,
    });
    if (!result.ok || !result.group) {
      res.status(result.queued ? 202 : 400).json({
        ok: false,
        queued: result.queued,
        error: result.error || 'خطا در اتصال خودکار به گروه/کانال روبیکا.',
        state: engine.getState(),
      });
      return;
    }

    res.json({
      ok: true,
      group: result.group,
      chatType: result.chatType,
      startedTrack: result.startedTrack,
      memberCount: result.memberCount || result.group.members.length,
      state: engine.getState(),
    });
  });

  // 5. Send a direct real message to a Rubika chat_id
  app.post('/api/bot/send-rubika', async (req, res) => {
    const {chatId, text, replyToMessageId} = req.body as {
      chatId: string;
      text: string;
      replyToMessageId?: string;
    };
    if (!chatId || !text) {
      res.status(400).json({ok: false, error: 'شناسه چت و متن پیام الزامی است.'});
      return;
    }
    const apiRes = await engine.callRubikaApi('sendMessage', {
      chat_id: chatId,
      text,
      ...(replyToMessageId ? {reply_to_message_id: replyToMessageId} : {}),
    });
    res.json({
      ...apiRes,
      state: engine.getState(),
    });
  });

  // 5b. Send a real audio track (MP3/M4A upload + sendFile) to the connected Rubika group
  app.post('/api/bot/send-track-rubika', async (req, res) => {
    const {groupId, track} = req.body as {
      groupId?: string;
      track?: Track;
    };
    const state = engine.getState();
    const targetGroupId = groupId || state.activeGroupId;
    const targetGroup = state.groups[targetGroupId];
    const resolvedTrack = track || targetGroup?.currentTrack;
    if (!resolvedTrack) {
      res.status(400).json({ok: false, error: 'آهنگی برای ارسال به روبیکا انتخاب نشده است.'});
      return;
    }
    const sendRes = await engine.sendTrackToRubikaGroup(targetGroupId, resolvedTrack);
    res.json({
      ...sendRes,
      state: engine.getState(),
    });
  });

  // 6. Incoming Rubika Bot API Webhook receiver
  app.post('/api/rubika/webhook', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const updateObj = (body.update as Record<string, unknown> | undefined) || body;
    const outerChatId = typeof updateObj.chat_id === 'string' ? updateObj.chat_id : '';
    if (updateObj.new_message && typeof updateObj.new_message === 'object') {
      const msg = updateObj.new_message as Record<string, unknown>;
      if (msg.sender_type !== 'Bot') {
        await engine.handleIncomingRubikaUpdate({
          ...msg,
          chat_id: outerChatId || String(msg.chat_id || ''),
        });
      }
    } else if (updateObj.text && outerChatId) {
      await engine.handleIncomingRubikaUpdate(updateObj);
    }
    res.json({ok: true});
  });

  // 7. Execute any Persian Bot Command in a group (with optional Rubika delivery)
  app.post('/api/command', async (req, res) => {
    const body = req.body as {
      groupId?: string;
      senderId?: string;
      senderName?: string;
      senderUsername?: string;
      text?: string;
      replyToMessageId?: string;
      replyToSenderId?: string;
      replyToAudioUrl?: string;
      replyToTitle?: string;
      sendToRubika?: boolean;
      allowBroadcastText?: boolean;
    };
    if (!body.text || !body.text.trim()) {
      res.status(400).json({error: 'متن دستور خالی است.'});
      return;
    }
    try {
      const state = engine.getState();
      const result = await engine.executeCommand({
        groupId: body.groupId || state.activeGroupId,
        senderId: body.senderId || state.creatorId,
        senderName: body.senderName,
        senderUsername: body.senderUsername,
        text: body.text,
        replyToMessageId: body.replyToMessageId,
        replyToSenderId: body.replyToSenderId,
        replyToAudioUrl: body.replyToAudioUrl,
        replyToTitle: body.replyToTitle,
        sendToRubika: Boolean(body.sendToRubika),
        allowBroadcastText: Boolean(body.allowBroadcastText),
      });
      res.json({
        ...result,
        state: engine.getState(),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'خطا در اجرای دستور ربات.',
      });
    }
  });

  // 8. Real live music search (iTunes + Deezer + Local 1000+ catalog)
  app.get('/api/music/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) {
      res.json({tracks: []});
      return;
    }
    const tracks = await searchMusicReal(q, String(req.query.by || 'کاربر'));
    res.json({tracks});
  });

  // 8b. Query 1,000+ categorized song catalog (شاد / غمگین / محلی و لری / سنتی / پاپ / نوستالژی / آرام)
  app.get('/api/music/catalog', (req, res) => {
    const mood = String(req.query.mood || 'همه');
    const q = String(req.query.q || '');
    const offset = Number(req.query.offset || 0);
    const limit = Number(req.query.limit || 40);
    res.json(musicCatalog.queryCatalog({mood, q, offset, limit}));
  });

  // 8c. Expand/sync more songs into the catalog
  app.post('/api/music/catalog/sync', async (req, res) => {
    const body = (req.body || {}) as {targetCount?: number};
    const current = musicCatalog.getStats().total;
    const target = body.targetCount || Math.max(1200, current + 300);
    const result = await musicCatalog.syncCatalog(target);
    res.json({
      ...result,
      stats: musicCatalog.getStats(),
    });
  });

  // 8d. Pick & enqueue N random tracks from a mood (شاد / غمگین / etc.)
  app.post('/api/music/catalog/enqueue-mood', (req, res) => {
    const {groupId, mood, count} = req.body as {
      groupId?: string;
      mood?: MusicMood;
      count?: number;
    };
    const state = engine.getState();
    const picked = musicCatalog.pickRandom(mood, Math.min(50, Math.max(1, count || 10)), state.creatorName);
    if (picked.length === 0) {
      res.status(404).json({error: 'هنوز آهنگی در این دسته‌بندی آماده نشده است.'});
      return;
    }
    engine.enqueueBulkTracks(groupId || state.activeGroupId, picked, mood);
    res.json({
      addedCount: picked.length,
      state: engine.getState(),
    });
  });

  // 8e. Preview a multi-genre / adaptive smart playlist mix before applying
  app.post('/api/music/catalog/smart-playlist/preview', (req, res) => {
    const {groupId, moods, count, balanceMode, adaptMode, timeSlot, timezoneOffsetMinutes} =
      req.body as {
        groupId?: string;
        moods?: MusicMood[];
        count?: number;
        balanceMode?: 'interleaved' | 'shuffled';
        adaptMode?: SmartPlaylistAdaptMode;
        timeSlot?: SmartPlaylistTimeSlot;
        timezoneOffsetMinutes?: number;
      };
    const state = engine.getState();
    const targetGroup = state.groups[groupId || state.activeGroupId];
    const result = musicCatalog.buildSmartMix({
      moods: moods && moods.length > 0 ? moods : ['شاد', 'غمگین'],
      totalCount: count || 20,
      balanceMode: balanceMode || 'interleaved',
      requestedBy: state.creatorName,
      adaptMode: adaptMode || 'manual',
      timeSlot: timeSlot || 'auto_now',
      timezoneOffsetMinutes,
      popularityEvents: targetGroup?.playbackEvents || [],
      history: targetGroup?.history || [],
    });
    res.json(result);
  });

  // 8f. Build and start/enqueue a multi-genre / adaptive smart playlist in Voice Chat
  app.post('/api/music/catalog/smart-playlist', (req, res) => {
    const {
      groupId,
      name,
      moods,
      count,
      balanceMode,
      startMode,
      savePreset,
      customTracks,
      adaptMode,
      timeSlot,
      autoAdaptEnabled,
      timezoneOffsetMinutes,
    } = req.body as {
      groupId?: string;
      name?: string;
      moods?: MusicMood[];
      count?: number;
      balanceMode?: 'interleaved' | 'shuffled';
      startMode?: 'replace_and_play' | 'append_queue';
      savePreset?: boolean;
      customTracks?: Track[];
      adaptMode?: SmartPlaylistAdaptMode;
      timeSlot?: SmartPlaylistTimeSlot;
      autoAdaptEnabled?: boolean;
      timezoneOffsetMinutes?: number;
    };
    const state = engine.getState();
    const targetGroupId = groupId || state.activeGroupId;
    const targetGroup = state.groups[targetGroupId];
    const selectedMoods: MusicMood[] = moods && moods.length > 0 ? moods : ['شاد', 'غمگین'];

    const mix =
      customTracks && customTracks.length > 0
        ? {
            tracks: customTracks,
            breakdown: {},
            adaptSummary: undefined,
            resolvedSlot: undefined,
            effectiveMoods: selectedMoods,
          }
        : musicCatalog.buildSmartMix({
            moods: selectedMoods,
            totalCount: count || 20,
            balanceMode: balanceMode || 'interleaved',
            requestedBy: state.creatorName,
            adaptMode: adaptMode || 'manual',
            timeSlot: timeSlot || 'auto_now',
            timezoneOffsetMinutes,
            popularityEvents: targetGroup?.playbackEvents || [],
            history: targetGroup?.history || [],
          });

    if (mix.tracks.length === 0) {
      res.status(404).json({error: 'آهنگی برای این ترکیب یافت نشد.'});
      return;
    }

    const effectiveMoods = mix.effectiveMoods || selectedMoods;
    const finalName =
      name?.trim() ||
      (adaptMode === 'vc_popularity'
        ? 'پلی‌لیست هوشمند محبوب‌ترین‌های ویسکال'
        : adaptMode === 'time_slot'
          ? `پلی‌لیست هوشمند زمانی (${mix.resolvedSlot === 'night' ? 'شبانه' : mix.resolvedSlot === 'morning' ? 'صبح' : mix.resolvedSlot === 'afternoon' ? 'عصر' : 'غروب'})`
          : `میکس هوشمند: ${effectiveMoods.join(' + ')}`);

    engine.applySmartPlaylist(targetGroupId, {
      name: finalName,
      moods: effectiveMoods,
      tracks: mix.tracks,
      balanceMode: balanceMode || 'interleaved',
      startMode: startMode || 'replace_and_play',
      savePreset: Boolean(savePreset),
      adaptMode,
      timeSlot,
      autoAdaptEnabled,
      timezoneOffsetMinutes,
      adaptSummary: mix.adaptSummary,
      resolvedSlot: mix.resolvedSlot,
    });

    res.json({
      addedCount: mix.tracks.length,
      breakdown: mix.breakdown,
      adaptSummary: mix.adaptSummary,
      state: engine.getState(),
    });
  });

  // 8f-2. Configure or immediately apply automatic Smart Playlist adaptation rule
  app.post('/api/groups/:groupId/smart-playlist-rule', (req, res) => {
    const {groupId} = req.params;
    const {
      enabled,
      mode,
      timeSlot,
      moods,
      trackCount,
      balanceMode,
      timezoneOffsetMinutes,
      applyNow,
    } = (req.body || {}) as {
      enabled?: boolean;
      mode?: SmartPlaylistAdaptMode;
      timeSlot?: SmartPlaylistTimeSlot;
      moods?: MusicMood[];
      trackCount?: number;
      balanceMode?: 'interleaved' | 'shuffled';
      timezoneOffsetMinutes?: number;
      applyNow?: boolean;
    };
    const result = engine.setSmartPlaylistRule(groupId, {
      enabled: Boolean(enabled),
      mode: mode || 'time_slot',
      timeSlot: timeSlot || 'auto_now',
      moods: moods && moods.length > 0 ? moods : ['آرام', 'پاپ'],
      trackCount: trackCount || 20,
      balanceMode: balanceMode || 'interleaved',
      timezoneOffsetMinutes,
      applyNow: Boolean(applyNow),
    });
    if (!result.group) {
      res.status(404).json({error: 'گروه پیدا نشد.'});
      return;
    }
    res.json({
      ok: true,
      adaptSummary: result.adaptSummary,
      state: engine.getState(),
    });
  });

  // 8g. Delete a saved smart playlist preset
  app.delete('/api/groups/:groupId/playlists/:playlistId', (req, res) => {
    const {groupId, playlistId} = req.params;
    const updatedGroup = engine.deleteSavedPlaylist(groupId, playlistId);
    if (!updatedGroup) {
      res.status(404).json({error: 'گروه پیدا نشد.'});
      return;
    }
    res.json({state: engine.getState()});
  });

  // 8g-2. Custom User Playlists CRUD & Playback
  app.get('/api/groups/:groupId/custom-playlists', (req, res) => {
    const playlists = engine.getCustomPlaylists(req.params.groupId);
    res.json({playlists});
  });

  app.post('/api/groups/:groupId/custom-playlists', (req, res) => {
    const {groupId} = req.params;
    const {name, createdBy, createdById, initialTracks} = (req.body || {}) as {
      name?: string;
      createdBy?: string;
      createdById?: string;
      initialTracks?: Track[];
    };
    const result = engine.createCustomPlaylist(groupId, {
      name: name || '',
      createdBy,
      createdById,
      initialTracks,
    });
    if (!result.ok) {
      res.status(400).json({ok: false, error: result.error});
      return;
    }
    res.json({ok: true, playlist: result.playlist, state: engine.getState()});
  });

  app.patch('/api/groups/:groupId/custom-playlists/:playlistId', (req, res) => {
    const {groupId, playlistId} = req.params;
    const {name} = (req.body || {}) as {name?: string};
    const result = engine.renameCustomPlaylist(groupId, playlistId, name || '');
    if (!result.ok) {
      res.status(400).json({ok: false, error: result.error});
      return;
    }
    res.json({ok: true, playlist: result.playlist, state: engine.getState()});
  });

  app.delete('/api/groups/:groupId/custom-playlists/:playlistId', (req, res) => {
    const {groupId, playlistId} = req.params;
    const result = engine.deleteCustomPlaylist(groupId, playlistId);
    if (!result.ok) {
      res.status(404).json({ok: false, error: result.error});
      return;
    }
    res.json({ok: true, state: engine.getState()});
  });

  app.post('/api/groups/:groupId/custom-playlists/:playlistId/tracks', async (req, res) => {
    const {groupId, playlistId} = req.params;
    const {track, searchQuery, directUrl, title, requestedBy} = (req.body || {}) as {
      track?: Track;
      searchQuery?: string;
      directUrl?: string;
      title?: string;
      requestedBy?: string;
    };

    const state = engine.getState();
    const who = requestedBy?.trim() || state.creatorName;
    let resolvedTrack: Track | null = track || null;

    if (!resolvedTrack && directUrl?.trim()) {
      resolvedTrack = buildTrackFromDirectUrl(
        directUrl.trim(),
        who,
        title?.trim() || undefined,
        'direct',
      );
      if (!resolvedTrack) {
        res.status(400).json({ok: false, error: 'لینک صوتی وارد شده معتبر نیست.'});
        return;
      }
    } else if (!resolvedTrack && searchQuery?.trim()) {
      const results = await searchMusicReal(searchQuery.trim(), who);
      if (results.length === 0) {
        res.status(404).json({ok: false, error: `نتیجه‌ای برای «${searchQuery.trim()}» یافت نشد.`});
        return;
      }
      resolvedTrack = results[0];
    }

    if (!resolvedTrack) {
      res.status(400).json({ok: false, error: 'آهنگ، عبارت جستجو یا لینک صوتی ارسال نشده است.'});
      return;
    }

    const result = engine.addTrackToCustomPlaylist(groupId, playlistId, resolvedTrack);
    if (!result.ok) {
      res.status(400).json({ok: false, error: result.error});
      return;
    }
    res.json({ok: true, playlist: result.playlist, addedTrack: resolvedTrack, state: engine.getState()});
  });

  app.delete('/api/groups/:groupId/custom-playlists/:playlistId/tracks/:trackIndex', (req, res) => {
    const {groupId, playlistId, trackIndex} = req.params;
    const idx = Number(trackIndex);
    const result = engine.removeTrackFromCustomPlaylist(groupId, playlistId, idx);
    if (!result.ok) {
      res.status(400).json({ok: false, error: result.error});
      return;
    }
    res.json({ok: true, playlist: result.playlist, state: engine.getState()});
  });

  app.post('/api/groups/:groupId/custom-playlists/:playlistId/play', (req, res) => {
    const {groupId, playlistId} = req.params;
    const {mode} = (req.body || {}) as {mode?: 'replace_and_play' | 'append_queue'};
    const result = engine.playCustomPlaylist(groupId, playlistId, mode || 'replace_and_play');
    if (!result.ok) {
      res.status(400).json({ok: false, error: result.error});
      return;
    }
    res.json({ok: true, startedTrack: result.startedTrack, state: engine.getState()});
  });

  // 8h. Online discovery of today's most popular Rubika songs (Google Search Grounding + playable stream resolution)
  app.post('/api/music/trending-rubika', async (_req, res) => {
    try {
      const result = await discoverTrendingRubikaSongs();
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطا در جستجوی آنلاین آهنگ‌های محبوب روز.';
      res.status(500).json({error: message});
    }
  });

  // 8i. Smart Online Song Search in Voice Call tab (Gemini Google Search Grounding + iTunes/Deezer)
  app.post('/api/music/smart-search', async (req, res) => {
    try {
      const {query} = (req.body || {}) as {query?: string};
      if (!query || !query.trim()) {
        res.status(400).json({error: 'عبارت جستجو الزامی است.'});
        return;
      }
      const result = await smartSearchOnlineSongs(query.trim());
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطا در جستجوی هوشمند آنلاین موسیقی.';
      res.status(500).json({error: message});
    }
  });

  // 9. CORS-clean & Range-capable real audio stream proxy for Web Audio API Voice Call playback & Chat
  app.get('/api/music/stream', async (req, res) => {
    const targetUrl = String(req.query.url || '').trim();
    if (!targetUrl) {
      res.status(400).send('Missing url');
      return;
    }
    try {
      const parsed = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        res.status(400).send('Invalid protocol');
        return;
      }
      const cacheKey = parsed.toString();
      const cached = audioBufferCache.get(cacheKey);
      if (cached) {
        sendBufferWithRange(req, res, cached.buffer, cached.contentType);
        return;
      }

      const upstream = await fetch(cacheKey, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'ParyaRubikaMusicBot/1.0',
          Accept: 'audio/*,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(18000),
      });
      if (!upstream.ok && upstream.status !== 206) {
        res.status(upstream.status).send('Upstream audio error');
        return;
      }

      const contentType = normalizeAudioMime(upstream.headers.get('content-type'), parsed.pathname);
      const buffer = Buffer.from(await upstream.arrayBuffer());

      // Cache up to 18 tracks (max 15MB each) so scrubbing & Range 206 probes work instantaneously
      if (buffer.length > 0 && buffer.length <= 15 * 1024 * 1024) {
        if (audioBufferCache.size >= 18) {
          const oldestKey = audioBufferCache.keys().next().value;
          if (oldestKey) audioBufferCache.delete(oldestKey);
        }
        audioBufferCache.set(cacheKey, {buffer, contentType});
      }

      sendBufferWithRange(req, res, buffer, contentType);
    } catch {
      res.status(502).send('Failed to stream audio');
    }
  });

  // 9b. Upload & stream real recorded Voice Notes or audio files in Group Chat
  app.post('/api/chat/voice-note', (req, res) => {
    const {groupId, senderId, mimeType, audioBase64, durationSec, title} = req.body as {
      groupId?: string;
      senderId?: string;
      mimeType?: string;
      audioBase64?: string;
      durationSec?: number;
      title?: string;
    };
    if (!audioBase64) {
      res.status(400).json({error: 'داده صوتی ارسال نشده است.'});
      return;
    }
    try {
      const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',').pop() || '' : audioBase64;
      const buf = Buffer.from(cleanBase64, 'base64');
      if (buf.length < 100) {
        res.status(400).json({error: 'فایل صوتی خیلی کوتاه یا نامعتبر است.'});
        return;
      }
      const lowerMime = (mimeType || '').toLowerCase();
      const lowerTitle = (title || '').toLowerCase();
      const ext =
        lowerMime.includes('mpeg') || lowerMime.includes('mp3') || lowerTitle.endsWith('.mp3')
          ? 'mp3'
          : lowerMime.includes('mp4') ||
              lowerMime.includes('m4a') ||
              lowerTitle.endsWith('.m4a')
            ? 'm4a'
            : lowerMime.includes('ogg') || lowerTitle.endsWith('.ogg')
              ? 'ogg'
              : lowerMime.includes('wav') || lowerTitle.endsWith('.wav')
                ? 'wav'
                : lowerMime.includes('aac') || lowerTitle.endsWith('.aac')
                  ? 'aac'
                  : 'webm';
      const filename = `vn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
      fs.writeFileSync(path.join(VOICE_NOTES_DIR, filename), buf);

      const state = engine.getState();
      const audioUrl = `/api/voice-notes/${filename}`;
      const cleanTitle = title?.trim()
        ? title.trim().replace(/\.(mp3|m4a|ogg|wav|aac|webm)$/i, '')
        : undefined;
      const updatedGroup = engine.addVoiceNoteMessage(
        groupId || state.activeGroupId,
        senderId || state.creatorId,
        audioUrl,
        durationSec || 60,
        cleanTitle,
      );
      if (!updatedGroup) {
        res.status(404).json({error: 'گروه پیدا نشد.'});
        return;
      }
      res.json({audioUrl, state: engine.getState()});
    } catch {
      res.status(500).json({error: 'خطا در ذخیره پیام صوتی.'});
    }
  });

  app.get('/api/voice-notes/:filename', (req, res) => {
    const safeName = path.basename(req.params.filename);
    const fullPath = path.join(VOICE_NOTES_DIR, safeName);
    if (!fs.existsSync(fullPath)) {
      res.status(404).send('Voice note not found');
      return;
    }
    const buf = fs.readFileSync(fullPath);
    const mime = normalizeAudioMime(null, safeName);
    sendBufferWithRange(req, res, buf, mime);
  });

  // 9c. Real-time WebRTC Voice Call Room & SSE Signaling
  app.get('/api/call/events', (req, res) => {
    const state = engine.getState();
    const groupId = String(req.query.groupId || state.activeGroupId);
    const peerId = String(req.query.peerId || `peer_${Date.now()}`);
    const name = String(req.query.name || 'کاربر تماس');
    const role = String(req.query.role || 'member');
    const isMuted = String(req.query.isMuted || 'false') === 'true';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    callRoomService.joinPeer(groupId, {peerId, name, role, isMuted}, res);

    req.on('close', () => {
      callRoomService.leavePeer(groupId, peerId);
    });
  });

  app.get('/api/call/room', (req, res) => {
    const state = engine.getState();
    const groupId = String(req.query.groupId || state.activeGroupId);
    res.json({
      groupId,
      participants: callRoomService.getParticipants(groupId),
    });
  });

  app.post('/api/call/signal', (req, res) => {
    const {groupId, fromPeerId, toPeerId, type, payload} = req.body as {
      groupId?: string;
      fromPeerId?: string;
      toPeerId?: string;
      type?: 'offer' | 'answer' | 'ice' | 'mic-state' | 'ring';
      payload?: unknown;
    };
    if (!groupId || !fromPeerId || !type) {
      res.status(400).json({error: 'پارامترهای سیگنالینگ تماس ناقص است.'});
      return;
    }
    const result = callRoomService.relaySignal({
      groupId,
      fromPeerId,
      toPeerId,
      type,
      payload,
    });
    res.json({ok: true, ...result});
  });

  // 10. Play or enqueue a specific searched track
  app.post('/api/player/select-track', (req, res) => {
    const {groupId, track, mode} = req.body as {
      groupId?: string;
      track?: Track;
      mode?: 'play_now' | 'queue';
    };
    if (!track) {
      res.status(400).json({error: 'اطلاعات آهنگ ارسال نشده است.'});
      return;
    }
    userbotManager.ensureRunningIfSessionExists(PORT);
    const state = engine.getState();
    engine.playSpecificTrack(groupId || state.activeGroupId, track, mode || 'play_now');
    res.json(engine.getState());
  });

  // 11. Track ended -> advance queue
  app.post('/api/player/ended', (req, res) => {
    const {groupId, expectedTitle} = (req.body || {}) as {groupId?: string; expectedTitle?: string};
    const state = engine.getState();
    engine.handleTrackEnded(groupId || state.activeGroupId, expectedTitle);
    res.json(engine.getState());
  });

  // 11b. Join live Voice Call ("پیوستن") -> activates VC, resumes/starts music, and pushes to Rubika VC
  app.post('/api/voice-call/join', (req, res) => {
    const {groupId} = (req.body || {}) as {groupId?: string};
    userbotManager.ensureRunningIfSessionExists(PORT);
    const state = engine.getState();
    const group = engine.joinVoiceCallAndPlay(groupId || state.activeGroupId);
    res.json({ok: Boolean(group), group, state: engine.getState()});
  });

  // 12. Add or update Rubika group
  app.post('/api/groups', (req, res) => {
    const body = req.body as {
      groupId?: string;
      title: string;
      rubikaChatId: string;
      daysValid?: number;
    };
    if (!body.title || !body.rubikaChatId) {
      res.status(400).json({error: 'نام گروه و شناسه چت روبیکا الزامی است.'});
      return;
    }
    const group = engine.addOrUpdateGroup(body);
    res.json({group, state: engine.getState()});
  });

  // 13. Add / update member inside a group
  app.post('/api/groups/:groupId/members', (req, res) => {
    const {groupId} = req.params;
    const {name, userId, role} = req.body as {
      name: string;
      userId: string;
      role?: UserRole;
    };
    if (!name || !userId) {
      res.status(400).json({error: 'نام و شناسه کاربر الزامی است.'});
      return;
    }
    const group = engine.addMemberToGroup(groupId, name, userId, role || 'member');
    if (!group) {
      res.status(404).json({error: 'گروه پیدا نشد.'});
      return;
    }
    res.json({group, state: engine.getState()});
  });

  // 13a-1. Real Rubika Admin/Manager Promotion & Demotion (SetAdmin / UnsetAdmin)
  app.post('/api/groups/:groupId/admin-role', async (req, res) => {
    const {groupId} = req.params;
    const {targetUserOrUsername, adminAction, targetNameHint} = (req.body || {}) as {
      targetUserOrUsername?: string;
      adminAction?: 'SetAdmin' | 'UnsetAdmin';
      targetNameHint?: string;
    };
    if (!targetUserOrUsername || !targetUserOrUsername.trim()) {
      res.status(400).json({ok: false, error: 'آیدی @ یا شناسه کاربر روبیکا الزامی است.'});
      return;
    }
    const result = await engine.setGroupAdminRole(
      groupId,
      targetUserOrUsername.trim(),
      adminAction === 'UnsetAdmin' ? 'UnsetAdmin' : 'SetAdmin',
      targetNameHint,
    );
    res.status(result.ok ? 200 : result.queued ? 202 : 400).json({
      ...result,
      state: engine.getState(),
    });
  });

  // 13a-2. Sync real members and admins from connected Rubika group/channel
  app.post('/api/groups/:groupId/sync-members', async (req, res) => {
    const {groupId} = req.params;
    const result = await engine.requestSyncGroupMembers(groupId);
    res.status(result.ok ? 200 : 400).json({
      ...result,
      state: engine.getState(),
    });
  });

  // 13a-3. Creator Master Panel APIs (@Paria25805 full control)
  app.post('/api/creator/resolve-rubika', async (_req, res) => {
    const result = await engine.resolveCreatorRubikaGuid();
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.post('/api/creator/broadcast', async (req, res) => {
    const {text, targetScope, attachTrack} = (req.body || {}) as {
      text?: string;
      targetScope?: 'all' | 'groups' | 'channels';
      attachTrack?: Track | null;
    };
    if (!text || !text.trim()) {
      res.status(400).json({ok: false, error: 'متن پیام همگانی الزامی است.'});
      return;
    }
    const result = await engine.broadcastToAllGroups({
      text,
      targetScope: targetScope || 'all',
      attachTrack,
    });
    res.json(result);
  });

  app.post('/api/creator/stop-all-calls', (_req, res) => {
    const result = engine.stopAllVoiceCalls();
    res.json({ok: true, ...result});
  });

  app.post('/api/creator/groups/:groupId/voice-call', async (req, res) => {
    const {groupId} = req.params;
    const {action} = (req.body || {}) as {action?: 'start' | 'stop'};
    const result = await engine.toggleGroupVoiceCall(groupId, action === 'stop' ? 'stop' : 'start');
    res.status(result.ok ? 200 : 404).json(result);
  });

  app.post('/api/creator/groups/:groupId/subscription', (req, res) => {
    const {groupId} = req.params;
    const body = (req.body || {}) as {
      daysValid?: number;
      addDays?: number;
      setUnlimited?: boolean;
      cancelSubscription?: boolean;
      dailyPlayLimit?: number;
      publicAccess?: 'open' | 'locked';
    };
    const group = engine.updateGroupCreatorSettings(groupId, body);
    if (!group) {
      res.status(404).json({ok: false, error: 'گروه پیدا نشد.'});
      return;
    }
    res.json({ok: true, group, state: engine.getState()});
  });

  app.post('/api/creator/groups/:groupId/clear-messages', (req, res) => {
    const group = engine.clearGroupMessages(req.params.groupId);
    if (!group) {
      res.status(404).json({ok: false, error: 'گروه پیدا نشد.'});
      return;
    }
    res.json({ok: true, group, state: engine.getState()});
  });

  app.delete('/api/creator/groups/:groupId', (req, res) => {
    const result = engine.deleteGroup(req.params.groupId);
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.post('/api/creator/sudo', (req, res) => {
    const {action, target} = (req.body || {}) as {action?: 'add' | 'remove'; target?: string};
    if (!target || !target.trim()) {
      res.status(400).json({ok: false, error: 'شناسه یا آیدی @ همکار سازنده الزامی است.'});
      return;
    }
    const state = engine.addOrRemoveSudoUser(action === 'remove' ? 'remove' : 'add', target);
    res.json({ok: true, state});
  });

  app.delete('/api/creator/logs', (_req, res) => {
    const state = engine.clearApiLogs();
    res.json({ok: true, state});
  });

  app.get('/api/creator/backup', (_req, res) => {
    const state = engine.getState();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="rubika-bot-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    res.send(JSON.stringify(state, null, 2));
  });

  // 13b. Configure automatic Voice Call shutdown time (خاموشی خودکار ربات)
  app.post('/api/groups/:groupId/auto-shutdown', (req, res) => {
    const {groupId} = req.params;
    const {enabled, targetTime, timezoneOffsetMinutes, stopPollingAlso} = req.body as {
      enabled: boolean;
      targetTime: string;
      timezoneOffsetMinutes?: number;
      stopPollingAlso?: boolean;
    };
    const group = engine.setGroupAutoShutdown(groupId, {
      enabled: Boolean(enabled),
      targetTime: String(targetTime || '23:30'),
      timezoneOffsetMinutes,
      stopPollingAlso: Boolean(stopPollingAlso),
    });
    if (!group) {
      res.status(404).json({error: 'گروه پیدا نشد.'});
      return;
    }
    res.json({group, state: engine.getState()});
  });

  // 13c. Track Playback Scheduler (exact start/end time for queue tracks)
  app.post('/api/groups/:groupId/track-schedules', (req, res) => {
    const {groupId} = req.params;
    const {track, startTime, endTime, timezoneOffsetMinutes, endAction} = req.body as {
      track?: Track;
      startTime?: string;
      endTime?: string;
      timezoneOffsetMinutes?: number;
      endAction?: 'stop_playback' | 'next_in_queue' | 'stop_call';
    };
    if (!track || !startTime) {
      res.status(400).json({error: 'انتخاب آهنگ و ساعت شروع الزامی است.'});
      return;
    }
    const group = engine.addTrackSchedule(groupId, {
      track,
      startTime,
      endTime: endTime || '',
      timezoneOffsetMinutes,
      endAction,
    });
    if (!group) {
      res.status(400).json({error: 'فرمت ساعت نامعتبر است یا گروه پیدا نشد.'});
      return;
    }
    res.json({group, state: engine.getState()});
  });

  app.patch('/api/groups/:groupId/track-schedules/:scheduleId', (req, res) => {
    const {groupId, scheduleId} = req.params;
    const {enabled} = req.body as {enabled?: boolean};
    const group = engine.toggleTrackSchedule(groupId, scheduleId, Boolean(enabled));
    if (!group) {
      res.status(404).json({error: 'زمان‌بندی پیدا نشد.'});
      return;
    }
    res.json({group, state: engine.getState()});
  });

  app.delete('/api/groups/:groupId/track-schedules/:scheduleId', (req, res) => {
    const {groupId, scheduleId} = req.params;
    const group = engine.deleteTrackSchedule(groupId, scheduleId);
    if (!group) {
      res.status(404).json({error: 'گروه پیدا نشد.'});
      return;
    }
    res.json({group, state: engine.getState()});
  });

  // 13d. Voice Call Auto-Recording settings & audio file persistence
  app.post('/api/groups/:groupId/auto-record', (req, res) => {
    const {groupId} = req.params;
    const {enabled} = req.body as {enabled?: boolean};
    const group = engine.setAutoRecordVoiceCall(groupId, Boolean(enabled));
    if (!group) {
      res.status(404).json({error: 'گروه پیدا نشد.'});
      return;
    }
    res.json({group, state: engine.getState()});
  });

  app.post('/api/call/recordings', (req, res) => {
    const {groupId, mimeType, audioBase64, durationSec, startedAt, endedAt, tracksLabel} =
      req.body as {
        groupId?: string;
        mimeType?: string;
        audioBase64?: string;
        durationSec?: number;
        startedAt?: string;
        endedAt?: string;
        tracksLabel?: string;
      };
    if (!audioBase64) {
      res.status(400).json({error: 'داده صوتی ضبط‌شده ارسال نشده است.'});
      return;
    }
    try {
      const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',').pop() || '' : audioBase64;
      const buf = Buffer.from(cleanBase64, 'base64');
      if (buf.length < 128) {
        res.status(400).json({error: 'فایل ضبط صوتی خالی یا بیش از حد کوتاه است.'});
        return;
      }

      const lowerMime = (mimeType || '').toLowerCase();
      const ext = lowerMime.includes('mp4') || lowerMime.includes('m4a')
        ? 'm4a'
        : lowerMime.includes('ogg')
          ? 'ogg'
          : lowerMime.includes('wav')
            ? 'wav'
            : 'webm';
      const recId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const filename = `voice_call_${recId}.${ext}`;
      fs.writeFileSync(path.join(CALL_RECORDINGS_DIR, filename), buf);

      const state = engine.getState();
      const targetGroupId = groupId || state.activeGroupId;
      const downloadUrl = `/api/call/recordings/${filename}`;
      const normalizedMime = normalizeAudioMime(mimeType || null, filename);

      const updatedGroup = engine.addCallRecording(targetGroupId, {
        id: recId,
        filename,
        downloadUrl,
        mimeType: normalizedMime,
        durationSec: Math.max(1, Math.round(durationSec || 1)),
        sizeBytes: buf.length,
        startedAt: startedAt || new Date().toISOString(),
        endedAt: endedAt || new Date().toISOString(),
        tracksLabel,
      });

      if (!updatedGroup) {
        res.status(404).json({error: 'گروه پیدا نشد.'});
        return;
      }

      res.json({
        downloadUrl,
        filename,
        state: engine.getState(),
      });
    } catch {
      res.status(500).json({error: 'خطا در ذخیره فایل ضبط ویسکال.'});
    }
  });

  app.get('/api/call/recordings/:filename', (req, res) => {
    const safeName = path.basename(req.params.filename);
    const fullPath = path.join(CALL_RECORDINGS_DIR, safeName);
    if (!fs.existsSync(fullPath)) {
      res.status(404).send('Recording not found');
      return;
    }
    const buf = fs.readFileSync(fullPath);
    const mime = normalizeAudioMime(null, safeName);
    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    }
    sendBufferWithRange(req, res, buf, mime);
  });

  app.delete('/api/groups/:groupId/recordings/:recordingId', (req, res) => {
    const {groupId, recordingId} = req.params;
    const result = engine.deleteCallRecording(groupId, recordingId);
    if (!result) {
      res.status(404).json({error: 'گروه پیدا نشد.'});
      return;
    }
    if (result.removedFilename) {
      const fp = path.join(CALL_RECORDINGS_DIR, path.basename(result.removedFilename));
      if (fs.existsSync(fp)) {
        try {
          fs.unlinkSync(fp);
        } catch {
          // ignore unlink error
        }
      }
    }
    res.json({group: result.group, state: engine.getState()});
  });

  const resolvePublicServerUrl = (req: express.Request): string => {
    const envUrl = (process.env.APP_URL || '').trim();
    if (envUrl && envUrl !== 'MY_APP_URL') {
      return envUrl.replace(/\/$/, '');
    }
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '127.0.0.1:3000';
    return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`.replace(/\/$/, '');
  };

  // 14. Export Python Bot + Buildozer + GitHub Actions files (JSON preview)
  app.get('/api/export/files', (req, res) => {
    const state = engine.getState();
    const activeGroup = state.groups[state.activeGroupId];
    const files = generateProjectExportFiles({
      token: state.token,
      creatorName: state.creatorName,
      creatorId: state.creatorId,
      defaultGroupTitle: activeGroup?.title || 'گروه موزیکال اصلی',
      serverUrl: resolvePublicServerUrl(req),
    });
    res.json({files});
  });

  // 14b. Direct download for Rubika Userbot Live Voice Chat script
  app.get('/api/export/userbot-vc.py', (req, res) => {
    const state = engine.getState();
    const activeGroup = state.groups[state.activeGroupId];
    const files = generateProjectExportFiles({
      token: state.token,
      creatorName: state.creatorName,
      creatorId: state.creatorId,
      defaultGroupTitle: activeGroup?.title || 'گروه موزیکال اصلی',
      serverUrl: resolvePublicServerUrl(req),
    });
    const target = files.find((f) => f.path === 'bot/rubika_userbot_vc.py');
    if (!target) {
      res.status(404).send('Userbot script not found');
      return;
    }
    res.setHeader('Content-Type', 'text/x-python; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="rubika_userbot_vc.py"');
    res.send(target.content);
  });

  // 15. Download ready-to-push GitHub repository + APK Buildozer bundle (.zip)
  app.get('/api/export/github-apk-zip', async (req, res) => {
    const state = engine.getState();
    const activeGroup = state.groups[state.activeGroupId];
    const files = generateProjectExportFiles({
      token: state.token,
      creatorName: state.creatorName,
      creatorId: state.creatorId,
      defaultGroupTitle: activeGroup?.title || 'گروه موزیکال اصلی',
      serverUrl: resolvePublicServerUrl(req),
    });

    const zip = new JSZip();
    for (const f of files) {
      zip.file(f.path, f.content);
    }
    const buffer = await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="parya-rubika-music-bot-apk-github.zip"');
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  });

  // 15b. Direct download of the complete runnable application bundle (.zip)
  app.get('/api/export/full-app-zip', async (req, res) => {
    try {
      const rootDir = process.cwd();
      const zip = new JSZip();
      const skipNames = new Set([
        'node_modules',
        'dist',
        '.git',
        '.py_userbot',
        '__pycache__',
        '.DS_Store',
        'data',
      ]);

      const addDirRecursive = (absDir: string, relBase: string) => {
        if (!fs.existsSync(absDir)) return;
        const entries = fs.readdirSync(absDir, {withFileTypes: true});
        for (const entry of entries) {
          if (skipNames.has(entry.name) || entry.name.endsWith('.session')) {
            continue;
          }
          const absPath = path.join(absDir, entry.name);
          const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            addDirRecursive(absPath, relPath);
          } else if (entry.isFile()) {
            zip.file(relPath, fs.readFileSync(absPath));
          }
        }
      };

      const rootFiles = [
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'vite.config.ts',
        'index.html',
        'server.ts',
        '.env.example',
        'metadata.json',
      ];
      for (const fileName of rootFiles) {
        const fp = path.join(rootDir, fileName);
        if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
          zip.file(fileName, fs.readFileSync(fp));
        }
      }

      addDirRecursive(path.join(rootDir, 'src'), 'src');
      addDirRecursive(path.join(rootDir, 'server'), 'server');
      addDirRecursive(path.join(rootDir, 'public'), 'public');

      const state = engine.getState();
      const readmeContent = [
        `# ${state.botName} — پکیج کامل برنامه`,
        `سازنده: ${state.creatorName} (${state.creatorUsername || '@Paria25805'})`,
        '',
        '## اجرای مستقیم برنامه روی سیستم یا سرور:',
        '1. پیش‌نیاز: Node.js 20+ و Python 3.10+ (و FFmpeg برای استریم ویسکال)',
        '2. نصب پکیج‌ها: npm install',
        '3. اجرای برنامه: npm run dev  (یا بیلد و اجرا: npm run build && npm start)',
        '4. باز کردن در مرورگر: http://localhost:3000',
        '',
        '## نصب مستقیم روی گوشی یا ویندوز (PWA):',
        'برنامه به صورت پیش‌فرض دارای Service Worker و Web App Manifest است.',
        'بعد از باز کردن آدرس برنامه در Chrome / Edge / Safari گزینه «نصب برنامه» را بزنید.',
      ].join('\n');
      zip.file('README-INSTALL.md', readmeContent);

      const buffer = await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="paria-rubika-music-app.zip"');
      res.setHeader('Content-Length', String(buffer.length));
      res.send(buffer);
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'خطا در ساخت فایل دانلود برنامه.',
      });
    }
  });

  // Vite middleware (dev) or static dist serving (prod)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Parya Rubika Music Bot server listening on http://0.0.0.0:${PORT}`);
    userbotManager.ensureRunningIfSessionExists(PORT);
  });
}

startServer().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
