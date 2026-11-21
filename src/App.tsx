import {useCallback, useEffect, useState} from 'react';
import {
  BarChart3,
  Crown,
  Download,
  FileCode2,
  Headphones,
  Menu,
  MessageSquareText,
  PhoneCall,
  Play,
  Radio,
  ShieldCheck,
  Square,
  X,
} from 'lucide-react';
import {AnalyticsD3View} from './components/AnalyticsD3View';
import {CreatorPanelView} from './components/CreatorPanelView';
import {FloatingVoiceCallPlayer} from './components/FloatingVoiceCallPlayer';
import {GroupChatConsoleView} from './components/GroupChatConsoleView';
import {GroupsAccessView} from './components/GroupsAccessView';
import {OfflineIndicator, PWAInstallButton} from './components/PWAInstallButton';
import {PythonApkExportView} from './components/PythonApkExportView';
import {RubikaConnectionView} from './components/RubikaConnectionView';
import {VoiceCallStudioView} from './components/VoiceCallStudioView';
import {
  DEFAULT_AUDIO_SETTINGS,
  RUBIKA_AUDIO_PROFILES,
  detectAudioProfileId,
  useVoiceAudioEngine,
} from './hooks/useVoiceAudioEngine';
import {useVoiceCallRecorder} from './hooks/useVoiceCallRecorder';
import {useWebRTCCall} from './hooks/useWebRTCCall';
import {
  AudioEngineSettings,
  BotConfigState,
  GroupModerationLocks,
  MusicMood,
  QuickCommandShortcut,
  SmartPlaylistAdaptMode,
  SmartPlaylistTimeSlot,
  Track,
  TrackScheduleItem,
  UserRole,
} from './types/bot';

type TabKey = 'voice' | 'chat' | 'analytics' | 'groups' | 'creator' | 'rubika' | 'apk';

const NAV_ITEMS: Array<{key: TabKey; label: string; icon: typeof Headphones}> = [
  {key: 'voice', label: 'ویسکال و پخش زنده', icon: Headphones},
  {key: 'chat', label: 'چت گروهی و دستورات', icon: MessageSquareText},
  {key: 'analytics', label: 'آمار و نمودار D3', icon: BarChart3},
  {key: 'groups', label: 'گروه‌ها، مقام و اشتراک', icon: ShieldCheck},
  {key: 'creator', label: 'پنل سازنده', icon: Crown},
  {key: 'rubika', label: 'اتصال توکن روبیکا', icon: Radio},
  {key: 'apk', label: 'پایتون و ساخت APK گیت‌هاب', icon: FileCode2},
];

export default function App() {
  const [config, setConfig] = useState<BotConfigState | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('voice');
  const [isBusy, setIsBusy] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((prev) => (prev === msg ? null : prev)), 3200);
  }, []);

  const [audioSettings, setAudioSettings] = useState<AudioEngineSettings>(() => {
    try {
      const raw = localStorage.getItem('parya_audio_settings_v1');
      if (raw) {
        const merged = {...DEFAULT_AUDIO_SETTINGS, ...(JSON.parse(raw) as Partial<AudioEngineSettings>)};
        return {...merged, profile: detectAudioProfileId(merged)};
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_AUDIO_SETTINGS;
  });

  const handleChangeAudioSettings = useCallback(
    (next: AudioEngineSettings) => {
      const resolvedProfile = detectAudioProfileId(next);
      const normalized: AudioEngineSettings = {
        ...next,
        profile: resolvedProfile,
      };
      setAudioSettings(normalized);
      try {
        localStorage.setItem('parya_audio_settings_v1', JSON.stringify(normalized));
      } catch {
        // ignore storage errors
      }
      void fetch('/api/config', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({rubikaAudioProfile: normalized}),
      })
        .then(async (res) => {
          if (res.ok) {
            const updated = (await res.json()) as BotConfigState;
            setConfig(updated);
          }
        })
        .catch(() => {
          // ignore transient sync failure
        });

      const presetMeta =
        resolvedProfile !== 'custom' ? RUBIKA_AUDIO_PROFILES[resolvedProfile] : null;
      const label = presetMeta ? presetMeta.name : 'سفارشی (Custom)';
      const bitrate = normalized.streamBitrateKbps ?? 64;
      const chLabel = normalized.channels === 'mono' ? 'مونو' : 'استریو';
      showToast(
        `پروفایل استریم روبیکا روی ${label} (${(normalized.sampleRate / 1000).toFixed(1)} kHz · ${bitrate} kbps · ${chLabel}) تنظیم شد.`,
      );
    },
    [showToast],
  );

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = (await res.json()) as BotConfigState;
        setConfig(data);
        if (data.rubikaAudioProfile) {
          try {
            if (!localStorage.getItem('parya_audio_settings_v1')) {
              const merged = {...DEFAULT_AUDIO_SETTINGS, ...data.rubikaAudioProfile};
              setAudioSettings({...merged, profile: detectAudioProfileId(merged)});
            }
          } catch {
            // ignore storage errors
          }
        }
      }
    } catch {
      // Ignore transient error on initial poll
    }
  }, []);

  useEffect(() => {
    void fetchState();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('openVoice') === '1' || params.get('joinCall')) {
        setActiveTab('voice');
      }
      void fetch('/api/config', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({publicBaseUrl: window.location.origin}),
      }).catch(() => {
        // ignore startup base URL sync failure
      });
    }
  }, [fetchState]);

  // Keep state synced when Rubika polling, Userbot VC bridge, OR any group's auto-shutdown / track scheduler is active
  const hasActiveAutoShutdown = Boolean(
    config &&
      Object.values(config.groups).some(
        (g) =>
          g.autoShutdown?.enabled ||
          g.trackSchedules?.some((s) => s.enabled && s.status !== 'completed'),
      ),
  );
  const shouldSyncState = Boolean(
    config?.pollingActive ||
      config?.rubikaMode === 'userbot_rubpy' ||
      config?.userbotStatus?.connected ||
      hasActiveAutoShutdown,
  );

  useEffect(() => {
    if (!shouldSyncState) return;
    const timer = setInterval(() => {
      void fetchState();
    }, 3000);
    return () => clearInterval(timer);
  }, [shouldSyncState, fetchState]);

  const activeGroup = config
    ? config.groups[config.activeGroupId] || Object.values(config.groups)[0]
    : null;

  const handleTrackEnded = useCallback(async () => {
    if (!activeGroup) return;
    try {
      const res = await fetch('/api/player/ended', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({groupId: activeGroup.groupId}),
      });
      if (res.ok) {
        const updated = (await res.json()) as BotConfigState;
        setConfig(updated);
      }
    } catch {
      // Ignore
    }
  }, [activeGroup]);

  const [pendingJoinGroupId, setPendingJoinGroupId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('joinCall');
  });

  const audioState = useVoiceAudioEngine({
    currentTrack: activeGroup?.currentTrack || null,
    isPlaying: Boolean(activeGroup?.isPlaying),
    isMuted: Boolean(activeGroup?.isMuted),
    volume: activeGroup?.volume ?? 80,
    voiceCallActive: Boolean(activeGroup?.voiceCallActive),
    audioSettings,
    onTrackEnded: handleTrackEnded,
  });

  const callState = useWebRTCCall({
    groupId: activeGroup?.groupId || 'g_main_rubika',
    userName: config?.creatorName || 'کاربر تماس',
    userRole: 'creator',
    callMusicStream: audioState.callMusicStream,
    audioSettings,
    playCallTone: audioState.playCallTone,
    primeAudio: audioState.primeAudio,
  });

  const recorderState = useVoiceCallRecorder({
    groupId: activeGroup?.groupId || 'g_main_rubika',
    sessionActive: Boolean(activeGroup?.voiceCallActive || callState.callStatus !== 'idle'),
    autoRecordEnabled: activeGroup?.autoRecordVoiceCall !== false,
    currentTrack: activeGroup?.currentTrack || null,
    callMusicStream: audioState.callMusicStream,
    callOutputStream: callState.callOutputStream,
    remoteStreams: callState.remoteStreams,
    onRecordingSaved: (updatedState, filename) => {
      setConfig(updatedState);
      showToast(`فایل ضبط ویسکال (${filename}) ذخیره و لینک دانلود آماده شد.`);
    },
  });

  // Unlock HTMLAudioElement & Web Audio Context on the very first user gesture anywhere in the app
  useEffect(() => {
    const unlockOnce = () => {
      audioState.primeAudio();
    };
    window.addEventListener('pointerdown', unlockOnce, {once: true});
    window.addEventListener('keydown', unlockOnce, {once: true});
    return () => {
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
  }, [audioState]);

  const handleRunCommand = async (payload: {
    senderId?: string;
    text: string;
    replyToMessageId?: string;
    replyToSenderId?: string;
    replyToAudioUrl?: string;
    sendToRubika?: boolean;
    allowBroadcastText?: boolean;
  }) => {
    if (!config || !activeGroup) return;
    audioState.primeAudio();
    setIsBusy(true);
    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          groupId: activeGroup.groupId,
          senderId: payload.senderId || config.creatorId,
          text: payload.text,
          replyToMessageId: payload.replyToMessageId,
          replyToSenderId: payload.replyToSenderId,
          replyToAudioUrl: payload.replyToAudioUrl,
          sendToRubika: payload.sendToRubika,
          allowBroadcastText: payload.allowBroadcastText,
        }),
      });
      const data = (await res.json()) as {
        state?: BotConfigState;
        botMessage?: {text: string} | null;
        uiAction?: 'open_voice_panel';
      };
      if (data.state) {
        setConfig(data.state);
      }
      if (data.uiAction === 'open_voice_panel') {
        if (callState.callStatus === 'idle') {
          void callState.joinCall();
        }
        setActiveTab('voice');
      }
      if (data.botMessage?.text) {
        const firstLine = data.botMessage.text.split('\n')[0];
        showToast(firstLine);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddShortcut = async (payload: {
    label?: string;
    commandText: string;
    accent: QuickCommandShortcut['accent'];
    sendToRubika: boolean;
  }) => {
    setIsBusy(true);
    try {
      const res = await fetch('/api/shortcuts', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = (await res.json()) as BotConfigState;
        setConfig(updated);
        showToast(`دکمه میانبر «${payload.label || payload.commandText}» اضافه شد.`);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteShortcut = async (shortcutId: string) => {
    setIsBusy(true);
    try {
      const res = await fetch(`/api/shortcuts/${encodeURIComponent(shortcutId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const updated = (await res.json()) as BotConfigState;
        setConfig(updated);
        showToast('دکمه میانبر حذف شد.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleRunShortcut = async (shortcut: QuickCommandShortcut) => {
    await handleRunCommand({
      text: shortcut.commandText,
      sendToRubika: shortcut.sendToRubika && Boolean(config?.pollingActive),
      allowBroadcastText: true,
    });
  };

  const handleSelectTrack = async (track: Track, mode: 'play_now' | 'queue') => {
    if (!activeGroup) return;
    audioState.primeAudio();
    if (mode === 'play_now' && callState.callStatus === 'idle') {
      void callState.joinCall();
    }
    setIsBusy(true);
    try {
      const res = await fetch('/api/player/select-track', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({groupId: activeGroup.groupId, track, mode}),
      });
      if (res.ok) {
        const updated = (await res.json()) as BotConfigState;
        setConfig(updated);
        showToast(
          mode === 'queue'
            ? `آهنگ «${track.title}» به صف اضافه شد.`
            : `در حال پخش در ویسکال: ${track.title}`,
        );
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleSendVoiceNote = async (payload: {
    senderId: string;
    mimeType: string;
    audioBase64: string;
    durationSec: number;
    title?: string;
  }) => {
    if (!activeGroup) return;
    setIsBusy(true);
    try {
      const res = await fetch('/api/chat/voice-note', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          groupId: activeGroup.groupId,
          ...payload,
        }),
      });
      const data = (await res.json()) as {state?: BotConfigState; error?: string};
      if (res.ok && data.state) {
        setConfig(data.state);
        showToast(
          payload.title
            ? `فایل صوتی «${payload.title}» در چت گروه ارسال شد. روی آن ریپلای «پخش» بزنید.`
            : 'پیام صوتی شما در چت گروه ارسال شد.',
        );
      } else if (data.error) {
        showToast(data.error);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleEnqueueMood = async (mood: MusicMood, count: number) => {
    if (!activeGroup) return;
    setIsBusy(true);
    try {
      const res = await fetch('/api/music/catalog/enqueue-mood', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({groupId: activeGroup.groupId, mood, count}),
      });
      const data = (await res.json()) as {addedCount?: number; state?: BotConfigState; error?: string};
      if (res.ok && data.state) {
        setConfig(data.state);
        showToast(`${data.addedCount || count} آهنگ ${mood} به صف پخش ویسکال اضافه شد.`);
      } else if (data.error) {
        showToast(data.error);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleSetAutoShutdown = async (payload: {
    enabled: boolean;
    targetTime: string;
    stopPollingAlso: boolean;
  }) => {
    if (!activeGroup) return;
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/groups/${encodeURIComponent(activeGroup.groupId)}/auto-shutdown`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            ...payload,
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          }),
        },
      );
      const data = (await res.json()) as {state?: BotConfigState; error?: string};
      if (res.ok && data.state) {
        setConfig(data.state);
        showToast(
          payload.enabled
            ? `تایمر قطع خودکار ویسکال روی ساعت ${payload.targetTime} تنظیم شد.`
            : 'تایمر خاموشی خودکار لغو شد.',
        );
      } else if (data.error) {
        showToast(data.error);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleApplySmartPlaylist = async (payload: {
    name?: string;
    moods: MusicMood[];
    count: number;
    balanceMode: 'interleaved' | 'shuffled';
    startMode: 'replace_and_play' | 'append_queue';
    savePreset: boolean;
    customTracks?: Track[];
    adaptMode?: SmartPlaylistAdaptMode;
    timeSlot?: SmartPlaylistTimeSlot;
    autoAdaptEnabled?: boolean;
    timezoneOffsetMinutes?: number;
  }) => {
    if (!activeGroup) return;
    setIsBusy(true);
    try {
      const res = await fetch('/api/music/catalog/smart-playlist', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          groupId: activeGroup.groupId,
          ...payload,
        }),
      });
      const data = (await res.json()) as {
        addedCount?: number;
        adaptSummary?: string;
        state?: BotConfigState;
        error?: string;
      };
      if (res.ok && data.state) {
        setConfig(data.state);
        showToast(
          data.adaptSummary ||
            `پلی‌لیست هوشمند (${data.addedCount || payload.count} آهنگ) برای پخش متوالی در ویس‌چت آماده شد.`,
        );
      } else if (data.error) {
        showToast(data.error);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveSmartPlaylistRule = async (payload: {
    enabled: boolean;
    mode: SmartPlaylistAdaptMode;
    timeSlot: SmartPlaylistTimeSlot;
    moods: MusicMood[];
    trackCount: number;
    balanceMode: 'interleaved' | 'shuffled';
    applyNow?: boolean;
  }) => {
    if (!activeGroup) return;
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/groups/${encodeURIComponent(activeGroup.groupId)}/smart-playlist-rule`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            ...payload,
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          }),
        },
      );
      const data = (await res.json()) as {
        adaptSummary?: string;
        state?: BotConfigState;
        error?: string;
      };
      if (res.ok && data.state) {
        setConfig(data.state);
        if (data.adaptSummary) {
          showToast(data.adaptSummary);
        } else {
          showToast(
            payload.enabled
              ? 'بروزرسانی خودکار پلی‌لیست هوشمند فعال شد.'
              : 'بروزرسانی خودکار پلی‌لیست غیرفعال شد.',
          );
        }
      } else if (data.error) {
        showToast(data.error);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeletePreset = async (playlistId: string) => {
    if (!activeGroup) return;
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/groups/${encodeURIComponent(activeGroup.groupId)}/playlists/${encodeURIComponent(playlistId)}`,
        {method: 'DELETE'},
      );
      if (res.ok) {
        const data = (await res.json()) as {state?: BotConfigState};
        if (data.state) setConfig(data.state);
        showToast('پلی‌لیست ذخیره‌شده حذف شد.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveConfig = async (patch: {
    token?: string;
    creatorName?: string;
    creatorUsername?: string;
    creatorRubikaGuid?: string;
    botName?: string;
    botUsername?: string;
    botEnabled?: boolean;
    globalDailyPlayLimit?: number;
    rubikaMode?: 'bot_api_v3' | 'userbot_rubpy';
    activeGroupId?: string;
    autoSyncAudioToRubika?: boolean;
  }) => {
    setIsBusy(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated = (await res.json()) as BotConfigState;
        setConfig(updated);
        showToast('تنظیمات با موفقیت ذخیره شد.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleVerifyToken = async () => {
    setIsBusy(true);
    try {
      const res = await fetch('/api/bot/verify', {method: 'POST'});
      const data = (await res.json()) as {
        result: BotConfigState['lastVerifyResult'];
        state: BotConfigState;
      };
      setConfig(data.state);
      showToast(
        data.result.verified
          ? 'اتصال توکن به سرور روبیکا با موفقیت تایید شد.'
          : 'پاسخ از سرور روبیکا دریافت شد — جزئیات را در بخش اتصال روبیکا ببینید.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleTogglePolling = async (action: 'start' | 'stop') => {
    setIsBusy(true);
    try {
      const res = await fetch('/api/bot/polling', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action}),
      });
      if (res.ok) {
        const updated = (await res.json()) as BotConfigState;
        setConfig(updated);
        showToast(
          action === 'start'
            ? 'دریافت زنده پیام‌های روبیکا فعال شد.'
            : 'دریافت پیام‌های روبیکا متوقف شد.',
        );
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleSendDirectRubika = async (chatId: string, text: string) => {
    setIsBusy(true);
    try {
      const res = await fetch('/api/bot/send-rubika', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({chatId, text}),
      });
      const data = (await res.json()) as {ok: boolean; error?: string; state?: BotConfigState};
      if (data.state) setConfig(data.state);
      showToast(data.ok ? 'پیام به گروه روبیکا ارسال شد.' : `خطای ارسال روبیکا: ${data.error || 'نامشخص'}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSendTrackToRubika = async (track: Track) => {
    if (!activeGroup) return;
    setIsBusy(true);
    try {
      const res = await fetch('/api/bot/send-track-rubika', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({groupId: activeGroup.groupId, track}),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        groupTitle?: string;
        state?: BotConfigState;
      };
      if (data.state) setConfig(data.state);
      showToast(
        data.ok
          ? `آهنگ «${track.title}» به گروه روبیکا «${data.groupTitle || activeGroup.title}» ارسال شد.`
          : `خطا در ارسال آهنگ به روبیکا: ${data.error || 'نامشخص'}`,
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddGroup = async (payload: {title: string; rubikaChatId: string; daysValid: number}) => {
    setIsBusy(true);
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = (await res.json()) as {state: BotConfigState};
        setConfig(data.state);
        showToast(`گروه «${payload.title}» ثبت و فعال شد.`);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddMember = async (
    groupId: string,
    payload: {name: string; userId: string; role: UserRole},
  ) => {
    setIsBusy(true);
    try {
      const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}/members`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = (await res.json()) as {state: BotConfigState};
        setConfig(data.state);
        showToast(`کاربر «${payload.name}» به گروه اضافه شد.`);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleJoinVoiceCall = async (navigateToVoice = true, targetGroupId?: string) => {
    const gid = targetGroupId || activeGroup?.groupId;
    if (!gid) return;
    audioState.primeAudio();
    setIsBusy(true);
    try {
      await callState.joinCall();
      const res = await fetch('/api/voice-call/join', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({groupId: gid}),
      });
      if (res.ok) {
        const data = (await res.json()) as {state?: BotConfigState; group?: {currentTrack?: Track | null}};
        if (data.state) {
          setConfig(data.state);
        }
        audioState.unlockAudioAndPlay();
        if (navigateToVoice) {
          setActiveTab('voice');
        }
        const trackTitle = data.group?.currentTrack?.title;
        showToast(
          trackTitle
            ? `وارد ویسکال شدید و پخش «${trackTitle}» آغاز شد.`
            : 'با موفقیت وارد ویسکال گروه شدید.',
        );
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddTrackSchedule = async (payload: {
    track: Track;
    startTime: string;
    endTime: string;
    endAction: TrackScheduleItem['endAction'];
  }) => {
    if (!activeGroup) return;
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/groups/${encodeURIComponent(activeGroup.groupId)}/track-schedules`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            ...payload,
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          }),
        },
      );
      const data = (await res.json()) as {state?: BotConfigState; error?: string};
      if (res.ok && data.state) {
        setConfig(data.state);
        showToast(
          `زمان‌بندی پخش «${payload.track.title}» برای ساعت ${payload.startTime} ثبت شد.`,
        );
      } else if (data.error) {
        showToast(data.error);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleTrackSchedule = async (scheduleId: string, enabled: boolean) => {
    if (!activeGroup) return;
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/groups/${encodeURIComponent(activeGroup.groupId)}/track-schedules/${encodeURIComponent(scheduleId)}`,
        {
          method: 'PATCH',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({enabled}),
        },
      );
      const data = (await res.json()) as {state?: BotConfigState};
      if (res.ok && data.state) {
        setConfig(data.state);
        showToast(enabled ? 'زمان‌بندی فعال شد.' : 'زمان‌بندی متوقف شد.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteTrackSchedule = async (scheduleId: string) => {
    if (!activeGroup) return;
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/groups/${encodeURIComponent(activeGroup.groupId)}/track-schedules/${encodeURIComponent(scheduleId)}`,
        {method: 'DELETE'},
      );
      const data = (await res.json()) as {state?: BotConfigState};
      if (res.ok && data.state) {
        setConfig(data.state);
        showToast('زمان‌بندی پخش حذف شد.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleAutoRecord = async (enabled: boolean) => {
    if (!activeGroup) return;
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/groups/${encodeURIComponent(activeGroup.groupId)}/auto-record`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({enabled}),
        },
      );
      const data = (await res.json()) as {state?: BotConfigState};
      if (res.ok && data.state) {
        setConfig(data.state);
        showToast(
          enabled
            ? 'ضبط خودکار جلسات ویسکال فعال شد.'
            : 'ضبط خودکار جلسات ویسکال غیرفعال شد.',
        );
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteRecording = async (recordingId: string) => {
    if (!activeGroup) return;
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/groups/${encodeURIComponent(activeGroup.groupId)}/recordings/${encodeURIComponent(recordingId)}`,
        {method: 'DELETE'},
      );
      const data = (await res.json()) as {state?: BotConfigState};
      if (res.ok && data.state) {
        setConfig(data.state);
        showToast('فایل ضبط جلسه حذف شد.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleUpdateModeration = async (payload: {
    locks?: GroupModerationLocks;
    addFilterWord?: string;
    removeFilterWord?: string;
    unmuteUserId?: string;
    clearWarnings?: boolean;
    clearViolations?: boolean;
    deleteRecentCount?: number;
  }) => {
    if (!activeGroup) return;
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/groups/${encodeURIComponent(activeGroup.groupId)}/moderation`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        state?: BotConfigState;
      };
      if (res.ok && data.state) {
        setConfig(data.state);
        showToast(
          payload.deleteRecentCount
            ? `دستور پاکسازی ${payload.deleteRecentCount} پیام اخیر برای روبیکا ثبت شد.`
            : 'تنظیمات مدیر کمکی و قفل‌های گروه بروزرسانی شد.',
        );
      } else if (data.error) {
        showToast(data.error);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleSetAdminRole = async (payload: {
    targetUserOrUsername: string;
    adminAction: 'SetAdmin' | 'UnsetAdmin';
    targetNameHint?: string;
  }): Promise<{ok: boolean; message?: string; error?: string}> => {
    if (!activeGroup) return {ok: false, error: 'گروه فعالی انتخاب نشده است.'};
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/groups/${encodeURIComponent(activeGroup.groupId)}/admin-role`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        queued?: boolean;
        message?: string;
        error?: string;
        state?: BotConfigState;
      };
      if (data.state) setConfig(data.state);
      if (data.ok && data.message) {
        showToast(data.message);
        return {ok: true, message: data.message};
      }
      const errText = data.error || 'خطا در تنظیم ادمین/مدیر در روبیکا.';
      showToast(errText);
      return {ok: false, error: errText};
    } catch {
      const msg = 'خطا در ارتباط با سرور برای تنظیم ادمین.';
      showToast(msg);
      return {ok: false, error: msg};
    } finally {
      setIsBusy(false);
    }
  };

  const handleSyncGroupMembers = async (): Promise<{ok: boolean; error?: string}> => {
    if (!activeGroup) return {ok: false, error: 'گروه فعالی انتخاب نشده است.'};
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/groups/${encodeURIComponent(activeGroup.groupId)}/sync-members`,
        {method: 'POST'},
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        group?: BotConfigState['groups'][string];
        state?: BotConfigState;
      };
      if (data.state) setConfig(data.state);
      if (res.ok && data.ok) {
        showToast(`لیست اعضا و مدیران واقعی (${data.group?.members.length || 0} نفر) همگام‌سازی شد.`);
        return {ok: true};
      }
      const errText = data.error || 'خطا در دریافت اعضا و مدیران از روبیکا.';
      showToast(errText);
      return {ok: false, error: errText};
    } catch {
      const msg = 'خطا در ارتباط با سرور برای همگام‌سازی اعضا.';
      showToast(msg);
      return {ok: false, error: msg};
    } finally {
      setIsBusy(false);
    }
  };

  const handleJoinInviteLink = async (inviteLink: string, songQuery?: string) => {
    setIsBusy(true);
    try {
      const res = await fetch('/api/userbot/join-invite', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          inviteLink,
          autoPlayInCall: true,
          ...(songQuery?.trim() ? {songQuery: songQuery.trim()} : {}),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        queued?: boolean;
        error?: string;
        group?: BotConfigState['groups'][string];
        startedTrack?: Track;
        state?: BotConfigState;
      };
      if (data.state) {
        setConfig(data.state);
      }
      if (res.ok && data.ok && data.group) {
        const kindLabel =
          data.group.chatType === 'channel' || data.group.rubikaChatId.startsWith('c0')
            ? 'کانال'
            : 'گروه';
        const trackTitle = data.startedTrack?.title || data.group.currentTrack?.title;
        showToast(
          trackTitle
            ? `${kindLabel} «${data.group.title}» متصل شد، ویسکال باز شد و پخش «${trackTitle}» آغاز گردید.`
            : `${kindLabel} «${data.group.title}» (${data.group.rubikaChatId}) متصل و ویسکال فعال شد.`,
        );
        return {ok: true, group: data.group, startedTrack: data.startedTrack};
      }
      if (data.queued) {
        const msg =
          data.error ||
          'در صف عضویت خودکار قرار گرفت و بلافاصله پس از ورود Userbot متصل می‌شود.';
        showToast(msg);
        return {ok: false, queued: true, error: msg};
      }
      showToast(data.error || 'خطا در اتصال خودکار گروه/کانال با لینک یا آیدی.');
      return {ok: false, error: data.error || 'خطا در اتصال خودکار گروه/کانال با لینک یا آیدی.'};
    } catch {
      return {ok: false, error: 'خطا در برقراری ارتباط با سرور.'};
    } finally {
      setIsBusy(false);
    }
  };

  const handleOpenVoiceCallInGroup = async () => {
    await handleRunCommand({
      text: 'ویسکال',
      sendToRubika: Boolean(config?.pollingActive),
      allowBroadcastText: true,
    });
  };

  const handleCreateCustomPlaylist = async (name: string) => {
    if (!activeGroup || !config) return;
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/groups/${encodeURIComponent(activeGroup.groupId)}/custom-playlists`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            name,
            createdBy: config.creatorName,
            createdById: config.creatorId,
          }),
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        state?: BotConfigState;
      };
      if (data.state) setConfig(data.state);
      showToast(
        res.ok && data.ok
          ? `پلی‌لیست «${name}» ساخته شد.`
          : data.error || 'خطا در ساخت پلی‌لیست.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleRenameCustomPlaylist = async (playlistId: string, newName: string) => {
    if (!activeGroup) return;
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/groups/${encodeURIComponent(activeGroup.groupId)}/custom-playlists/${encodeURIComponent(playlistId)}`,
        {
          method: 'PATCH',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({name: newName}),
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        state?: BotConfigState;
      };
      if (data.state) setConfig(data.state);
      showToast(
        res.ok && data.ok
          ? `نام پلی‌لیست به «${newName}» تغییر یافت.`
          : data.error || 'خطا در تغییر نام پلی‌لیست.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteCustomPlaylist = async (playlistId: string) => {
    if (!activeGroup) return;
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/groups/${encodeURIComponent(activeGroup.groupId)}/custom-playlists/${encodeURIComponent(playlistId)}`,
        {method: 'DELETE'},
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        state?: BotConfigState;
      };
      if (data.state) setConfig(data.state);
      showToast(res.ok && data.ok ? 'پلی‌لیست حذف شد.' : data.error || 'خطا در حذف پلی‌لیست.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddTrackToCustomPlaylist = async (
    playlistId: string,
    payload: {track?: Track; searchQuery?: string; directUrl?: string; title?: string},
  ) => {
    if (!activeGroup || !config) return;
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/groups/${encodeURIComponent(activeGroup.groupId)}/custom-playlists/${encodeURIComponent(playlistId)}/tracks`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            ...payload,
            requestedBy: config.creatorName,
          }),
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        addedTrack?: Track;
        state?: BotConfigState;
      };
      if (data.state) setConfig(data.state);
      showToast(
        res.ok && data.ok
          ? `آهنگ «${data.addedTrack?.title || payload.track?.title || 'جدید'}» به پلی‌لیست اضافه شد.`
          : data.error || 'خطا در افزودن آهنگ به پلی‌لیست.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveTrackFromCustomPlaylist = async (playlistId: string, trackIndex: number) => {
    if (!activeGroup) return;
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/groups/${encodeURIComponent(activeGroup.groupId)}/custom-playlists/${encodeURIComponent(playlistId)}/tracks/${trackIndex}`,
        {method: 'DELETE'},
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        state?: BotConfigState;
      };
      if (data.state) setConfig(data.state);
      showToast(res.ok && data.ok ? 'آهنگ از پلی‌لیست حذف شد.' : data.error || 'خطا در حذف آهنگ.');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePlayCustomPlaylist = async (
    playlistId: string,
    mode: 'replace_and_play' | 'append_queue',
  ) => {
    if (!activeGroup) return;
    audioState.primeAudio();
    if (mode === 'replace_and_play' && callState.callStatus === 'idle') {
      void callState.joinCall();
    }
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/groups/${encodeURIComponent(activeGroup.groupId)}/custom-playlists/${encodeURIComponent(playlistId)}/play`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({mode}),
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        startedTrack?: Track;
        state?: BotConfigState;
      };
      if (data.state) setConfig(data.state);
      if (res.ok && data.ok) {
        showToast(
          mode === 'append_queue'
            ? 'آهنگ‌های پلی‌لیست به صف پخش ویسکال اضافه شد.'
            : `پخش پلی‌لیست با آهنگ «${data.startedTrack?.title || ''}» آغاز شد.`,
        );
      } else {
        showToast(data.error || 'خطا در پخش پلی‌لیست.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  if (!config || !activeGroup) {
    return (
      <div className="min-h-screen bg-[#0B0F17] flex items-center justify-center p-6 text-slate-300 text-sm">
        در حال بارگذاری هسته ربات موزیکال روبیکا...
      </div>
    );
  }

  const remainingDays = Math.max(
    0,
    Math.ceil(
      (new Date(activeGroup.subscription.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    ),
  );

  const activeTabInfo = NAV_ITEMS.find((n) => n.key === activeTab) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Right Sidebar (RTL Navigation) */}
      <aside
        className={`fixed lg:static inset-y-0 right-0 z-50 w-[268px] shrink-0 bg-[#111827] border-l border-slate-800 flex flex-col justify-between transition-transform duration-200 ${
          mobileMenuOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-5 space-y-6">
          {/* Brand Profile */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src="/src/assets/images/bot_studio_avatar_1794902867918.jpg"
                alt="آواتار ربات موزیکال پریا چش رنگی"
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-lg object-cover border border-slate-700 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-100 truncate">ربات موزیکال روبیکا</p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('creator');
                    setMobileMenuOpen(false);
                  }}
                  className="text-xs text-amber-300 hover:text-amber-200 truncate block text-right cursor-pointer"
                >
                  سازنده: {config.creatorUsername || '@Paria25805'}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden text-slate-400 hover:text-white cursor-pointer"
              aria-label="بستن منو"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Active Group Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs text-slate-400">گروه فعال</label>
            <select
              value={activeGroup.groupId}
              onChange={(e) => void handleSaveConfig({activeGroupId: e.target.value})}
              className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none"
            >
              {Object.values(config.groups).map((g) => (
                <option key={g.groupId} value={g.groupId}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.key);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-emerald-600/15 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Sidebar Summary */}
        <div className="p-5 border-t border-slate-800 space-y-3 text-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span>وضعیت اتصال روبیکا</span>
            <span className={config.pollingActive ? 'text-emerald-400 font-medium' : 'text-slate-300'}>
              {config.pollingActive ? 'دریافت زنده فعال' : 'آماده'}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>اعتبار اشتراک گروه</span>
            <span className="font-mono tabular-nums text-slate-200">{remainingDays} روز</span>
          </div>
          <PWAInstallButton />
          <a
            href="/api/export/full-app-zip"
            download="paria-rubika-music-app.zip"
            className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>دانلود مستقیم برنامه (.zip)</span>
          </a>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: 3 clean zones separated by gap-8 */}
        <header className="h-16 px-4 sm:px-6 border-b border-slate-800 bg-[#111827]/90 flex items-center justify-between gap-8 sticky top-0 z-30">
          {/* Zone 1: Brand / Section */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg bg-slate-800 text-slate-200 cursor-pointer"
              aria-label="باز کردن منو"
            >
              <Menu className="w-4 h-4" />
            </button>
            <h1 className="text-base font-bold text-slate-100 whitespace-nowrap shrink-0">
              {activeTabInfo.label}
            </h1>
          </div>

          {/* Zone 2: Quick single-line tab links on desktop */}
          <nav className="hidden xl:flex items-center gap-6 text-sm text-slate-400">
            {NAV_ITEMS.slice(0, 4).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeTab === item.key ? 'text-emerald-400 font-medium' : 'hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Direct Download + Primary Action */}
          <div className="shrink-0 flex items-center gap-2">
            <PWAInstallButton compact className="hidden sm:flex" />
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleTogglePolling(config.pollingActive ? 'stop' : 'start')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                config.pollingActive
                  ? 'bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {config.pollingActive ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{config.pollingActive ? 'توقف ربات روبیکا' : 'اجرای زنده ربات روبیکا'}</span>
            </button>
          </div>
        </header>

        {/* Feedback Toast */}
        {toastMsg && (
          <div className="mx-4 sm:mx-6 mt-4 px-4 py-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-200 flex items-center justify-between gap-3">
            <span className="truncate">{toastMsg}</span>
            <button
              type="button"
              onClick={() => setToastMsg(null)}
              className="text-emerald-300 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Deep-link Call Invite Banner (?joinCall=groupId) */}
        {pendingJoinGroupId && config.groups[pendingJoinGroupId] && (
          <div className="mx-4 sm:mx-6 mt-4 px-4 py-3 rounded-xl bg-emerald-600/20 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-emerald-100">
              <PhoneCall className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                دعوت به تماس صوتی گروه «{config.groups[pendingJoinGroupId].title}» — برای مکالمه و شنیدن آهنگ روی دکمه زیر بزنید.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  const targetId = pendingJoinGroupId;
                  if (activeGroup.groupId !== targetId) {
                    await handleSaveConfig({activeGroupId: targetId});
                  }
                  await handleJoinVoiceCall(true, targetId);
                  setPendingJoinGroupId(null);
                  window.history.replaceState({}, '', window.location.pathname);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
              >
                پیوستن به تماس صوتی
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingJoinGroupId(null);
                  window.history.replaceState({}, '', window.location.pathname);
                }}
                className="p-1.5 text-slate-300 hover:text-white cursor-pointer"
                aria-label="بستن"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Viewport Content */}
        <main className="flex-1 p-4 sm:p-6 pb-24 max-w-[1400px] w-full mx-auto">
          {activeTab === 'voice' && (
            <VoiceCallStudioView
              group={activeGroup}
              isBusy={isBusy}
              audioState={audioState}
              audioSettings={audioSettings}
              onChangeAudioSettings={handleChangeAudioSettings}
              callState={callState}
              recorderState={recorderState}
              userbotStatus={config.userbotStatus}
              onOpenRubikaTab={() => setActiveTab('rubika')}
              onRunCommand={(text) =>
                handleRunCommand({text, sendToRubika: Boolean(config.pollingActive)})
              }
              onSelectTrack={handleSelectTrack}
              onEnqueueMood={handleEnqueueMood}
              onSetAutoShutdown={handleSetAutoShutdown}
              onAddTrackSchedule={handleAddTrackSchedule}
              onToggleTrackSchedule={handleToggleTrackSchedule}
              onDeleteTrackSchedule={handleDeleteTrackSchedule}
              onToggleAutoRecord={handleToggleAutoRecord}
              onDeleteRecording={handleDeleteRecording}
              onApplySmartPlaylist={handleApplySmartPlaylist}
              onSaveSmartPlaylistRule={handleSaveSmartPlaylistRule}
              onDeletePreset={handleDeletePreset}
              onSendTrackToRubika={handleSendTrackToRubika}
              shortcuts={config.quickShortcuts || []}
              onRunShortcut={handleRunShortcut}
              onAddShortcut={handleAddShortcut}
              onDeleteShortcut={handleDeleteShortcut}
              onCreateCustomPlaylist={handleCreateCustomPlaylist}
              onRenameCustomPlaylist={handleRenameCustomPlaylist}
              onDeleteCustomPlaylist={handleDeleteCustomPlaylist}
              onAddTrackToCustomPlaylist={handleAddTrackToCustomPlaylist}
              onRemoveTrackFromCustomPlaylist={handleRemoveTrackFromCustomPlaylist}
              onPlayCustomPlaylist={handlePlayCustomPlaylist}
            />
          )}

          {activeTab === 'chat' && (
            <GroupChatConsoleView
              group={activeGroup}
              creatorId={config.creatorId}
              isBusy={isBusy}
              pollingActive={config.pollingActive}
              userbotStatus={config.userbotStatus}
              onOpenRubikaTab={() => setActiveTab('rubika')}
              onJoinVoiceCall={() => handleJoinVoiceCall(true)}
              audioState={audioState}
              callState={callState}
              onExecuteCommand={handleRunCommand}
              onSelectTrack={handleSelectTrack}
              onSendVoiceNote={handleSendVoiceNote}
              onAddTrackToPlaylist={handleAddTrackToCustomPlaylist}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsD3View
              group={activeGroup}
              isBusy={isBusy}
              onQuickPlayRandom={() => handleRunCommand({text: 'پخش رندوم'})}
              onNavigateToVoice={() => setActiveTab('voice')}
            />
          )}

          {activeTab === 'groups' && (
            <GroupsAccessView
              config={config}
              activeGroup={activeGroup}
              isBusy={isBusy}
              onSelectGroup={(groupId) => handleSaveConfig({activeGroupId: groupId})}
              onAddGroup={handleAddGroup}
              onAddMember={handleAddMember}
              onRunCommand={handleRunCommand}
              onJoinInvite={handleJoinInviteLink}
              onOpenVoiceCallInGroup={handleOpenVoiceCallInGroup}
              onUpdateModeration={handleUpdateModeration}
              onSetAdminRole={handleSetAdminRole}
              onSyncMembers={handleSyncGroupMembers}
            />
          )}

          {activeTab === 'creator' && (
            <CreatorPanelView
              config={config}
              activeGroup={activeGroup}
              isBusy={isBusy}
              onSaveConfig={handleSaveConfig}
              onRunCommand={handleRunCommand}
              onJoinInvite={handleJoinInviteLink}
              onRefreshState={fetchState}
              onNotify={showToast}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'rubika' && (
            <RubikaConnectionView
              config={config}
              activeGroup={activeGroup}
              isBusy={isBusy}
              onSaveConfig={handleSaveConfig}
              onVerifyToken={handleVerifyToken}
              onTogglePolling={handleTogglePolling}
              onSendDirectRubika={handleSendDirectRubika}
              onJoinInvite={handleJoinInviteLink}
              onOpenVoiceCallInGroup={handleOpenVoiceCallInGroup}
              onRefreshState={fetchState}
              onNotify={showToast}
            />
          )}

          {activeTab === 'apk' && (
            <PythonApkExportView token={config.token} creatorName={config.creatorName} />
          )}
        </main>
      </div>

      {/* Global Floating Voice Call Mini-Player across all tabs */}
      <FloatingVoiceCallPlayer
        group={activeGroup}
        isBusy={isBusy}
        currentTime={audioState.currentTime}
        duration={audioState.duration}
        activeTab={activeTab}
        onNavigateToVoice={() => setActiveTab('voice')}
        onRunCommand={(text) =>
          handleRunCommand({text, sendToRubika: Boolean(config.pollingActive)})
        }
        onPrimeAndUnlockAudio={() => {
          audioState.primeAudio();
          if (callState.callStatus === 'idle') {
            void callState.joinCall();
          }
          audioState.unlockAudioAndPlay();
        }}
      />
      <OfflineIndicator />
    </div>
  );
}
