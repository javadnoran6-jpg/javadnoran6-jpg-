import React, {useEffect, useRef, useState} from 'react';
import {
  Check,
  ChevronDown,
  Clock,
  Copy,
  Disc3,
  ExternalLink,
  Globe,
  Headphones,
  History,
  Link2,
  ListMusic,
  Mic,
  MicOff,
  Pause,
  PhoneCall,
  PhoneOff,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import {
  AudioVisualizerFrame,
  RUBIKA_AUDIO_PROFILES,
  detectAudioProfileId,
} from '../hooks/useVoiceAudioEngine';
import {CallParticipantInfo} from '../hooks/useWebRTCCall';
import {
  AudioEngineSettings,
  GroupState,
  MusicMood,
  QuickCommandShortcut,
  RubikaAudioProfileId,
  SmartPlaylistAdaptMode,
  SmartPlaylistTimeSlot,
  Track,
  TrackScheduleItem,
  UserbotBridgeStatus,
} from '../types/bot';
import {AudioLatencySettingsPanel} from './AudioLatencySettingsPanel';
import {AudioVisualizerPanel} from './AudioVisualizerPanel';
import {CommandShortcutsPanel} from './CommandShortcutsPanel';
import {CustomPlaylistsPanel} from './CustomPlaylistsPanel';
import {HeadphonePreviewWidget} from './HeadphonePreviewWidget';
import {LiveTrackProgressWidget} from './LiveTrackProgressWidget';
import {MusicCatalogPanel} from './MusicCatalogPanel';
import {SmartPlaylistBuilder} from './SmartPlaylistBuilder';
import {TrackSchedulerPanel} from './TrackSchedulerPanel';
import {VoiceCallRecorderPanel} from './VoiceCallRecorderPanel';
import {useHeadphonePreview} from '../hooks/useHeadphonePreview';

interface VoiceCallStudioViewProps {
  group: GroupState;
  isBusy: boolean;
  userbotStatus?: UserbotBridgeStatus;
  onOpenRubikaTab?: () => void;
  audioState: {
    currentTime: number;
    duration: number;
    frequencyBars: number[];
    audioError: string | null;
    isBuffering: boolean;
    micActive: boolean;
    micError: string | null;
    engineTelemetry: {
      actualSampleRate: number;
      baseLatencyMs: number;
      outputLatencyMs: number;
      contextState: AudioContextState | 'uninitialized';
    };
    getVisualizerFrame: () => AudioVisualizerFrame;
    seekTo: (sec: number) => void;
    toggleMic: () => void;
    unlockAudioAndPlay: () => void;
    primeAudio: () => void;
  };
  audioSettings: AudioEngineSettings;
  onChangeAudioSettings: (next: AudioEngineSettings) => void;
  callState: {
    callStatus: 'idle' | 'ringing' | 'connected';
    participants: CallParticipantInfo[];
    micEnabled: boolean;
    micAvailable: boolean;
    micLevel: number;
    selfTestActive: boolean;
    callSeconds: number;
    callNotice: string | null;
    inviteUrl: string;
    joinCall: () => Promise<void>;
    leaveCall: (playTone?: boolean) => void;
    toggleCallMic: () => void;
    toggleSelfTest: () => void;
  };
  recorderState: {
    isRecording: boolean;
    isSaving: boolean;
    recordingSeconds: number;
    recordedBytes: number;
    recorderError: string | null;
    lastLocalDownloadUrl: {url: string; filename: string; durationSec: number} | null;
    startRecording: () => void;
    stopRecording: () => void;
  };
  onRunCommand: (text: string) => Promise<void>;
  onSelectTrack: (track: Track, mode: 'play_now' | 'queue') => Promise<void>;
  onEnqueueMood: (mood: MusicMood, count: number) => Promise<void>;
  onSetAutoShutdown: (payload: {
    enabled: boolean;
    targetTime: string;
    stopPollingAlso: boolean;
  }) => Promise<void>;
  onAddTrackSchedule: (payload: {
    track: Track;
    startTime: string;
    endTime: string;
    endAction: TrackScheduleItem['endAction'];
  }) => Promise<void>;
  onToggleTrackSchedule: (scheduleId: string, enabled: boolean) => Promise<void>;
  onDeleteTrackSchedule: (scheduleId: string) => Promise<void>;
  onToggleAutoRecord: (enabled: boolean) => Promise<void>;
  onDeleteRecording: (recordingId: string) => Promise<void>;
  onApplySmartPlaylist: (payload: {
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
  }) => Promise<void>;
  onSaveSmartPlaylistRule?: (payload: {
    enabled: boolean;
    mode: SmartPlaylistAdaptMode;
    timeSlot: SmartPlaylistTimeSlot;
    moods: MusicMood[];
    trackCount: number;
    balanceMode: 'interleaved' | 'shuffled';
    applyNow?: boolean;
  }) => Promise<void>;
  onDeletePreset: (playlistId: string) => Promise<void>;
  onSendTrackToRubika?: (track: Track) => Promise<void>;
  shortcuts: QuickCommandShortcut[];
  onRunShortcut: (shortcut: QuickCommandShortcut) => Promise<void>;
  onAddShortcut: (payload: {
    label?: string;
    commandText: string;
    accent: QuickCommandShortcut['accent'];
    sendToRubika: boolean;
  }) => Promise<void>;
  onDeleteShortcut: (shortcutId: string) => Promise<void>;
  onCreateCustomPlaylist: (name: string) => Promise<void>;
  onRenameCustomPlaylist: (playlistId: string, newName: string) => Promise<void>;
  onDeleteCustomPlaylist: (playlistId: string) => Promise<void>;
  onAddTrackToCustomPlaylist: (
    playlistId: string,
    payload: {track?: Track; searchQuery?: string; directUrl?: string; title?: string},
  ) => Promise<void>;
  onRemoveTrackFromCustomPlaylist: (playlistId: string, trackIndex: number) => Promise<void>;
  onPlayCustomPlaylist: (
    playlistId: string,
    mode: 'replace_and_play' | 'append_queue',
  ) => Promise<void>;
}

function formatSec(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const VoiceCallStudioView: React.FC<VoiceCallStudioViewProps> = ({
  group,
  isBusy,
  userbotStatus,
  onOpenRubikaTab,
  audioState,
  audioSettings,
  onChangeAudioSettings,
  callState,
  recorderState,
  onRunCommand,
  onSelectTrack,
  onEnqueueMood,
  onSetAutoShutdown,
  onAddTrackSchedule,
  onToggleTrackSchedule,
  onDeleteTrackSchedule,
  onToggleAutoRecord,
  onDeleteRecording,
  onApplySmartPlaylist,
  onSaveSmartPlaylistRule,
  onDeletePreset,
  onSendTrackToRubika,
  shortcuts,
  onRunShortcut,
  onAddShortcut,
  onDeleteShortcut,
  onCreateCustomPlaylist,
  onRenameCustomPlaylist,
  onDeleteCustomPlaylist,
  onAddTrackToCustomPlaylist,
  onRemoveTrackFromCustomPlaylist,
  onPlayCustomPlaylist,
}) => {
  const headphonePreview = useHeadphonePreview();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [directUrl, setDirectUrl] = useState('');
  const [quickPlaylistId, setQuickPlaylistId] = useState<string>(
    group.customPlaylists?.[0]?.id || '',
  );
  const [volumeDraft, setVolumeDraft] = useState<number | null>(null);
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const audioMenuRef = useRef<HTMLDivElement | null>(null);
  const [copiedCallLink, setCopiedCallLink] = useState(false);

  useEffect(() => {
    if (!audioMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (audioMenuRef.current && !audioMenuRef.current.contains(e.target as Node)) {
        setAudioMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [audioMenuOpen]);

  const activeAudioProfileId = detectAudioProfileId(audioSettings);
  const activeAudioProfileLabel =
    activeAudioProfileId !== 'custom'
      ? RUBIKA_AUDIO_PROFILES[activeAudioProfileId].name
      : 'Custom';
  const [shutdownTime, setShutdownTime] = useState<string>(group.autoShutdown?.targetTime || '23:30');
  const [stopPollingAlso, setStopPollingAlso] = useState<boolean>(
    Boolean(group.autoShutdown?.stopPollingAlso),
  );
  const [countdownText, setCountdownText] = useState<string>('');
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [trendingError, setTrendingError] = useState<string | null>(null);
  const [trendingResult, setTrendingResult] = useState<{
    suggestions: Array<{rank: number; reason?: string; track: Track}>;
    sources: Array<{title: string; uri: string}>;
    provider: string;
    notice?: string;
    searchedAt: string;
  } | null>(null);

  const [smartQuery, setSmartQuery] = useState('');
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);
  const [smartPlaylistTargetId, setSmartPlaylistTargetId] = useState<string>(
    group.customPlaylists?.[0]?.id || '',
  );
  const [newSmartPlaylistName, setNewSmartPlaylistName] = useState('');
  const [smartSearchResult, setSmartSearchResult] = useState<{
    suggestions: Array<{rank: number; reason?: string; track: Track}>;
    sources: Array<{title: string; uri: string}>;
    provider: string;
    notice?: string;
    searchedAt: string;
  } | null>(null);

  const handleSmartOnlineSearch = async (queryOverride?: string) => {
    const q = (queryOverride ?? smartQuery).trim();
    if (!q) return;
    setSmartLoading(true);
    setSmartError(null);
    try {
      const res = await fetch('/api/music/smart-search', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({query: q}),
      });
      const data = await res.json();
      if (!res.ok) {
        setSmartError(data.error || 'خطا در جستجوی هوشمند آنلاین.');
      } else {
        setSmartSearchResult(data);
        if (!data.suggestions || data.suggestions.length === 0) {
          setSmartError(`نتیجه قابل پخشی برای «${q}» در منابع آنلاین پیدا نشد.`);
        }
      }
    } catch {
      setSmartError('عدم دسترسی به سرویس جستجوی هوشمند آنلاین.');
    } finally {
      setSmartLoading(false);
    }
  };

  const handleDiscoverTrending = async () => {
    setTrendingLoading(true);
    setTrendingError(null);
    try {
      const res = await fetch('/api/music/trending-rubika', {method: 'POST'});
      const data = await res.json();
      if (!res.ok) {
        setTrendingError(data.error || 'خطا در جستجوی آنلاین آهنگ‌های محبوب روز روبیکا.');
      } else {
        setTrendingResult(data);
      }
    } catch {
      setTrendingError('عدم دسترسی به سرویس جستجوی آنلاین.');
    } finally {
      setTrendingLoading(false);
    }
  };

  useEffect(() => {
    if (group.autoShutdown?.targetTime) {
      setShutdownTime(group.autoShutdown.targetTime);
      setStopPollingAlso(Boolean(group.autoShutdown.stopPollingAlso));
    }
  }, [group.autoShutdown?.targetTime, group.autoShutdown?.stopPollingAlso]);

  useEffect(() => {
    const nextIso = group.autoShutdown?.enabled ? group.autoShutdown.nextTriggerIso : null;
    if (!nextIso) {
      setCountdownText('');
      return;
    }
    const updateTimer = () => {
      const diffMs = Math.max(0, new Date(nextIso).getTime() - Date.now());
      const totalSec = Math.floor(diffMs / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      setCountdownText(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
      );
    };
    updateTimer();
    const id = setInterval(updateTimer, 1000);
    return () => clearInterval(id);
  }, [group.autoShutdown?.enabled, group.autoShutdown?.nextTriggerIso]);

  const setOffsetMinutes = (mins: number) => {
    const target = new Date(Date.now() + mins * 60 * 1000);
    const hh = String(target.getHours()).padStart(2, '0');
    const mm = String(target.getMinutes()).padStart(2, '0');
    setShutdownTime(`${hh}:${mm}`);
  };

  const displayedVolume = volumeDraft ?? group.volume;

  const handleMusicSearch = async (queryOverride?: string) => {
    const q = (queryOverride ?? searchQuery).trim();
    if (!q) return;
    setSearching(true);
    setSearchNotice(null);
    try {
      const res = await fetch(`/api/music/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as {tracks?: Track[]};
      const found = data.tracks || [];
      setSearchResults(found);
      if (found.length === 0) {
        setSearchNotice(`نتیجه‌ای برای «${q}» یافت نشد. عبارت دیگری جستجو کنید یا لینک مستقیم وارد نمایید.`);
      }
    } catch {
      setSearchNotice('خطا در اتصال به سرویس جستجوی موسیقی.');
    } finally {
      setSearching(false);
    }
  };

  const handleDirectAction = async (mode: 'play' | 'instant' | 'queue') => {
    const cleaned = directUrl.trim();
    if (!cleaned) return;
    const prefix =
      mode === 'instant' ? 'پخش فوری' : mode === 'queue' ? 'اضافه به صف' : 'پخش ویسکال';
    await onRunCommand(`${prefix} ${cleaned}`);
    setDirectUrl('');
  };

  const activeArt = group.currentTrack?.artworkUrl || '/src/assets/images/voice_room_cover_1794902868085.jpg';

  return (
    <div className="space-y-6">
      {/* Main Voice Call & Active Player Deck */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          {/* Visual Cover & FFT Audio Spectrum */}
          <div className="lg:col-span-5 relative min-h-[240px] bg-[#0B0F17] flex flex-col justify-between p-5 border-b lg:border-b-0 lg:border-l border-slate-800 overflow-hidden">
            <img
              src={activeArt}
              alt={group.currentTrack?.title || 'استودیو ویسکال روبیکا'}
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover opacity-35"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F17] via-[#0B0F17]/70 to-[#0B0F17]/40" />

            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    group.voiceCallActive ? 'bg-emerald-500' : 'bg-slate-500'
                  }`}
                />
                <span>{group.voiceCallActive ? 'ویس‌چت گروهی فعال' : 'ویس‌چت غیرفعال'}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{group.rubikaChatId}</span>
              </div>
              {group.isMuted && (
                <span className="text-xs font-medium text-amber-400">بیصدا (پخش در پس‌زمینه)</span>
              )}
            </div>

            {/* Live FFT Spectrum Bars */}
            <div className="relative z-10 my-6 flex items-end justify-center gap-1.5 h-20">
              {audioState.frequencyBars.map((val, idx) => (
                <div
                  key={idx}
                  style={{height: `${val}%`}}
                  className={`w-2 rounded-t transition-all duration-75 ${
                    group.isMuted
                      ? 'bg-amber-500/45'
                      : group.isPlaying
                        ? 'bg-emerald-500'
                        : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>

            <div className="relative z-10 flex items-center justify-between gap-2 text-xs text-slate-300">
              <span className="truncate">
                {group.currentTrack
                  ? `درخواست‌کننده: ${group.currentTrack.requestedBy}`
                  : 'آماده دریافت دستور پخش در گروه'}
              </span>
              <span className="font-mono tabular-nums shrink-0">
                {formatSec(audioState.currentTime)} / {formatSec(audioState.duration || group.currentTrack?.durationSec || 0)}
              </span>
            </div>
          </div>

          {/* Controls & Mixer */}
          <div className="lg:col-span-7 p-6 flex flex-col justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 mb-1">
                    {group.title} · {group.publicAccess === 'open' ? 'دسترسی عموم باز' : 'دسترسی قفل'}
                  </p>
                  <h2 className="text-xl font-bold text-slate-100 truncate">
                    {group.currentTrack
                      ? group.currentTrack.title
                      : group.pausedTrack
                        ? `متوقف‌شده: ${group.pausedTrack.title}`
                        : 'هیچ آهنگی در حال پخش نیست'}
                  </h2>
                  <p className="text-sm text-slate-400 mt-1 truncate">
                    {group.currentTrack
                      ? `${group.currentTrack.artist} · منبع: ${group.currentTrack.source === 'itunes' ? 'جستجوی زنده' : group.currentTrack.source === 'deezer' ? 'دیزر' : 'لینک مستقیم'}`
                      : 'یک آهنگ جستجو کنید یا دستور «آهنگ لری» را اجرا نمایید'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {(!group.isPlaying || !group.voiceCallActive) && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        audioState.primeAudio();
                        if (callState.callStatus === 'idle') {
                          void callState.joinCall();
                        }
                        if (group.pausedTrack) {
                          void onRunCommand('ادامه آهنگ');
                        } else if (group.currentTrack && !group.isPlaying) {
                          void onSelectTrack(group.currentTrack, 'play_now');
                        } else {
                          void onRunCommand('پخش آهنگ');
                        }
                      }}
                      className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Play className="w-4 h-4" />
                      <span>ورود به ویسکال و پخش آهنگ</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={trendingLoading}
                    onClick={handleDiscoverTrending}
                    className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {trendingLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <TrendingUp className="w-4 h-4" />
                    )}
                    <span>{trendingLoading ? 'جستجوی آنلاین ترندها...' : 'محبوب‌ترین‌های روز روبیکا'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      audioState.primeAudio();
                      const isLive = callState.callStatus !== 'idle' || group.voiceCallActive;
                      if (isLive) {
                        callState.leaveCall(true);
                        void onRunCommand('قطع ویسکال');
                      } else {
                        void callState.joinCall();
                        void onRunCommand('ساخت کال');
                      }
                    }}
                    className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      callState.callStatus !== 'idle' || group.voiceCallActive
                        ? 'bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25'
                        : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {callState.callStatus !== 'idle' || group.voiceCallActive ? (
                      <PhoneOff className="w-4 h-4" />
                    ) : (
                      <PhoneCall className="w-4 h-4" />
                    )}
                    <span>
                      {callState.callStatus !== 'idle' || group.voiceCallActive
                        ? 'قطع تماس و ویسکال'
                        : 'برقراری تماس صوتی (ساخت کال)'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      audioState.primeAudio();
                      if (callState.callStatus !== 'idle') {
                        callState.toggleCallMic();
                      } else {
                        audioState.toggleMic();
                      }
                    }}
                    className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      (callState.callStatus !== 'idle'
                        ? callState.micEnabled && callState.micAvailable
                        : audioState.micActive)
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                        : 'bg-slate-800/70 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    {(callState.callStatus !== 'idle'
                      ? callState.micEnabled && callState.micAvailable
                      : audioState.micActive) ? (
                      <Mic className="w-4 h-4" />
                    ) : (
                      <MicOff className="w-4 h-4" />
                    )}
                    <span>
                      {callState.callStatus !== 'idle'
                        ? callState.micEnabled && callState.micAvailable
                          ? 'میکروفون تماس باز'
                          : 'میکروفون بسته'
                        : audioState.micActive
                          ? 'میکروفون متصل'
                          : 'میکروفون کال'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Scrubber */}
              <div className="mt-5">
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, audioState.duration || group.currentTrack?.durationSec || 30)}
                  value={Math.min(
                    audioState.currentTime,
                    audioState.duration || group.currentTrack?.durationSec || 30,
                  )}
                  onChange={(e) => audioState.seekTo(Number(e.target.value))}
                  disabled={!group.currentTrack}
                  aria-label="موقعیت پخش آهنگ"
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Real WebRTC Live Voice / Phone Call Strip */}
              <div className="mt-4 p-3.5 rounded-lg bg-[#0B0F17] border border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`font-semibold ${
                        callState.callStatus === 'connected'
                          ? 'text-emerald-400'
                          : callState.callStatus === 'ringing'
                            ? 'text-amber-400'
                            : 'text-slate-300'
                      }`}
                    >
                      {callState.callStatus === 'connected'
                        ? `تماس صوتی زنده برقرار است · ${formatSec(callState.callSeconds)}`
                        : callState.callStatus === 'ringing'
                          ? 'در حال برقراری تماس و اتصال صوتی...'
                          : 'اتاق تماس تلفنی و ویس‌کال آماده اتصال (همراه با پخش همزمان آهنگ)'}
                    </span>

                    {callState.callStatus === 'connected' && (
                      <span className="flex items-center gap-1 text-slate-400 font-mono tabular-nums">
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{callState.participants.length} نفر در تماس</span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {callState.callStatus === 'idle' ? (
                      <button
                        type="button"
                        onClick={() => {
                          audioState.primeAudio();
                          void callState.joinCall();
                          if (!group.voiceCallActive) {
                            void onRunCommand('ساخت کال');
                          }
                        }}
                        className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                        <span>ورود به تماس صوتی</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={callState.toggleSelfTest}
                        className={`px-2.5 py-1.5 rounded border text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                          callState.selfTestActive
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                        }`}
                      >
                        <Headphones className="w-3.5 h-3.5" />
                        <span>{callState.selfTestActive ? 'قطع تست صدا' : 'تست صدای خودم'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(callState.inviteUrl).then(() => {
                          setCopiedCallLink(true);
                          setTimeout(() => setCopiedCallLink(false), 2200);
                        });
                      }}
                      className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedCallLink ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedCallLink ? 'لینک تماس کپی شد' : 'کپی لینک تماس تلفنی'}</span>
                    </button>
                  </div>
                </div>

                {callState.callStatus === 'connected' && (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs">
                    <div className="flex flex-wrap items-center gap-2 text-slate-300">
                      <span className="text-slate-400">حاضرین در تماس:</span>
                      {callState.participants.map((p) => (
                        <span key={p.peerId} className="text-slate-200">
                          {p.name} ({p.isMuted ? 'بیصدا' : 'میکروفون باز'})
                        </span>
                      ))}
                    </div>

                    {callState.micAvailable && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">سطح صدا:</span>
                        <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            style={{width: `${callState.micLevel}%`}}
                            className="h-full bg-emerald-500 transition-all duration-75"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {callState.callNotice && (
                  <p className="text-xs text-amber-300">{callState.callNotice}</p>
                )}

                {/* Rubika Real Group Voice Chat Userbot Link Strip */}
                <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span
                        className={
                          userbotStatus?.lastError
                            ? 'text-red-400 font-medium'
                            : userbotStatus?.connected
                              ? 'text-emerald-400 font-medium'
                              : 'text-amber-300'
                        }
                      >
                        {userbotStatus?.connected
                          ? `پل ویسکال روبیکا متصل است (${userbotStatus.accountName || 'Userbot'})${
                              userbotStatus.activeVoiceChatId
                                ? ` · شناسه کال: ${userbotStatus.activeVoiceChatId}`
                                : ''
                            }${
                              userbotStatus.streamingTrack
                                ? ` · استریم: ${userbotStatus.streamingTrack}`
                                : ''
                            }`
                          : 'برای اینکه ربات مستقیماً داخل ویسکال اپلیکیشن روبیکا هم برود و آهنگ بخواند، اکانت Userbot روبیکا را متصل کنید.'}
                      </span>
                      {userbotStatus?.activeChatGuid && (
                        <span dir="ltr" className="text-[11px] font-mono text-slate-400 tabular-nums">
                          ({userbotStatus.activeChatGuid})
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {userbotStatus?.connected && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            if (group.currentTrack) {
                              void onSelectTrack(group.currentTrack, 'play_now');
                            } else if (group.pausedTrack) {
                              void onRunCommand('ادامه آهنگ');
                            } else {
                              void onRunCommand('ساخت کال');
                            }
                          }}
                          className="px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-300 text-xs font-medium whitespace-nowrap cursor-pointer"
                        >
                          {group.currentTrack || group.pausedTrack
                            ? 'ارسال به ویسکال روبیکا'
                            : 'باز کردن کال در روبیکا'}
                        </button>
                      )}
                      {onOpenRubikaTab && (
                        <button
                          type="button"
                          onClick={onOpenRubikaTab}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-medium whitespace-nowrap cursor-pointer"
                        >
                          {userbotStatus?.connected ? 'مدیریت ویسکال روبیکا' : 'ورود با شماره موبایل روبیکا'}
                        </button>
                      )}
                    </div>
                  </div>
                  {userbotStatus?.lastError && (
                    <p className="text-[11px] text-red-400">
                      خطای ویسکال روبیکا: {userbotStatus.lastError}
                    </p>
                  )}
                </div>
              </div>

              {(audioState.audioError || audioState.micError) && (
                <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-center justify-between gap-3">
                  <span>{audioState.audioError || audioState.micError}</span>
                  {audioState.audioError && (
                    <button
                      type="button"
                      onClick={audioState.unlockAudioAndPlay}
                      className="px-2.5 py-1 bg-amber-500 text-slate-950 font-semibold rounded text-xs whitespace-nowrap cursor-pointer"
                    >
                      پخش صدا
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Playback & Volume Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800/80">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onRunCommand('قبلی')}
                  className="px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" />
                  <span>قبلی</span>
                </button>

                {group.isPlaying ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onRunCommand('توقف آهنگ')}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Pause className="w-4 h-4" />
                    <span>توقف و ذخیره</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isBusy || (!group.pausedTrack && !group.currentTrack)}
                    onClick={() => {
                      if (group.pausedTrack) {
                        void onRunCommand('ادامه آهنگ');
                      } else {
                        audioState.unlockAudioAndPlay();
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    <span>ادامه آهنگ</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onRunCommand('بعدی')}
                  className="px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <SkipBack className="w-4 h-4" />
                  <span>بعدی</span>
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onRunCommand('پخش رندوم')}
                  className="px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Shuffle className="w-4 h-4" />
                  <span>پخش رندوم</span>
                </button>

                {onSendTrackToRubika && group.currentTrack && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void onSendTrackToRubika(group.currentTrack!)}
                    className="px-3 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>ارسال به گروه روبیکا</span>
                  </button>
                )}
              </div>

              {/* Volume, Mute / Unmute & Rubika Audio Profile Menu */}
              <div className="flex flex-wrap items-center gap-3">
                <div ref={audioMenuRef} className="relative">
                  <button
                    type="button"
                    aria-expanded={audioMenuOpen}
                    aria-haspopup="menu"
                    onClick={() => setAudioMenuOpen((prev) => !prev)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      audioMenuOpen
                        ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                        : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                    <span>تنظیمات صوتی</span>
                    <span dir="ltr" className="text-[11px] font-mono text-emerald-300">
                      · {activeAudioProfileLabel}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${
                        audioMenuOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {audioMenuOpen && (
                    <div
                      role="menu"
                      aria-label="منوی پروفایل‌های استریم روبیکا"
                      className="absolute left-0 bottom-full mb-2 w-72 rounded-xl bg-[#0B0F17] border border-slate-700/90 shadow-2xl p-2 z-30 space-y-1"
                    >
                      <div className="px-2.5 py-1.5 border-b border-slate-800/90 flex items-center justify-between text-[11px] text-slate-400">
                        <span>پروفایل استریم در روبیکا</span>
                        <span dir="ltr" className="font-mono tabular-nums text-slate-300">
                          {audioSettings.streamBitrateKbps ?? 64} kbps
                        </span>
                      </div>

                      {(
                        ['high_fidelity', 'balance', 'data_saver'] as Array<
                          Exclude<RubikaAudioProfileId, 'custom'>
                        >
                      ).map((pid) => {
                        const meta = RUBIKA_AUDIO_PROFILES[pid];
                        const isSelected = activeAudioProfileId === pid;
                        return (
                          <button
                            key={pid}
                            type="button"
                            role="menuitemradio"
                            aria-checked={isSelected}
                            onClick={() => {
                              onChangeAudioSettings({...meta.settings});
                              setAudioMenuOpen(false);
                            }}
                            className={`w-full text-right px-2.5 py-2 rounded-lg transition-colors cursor-pointer flex items-start justify-between gap-2 ${
                              isSelected
                                ? 'bg-emerald-500/15 text-slate-100'
                                : 'hover:bg-slate-800/70 text-slate-300'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span dir="ltr" className="text-xs font-bold text-slate-100">
                                  {meta.name}
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  · {meta.faTitle}
                                </span>
                              </div>
                              <p
                                dir="ltr"
                                className="text-[10px] font-mono tabular-nums text-slate-400 mt-0.5"
                              >
                                {(meta.settings.sampleRate / 1000).toFixed(1)} kHz ·{' '}
                                {meta.settings.streamBitrateKbps} kbps ·{' '}
                                {meta.settings.channels === 'mono' ? 'Mono' : 'Stereo'}
                              </p>
                            </div>
                            {isSelected && (
                              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            )}
                          </button>
                        );
                      })}

                      <div className="pt-1 border-t border-slate-800/90">
                        <button
                          type="button"
                          onClick={() => {
                            setAudioMenuOpen(false);
                            document
                              .getElementById('vc-advanced-audio-menu')
                              ?.scrollIntoView({behavior: 'smooth', block: 'center'});
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-emerald-400 hover:bg-slate-800/60 flex items-center justify-between cursor-pointer"
                        >
                          <span>تنظیمات دقیق (بیت‌ریت، بافر و DSP)</span>
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onRunCommand(group.isMuted ? 'باصدا' : 'بیصدا')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 border whitespace-nowrap cursor-pointer ${
                    group.isMuted
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                      : 'bg-slate-800/80 text-slate-200 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  {group.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  <span>{group.isMuted ? 'باصدا کن' : 'بیصدا'}</span>
                </button>

                <div className="flex items-center gap-2 min-w-[140px]">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={displayedVolume}
                    onChange={(e) => setVolumeDraft(Number(e.target.value))}
                    onMouseUp={() => {
                      if (volumeDraft !== null) {
                        void onRunCommand(`تنظیم صدا ${volumeDraft}`);
                        setVolumeDraft(null);
                      }
                    }}
                    onTouchEnd={() => {
                      if (volumeDraft !== null) {
                        void onRunCommand(`تنظیم صدا ${volumeDraft}`);
                        setVolumeDraft(null);
                      }
                    }}
                    aria-label="تنظیم صدا"
                    className="w-24 accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <span className="font-mono tabular-nums text-xs text-slate-300 w-9 text-left">
                    {displayedVolume}%
                  </span>
                </div>
              </div>
            </div>

            {/* Compact Up-Next Queue Track Card */}
            {(() => {
              const nextTrack = group.queue[0] || null;
              return (
                <div className="bg-[#0B0F17] border border-slate-800/90 rounded-lg px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {nextTrack?.artworkUrl ? (
                      <img
                        src={nextTrack.artworkUrl}
                        alt={nextTrack.title}
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 rounded-md object-cover border border-slate-700/80 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-md bg-slate-800/80 border border-slate-700/60 flex items-center justify-center shrink-0">
                        <Disc3 className="w-5 h-5 text-slate-400" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span className="text-emerald-400 font-medium">آهنگ بعدی در صف</span>
                        {group.queue.length > 0 && (
                          <span className="font-mono tabular-nums text-slate-500">
                            · {group.queue.length} در انتظار
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-slate-100 truncate mt-0.5">
                        {nextTrack ? nextTrack.title : 'صف پخش در حال حاضر خالی است'}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {nextTrack
                          ? `${nextTrack.artist}${nextTrack.durationSec ? ` · ${formatSec(nextTrack.durationSec)}` : ''}`
                          : 'از بخش جستجو یا آرشیو، آهنگ جدیدی به صف اضافه کنید'}
                      </p>
                    </div>
                  </div>

                  {nextTrack && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void onRunCommand('بعدی')}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      <SkipBack className="w-3.5 h-3.5" />
                      <span>پخش بعدی</span>
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* Live Track Remaining Time & Click-to-Seek Progress Bar Widget */}
      <LiveTrackProgressWidget
        currentTrack={group.currentTrack}
        pausedTrack={group.pausedTrack}
        isPlaying={group.isPlaying}
        isMuted={group.isMuted}
        isBuffering={audioState.isBuffering}
        currentTime={audioState.currentTime}
        duration={audioState.duration}
        onSeekTo={audioState.seekTo}
        onTogglePlayPause={() => {
          if (group.isPlaying) {
            void onRunCommand('توقف آهنگ');
          } else if (group.pausedTrack) {
            void onRunCommand('ادامه آهنگ');
          } else {
            audioState.unlockAudioAndPlay();
          }
        }}
      />

      {/* Local Admin Headphone Cue / Audio Preview Widget */}
      <HeadphonePreviewWidget
        queue={group.queue}
        currentTrack={group.currentTrack}
        pausedTrack={group.pausedTrack}
        isBusy={isBusy}
        previewState={headphonePreview}
        onBroadcastToCall={async (track) => {
          await onSelectTrack(track, 'play_now');
        }}
      />

      {/* Dynamic 60fps Audio Visualizer (Waveform & FFT Frequency Spectrum) */}
      <AudioVisualizerPanel
        isPlaying={group.isPlaying}
        isMuted={group.isMuted}
        micActive={audioState.micActive}
        trackTitle={group.currentTrack?.title}
        actualSampleRate={audioState.engineTelemetry.actualSampleRate}
        baseLatencyMs={audioState.engineTelemetry.baseLatencyMs}
        getVisualizerFrame={audioState.getVisualizerFrame}
      />

      {/* Advanced Sample Rate, Bitrate & Rubika Audio Profile Menu */}
      <AudioLatencySettingsPanel
        settings={audioSettings}
        telemetry={audioState.engineTelemetry}
        rubikaConnected={Boolean(userbotStatus?.connected)}
        onChangeSettings={onChangeAudioSettings}
      />

      {/* Automatic Voice Call Recording & Session Download Links */}
      <VoiceCallRecorderPanel
        group={group}
        isBusy={isBusy}
        recorderState={recorderState}
        onToggleAutoRecord={onToggleAutoRecord}
        onDeleteRecording={onDeleteRecording}
      />

      {/* Custom 1-Click Voice Chat Command Shortcuts Panel */}
      <CommandShortcutsPanel
        shortcuts={shortcuts}
        isBusy={isBusy}
        onRunShortcut={onRunShortcut}
        onAddShortcut={onAddShortcut}
        onDeleteShortcut={onDeleteShortcut}
      />

      {/* Online Trending Rubika Songs Suggestions */}
      {(trendingError || trendingResult) && (
        <section className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              <h3 className="text-base font-semibold text-slate-100">
                پیشنهاد آنلاین محبوب‌ترین آهنگ‌های روز روبیکا
              </h3>
              {trendingResult && (
                <span className="text-xs text-slate-400 font-mono tabular-nums">
                  · {trendingResult.suggestions.length} آهنگ ·{' '}
                  {new Date(trendingResult.searchedAt).toLocaleTimeString('fa-IR')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {trendingResult && trendingResult.suggestions.length > 0 && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    void onApplySmartPlaylist({
                      name: 'محبوب‌ترین‌های روز روبیکا',
                      moods: ['شاد', 'پاپ'],
                      count: trendingResult.suggestions.length,
                      balanceMode: 'interleaved',
                      startMode: 'replace_and_play',
                      savePreset: false,
                      customTracks: trendingResult.suggestions.map((s) => s.track),
                    })
                  }
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>پخش متوالی همه در ویسکال</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setTrendingResult(null);
                  setTrendingError(null);
                }}
                className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>

          {trendingError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
              {trendingError}
            </div>
          )}

          {trendingResult?.notice && (
            <p className="text-xs text-amber-400">{trendingResult.notice}</p>
          )}

          {trendingResult && trendingResult.suggestions.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {trendingResult.suggestions.map((item) => (
                <div
                  key={`${item.track.id}_${item.rank}`}
                  className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono tabular-nums text-xs font-bold text-emerald-400 w-5 shrink-0">
                      #{item.rank}
                    </span>
                    {item.track.artworkUrl ? (
                      <img
                        src={item.track.artworkUrl}
                        alt={item.track.title}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded object-cover shrink-0 border border-slate-800"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center shrink-0">
                        <Disc3 className="w-4 h-4 text-slate-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-100 truncate">
                        {item.track.title}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {item.track.artist}
                        {item.reason ? ` · ${item.reason}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onSelectTrack(item.track, 'play_now')}
                      className="p-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                      title="پخش فوری در ویسکال"
                      aria-label="پخش فوری"
                    >
                      <Zap className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onSelectTrack(item.track, 'queue')}
                      className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                      title="افزودن به صف"
                      aria-label="افزودن به صف"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {trendingResult && trendingResult.sources.length > 0 && (
            <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
              <span>منابع جستجوی آنلاین:</span>
              {trendingResult.sources.map((src, i) => (
                <a
                  key={`${src.uri}_${i}`}
                  href={src.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <span className="truncate max-w-[200px]">{src.title}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Exact Start & End Time Scheduler for Queue Tracks */}
      <TrackSchedulerPanel
        group={group}
        isBusy={isBusy}
        onAddSchedule={onAddTrackSchedule}
        onToggleSchedule={onToggleTrackSchedule}
        onDeleteSchedule={onDeleteTrackSchedule}
      />

      {/* Auto-Shutdown Schedule Card */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              تایمر قطع خودکار ویسکال (خاموشی ربات در ساعت مشخص)
            </h3>
            {group.autoShutdown?.enabled && countdownText && (
              <span className="text-xs font-mono tabular-nums text-emerald-400">
                · فعال ({group.autoShutdown.targetTime} · باقیمانده {countdownText})
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            با رسیدن به ساعت تعیین‌شده، پخش موسیقی و ویس‌چت گروه به صورت خودکار قطع می‌شود (یا با دستور «تنظیم خاموشی 23:30» در چت گروه).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            {[
              {label: '+۳۰ دقیقه', mins: 30},
              {label: '+۱ ساعت', mins: 60},
              {label: '+۲ ساعت', mins: 120},
            ].map((p) => (
              <button
                key={p.mins}
                type="button"
                onClick={() => setOffsetMinutes(p.mins)}
                className="px-2.5 py-1.5 rounded bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 whitespace-nowrap cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>

          <input
            type="time"
            dir="ltr"
            value={shutdownTime}
            onChange={(e) => setShutdownTime(e.target.value)}
            aria-label="ساعت خاموشی خودکار"
            className="bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-1.5 text-sm font-mono text-slate-100 outline-none"
          />

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={stopPollingAlso}
              onChange={(e) => setStopPollingAlso(e.target.checked)}
              className="accent-emerald-500 rounded cursor-pointer"
            />
            <span>خاموشی کامل ربات</span>
          </label>

          <button
            type="button"
            disabled={isBusy || !shutdownTime}
            onClick={() =>
              onSetAutoShutdown({
                enabled: true,
                targetTime: shutdownTime,
                stopPollingAlso,
              })
            }
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium whitespace-nowrap cursor-pointer"
          >
            {group.autoShutdown?.enabled ? 'بروزرسانی ساعت خاموشی' : 'تنظیم خاموشی خودکار'}
          </button>

          {group.autoShutdown?.enabled && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                onSetAutoShutdown({
                  enabled: false,
                  targetTime: shutdownTime,
                  stopPollingAlso,
                })
              }
              className="px-3 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 text-xs font-medium whitespace-nowrap cursor-pointer"
            >
              لغو تایمر
            </button>
          )}
        </div>
      </section>

      {/* Smart Online Music Search (Web Sources + 1-Click Queue / Playlist) */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <h3 className="text-base font-semibold text-slate-100">
                جستجوی هوشمند آنلاین آهنگ در ویسکال
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              مستقیماً بر اساس نام، حس‌وحال، سبک یا خواننده از منابع آنلاین جستجو کنید و با یک کلیک به صف پخش ویسکال یا پلی‌لیست دلخواه اضافه نمایید.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {['شایان یو جدید', 'آهنگ شاد عروسی', 'آهنگ شبانه آرام', 'پلی‌لیست لری'].map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={smartLoading}
                onClick={() => {
                  setSmartQuery(preset);
                  void handleSmartOnlineSearch(preset);
                }}
                className="px-2.5 py-1 rounded bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 whitespace-nowrap cursor-pointer"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSmartOnlineSearch();
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <div className="relative flex-1 min-w-[220px]">
            <Sparkles className="w-4 h-4 text-emerald-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={smartQuery}
              onChange={(e) => setSmartQuery(e.target.value)}
              placeholder="مثلاً: آهنگ جدید شایان یو، آهنگ آرام برای آخر شب، یا رپ فارسی..."
              className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg pr-9 pl-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={smartLoading || !smartQuery.trim()}
            className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${smartLoading ? 'animate-spin' : ''}`} />
            <span>{smartLoading ? 'در حال جستجو...' : 'جستجوی هوشمند آنلاین'}</span>
          </button>
        </form>

        {/* Destination Playlist Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 text-xs">
          {(group.customPlaylists || []).length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400">پلی‌لیست مقصد برای افزودن یک‌کلیکی:</span>
              <select
                value={
                  (group.customPlaylists || []).some((p) => p.id === smartPlaylistTargetId)
                    ? smartPlaylistTargetId
                    : group.customPlaylists?.[0]?.id || ''
                }
                onChange={(e) => setSmartPlaylistTargetId(e.target.value)}
                className="bg-[#111827] border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 outline-none"
              >
                {(group.customPlaylists || []).map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name} ({pl.tracks.length} آهنگ)
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span className="text-slate-400">
              هنوز پلی‌لیست سفارشی نساخته‌اید — همین‌جا یک نام بنویسید و بسازید:
            </span>
          )}

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newSmartPlaylistName}
              onChange={(e) => setNewSmartPlaylistName(e.target.value)}
              placeholder="ساخت سریع پلی‌لیست..."
              className="bg-[#111827] border border-slate-800 focus:border-emerald-500 rounded px-2.5 py-1 text-xs text-slate-100 placeholder:text-slate-500 outline-none w-44"
            />
            <button
              type="button"
              disabled={isBusy || !newSmartPlaylistName.trim()}
              onClick={async () => {
                const name = newSmartPlaylistName.trim();
                if (!name) return;
                await onCreateCustomPlaylist(name);
                setNewSmartPlaylistName('');
              }}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-emerald-600 disabled:opacity-40 text-slate-100 text-xs font-medium whitespace-nowrap cursor-pointer"
            >
              + ساخت
            </button>
          </div>
        </div>

        {smartError && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
            {smartError}
          </div>
        )}

        {smartSearchResult && smartSearchResult.suggestions.length > 0 && (
          <div className="space-y-3">
            {smartSearchResult.notice && (
              <p className="text-[11px] text-slate-400">{smartSearchResult.notice}</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto">
              {smartSearchResult.suggestions.map((item) => {
                const targetPlaylistId =
                  (group.customPlaylists || []).find((p) => p.id === smartPlaylistTargetId)?.id ||
                  group.customPlaylists?.[0]?.id;
                const isCueing =
                  headphonePreview.previewTrack?.id === item.track.id && headphonePreview.isPlaying;
                return (
                  <div
                    key={`${item.track.id}_${item.rank}`}
                    className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.track.artworkUrl ? (
                        <img
                          src={item.track.artworkUrl}
                          alt={item.track.title}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded object-cover shrink-0 border border-slate-800"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center shrink-0">
                          <Disc3 className="w-4 h-4 text-slate-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-100 truncate">
                          {item.track.title}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {item.track.artist}
                          {item.reason ? ` · ${item.reason}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => headphonePreview.previewCueTrack(item.track)}
                        className={`p-1.5 rounded border text-xs cursor-pointer ${
                          isCueing
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                            : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                        }`}
                        title="پیشنمایش در هدفون"
                        aria-label={`پیشنمایش ${item.track.title}`}
                      >
                        <Headphones className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void onSelectTrack(item.track, 'play_now')}
                        className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                        title="پخش فوری در ویسکال"
                        aria-label={`پخش فوری ${item.track.title}`}
                      >
                        <Zap className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void onSelectTrack(item.track, 'queue')}
                        className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium whitespace-nowrap cursor-pointer"
                        title="افزودن به صف پخش"
                      >
                        + صف
                      </button>
                      {targetPlaylistId && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void onAddTrackToCustomPlaylist(targetPlaylistId, {track: item.track})
                          }
                          className="px-2 py-1.5 rounded bg-slate-800 hover:bg-emerald-600/30 border border-slate-700 text-emerald-300 text-[11px] font-medium whitespace-nowrap cursor-pointer"
                          title="افزودن به پلی‌لیست انتخاب‌شده"
                        >
                          + پلی‌لیست
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {smartSearchResult.sources.length > 0 && (
              <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                <span>منابع آنلاین:</span>
                {smartSearchResult.sources.map((src, i) => (
                  <a
                    key={`${src.uri}_${i}`}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <span className="truncate max-w-[180px]">{src.title}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Real Music Search & Direct Link Player */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-100">جستجوی واقعی آهنگ</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                معادل دستور «آهنگ &#123;نام موسیقی&#125;» با دریافت جریان صوتی واقعی
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {['آهنگ لری', 'شادمهر عقیلی', 'محسن چاوشی', 'هایده'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setSearchQuery(preset);
                    void handleMusicSearch(preset);
                  }}
                  className="px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-300 whitespace-nowrap cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleMusicSearch();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="نام آهنگ یا خواننده را بنویسید (مثلاً: آهنگ لری)..."
                className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg pr-9 pl-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={searching || !searchQuery.trim()}
              className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium whitespace-nowrap cursor-pointer"
            >
              {searching ? 'در حال جستجو...' : 'جستجو'}
            </button>
          </form>

          {searchNotice && <p className="text-xs text-amber-400">{searchNotice}</p>}

          {searchResults.length > 0 ? (
            <div className="space-y-2">
              {(group.customPlaylists || []).length > 0 && (
                <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs">
                  <span className="text-slate-400">افزودن سریع نتایج جستجو به پلی‌لیست:</span>
                  <select
                    value={
                      (group.customPlaylists || []).some((p) => p.id === quickPlaylistId)
                        ? quickPlaylistId
                        : group.customPlaylists?.[0]?.id || ''
                    }
                    onChange={(e) => setQuickPlaylistId(e.target.value)}
                    className="bg-[#111827] border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 outline-none"
                  >
                    {(group.customPlaylists || []).map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="divide-y divide-slate-800/80 max-h-[340px] overflow-y-auto">
                {searchResults.map((track) => (
                  <div
                    key={track.id}
                    className="py-2.5 flex items-center justify-between gap-3 hover:bg-slate-800/30 px-2 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {track.artworkUrl ? (
                        <img
                          src={track.artworkUrl}
                          alt={track.title}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded object-cover shrink-0 border border-slate-800"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center shrink-0">
                          <Disc3 className="w-5 h-5 text-slate-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate">{track.title}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {track.artist} · <span className="font-mono tabular-nums">{formatSec(track.durationSec)}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => headphonePreview.previewCueTrack(track)}
                        title="پیشنمایش محلی در هدفون مدیر"
                        aria-label={`پیشنمایش هدفون ${track.title}`}
                        className={`p-1.5 rounded border text-xs flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${
                          headphonePreview.previewTrack?.id === track.id && headphonePreview.isPlaying
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                            : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300'
                        }`}
                      >
                        <Headphones className="w-3.5 h-3.5" />
                      </button>
                      {(group.customPlaylists || []).length > 0 && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            const targetId =
                              (group.customPlaylists || []).find((p) => p.id === quickPlaylistId)
                                ?.id || group.customPlaylists?.[0]?.id;
                            if (targetId) {
                              void onAddTrackToCustomPlaylist(targetId, {track});
                            }
                          }}
                          title="افزودن به پلی‌لیست انتخاب‌شده"
                          className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 text-xs font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer"
                        >
                          <ListMusic className="w-3.5 h-3.5" />
                          <span>پلی‌لیست</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelectTrack(track, 'play_now')}
                        className="px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>پخش فوری</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectTrack(track, 'queue')}
                        className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>به صف</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center border border-dashed border-slate-800 rounded-lg">
              <p className="text-sm text-slate-400">
                برای دریافت فایل‌های صوتی قابل پخش در ویسکال، نام یک موسیقی را جستجو کنید.
              </p>
            </div>
          )}
        </div>

        {/* Direct Link Streaming */}
        <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-slate-100">پخش از لینک مستقیم صوتی</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                پشتیبانی از «پخش ویسکال &#123;لینک&#125;»، «پخش فوری» و «اضافه به صف»
              </p>
            </div>

            <div className="relative">
              <Link2 className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="url"
                dir="ltr"
                value={directUrl}
                onChange={(e) => setDirectUrl(e.target.value)}
                placeholder="https://example.com/song.mp3"
                className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg pr-9 pl-3 py-2.5 text-sm font-mono text-slate-100 placeholder:text-slate-600 outline-none text-left"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={isBusy || !directUrl.trim()}
                onClick={() => handleDirectAction('play')}
                className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium whitespace-nowrap cursor-pointer"
              >
                پخش ویسکال
              </button>
              <button
                type="button"
                disabled={isBusy || !directUrl.trim()}
                onClick={() => handleDirectAction('instant')}
                className="py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                پخش فوری
              </button>
              <button
                type="button"
                disabled={isBusy || !directUrl.trim()}
                onClick={() => handleDirectAction('queue')}
                className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-medium whitespace-nowrap cursor-pointer"
              >
                اضافه به صف
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 text-xs text-slate-400 space-y-1.5">
            <p className="text-slate-300 font-medium">نکته فنی پخش زنده ویسکال:</p>
            <p>
              تمامی جریان‌های صوتی از مسیر پراکسی سرور داخلی ربات عبور می‌کنند تا کنترل دقیق ولوم، حالت بی‌صدا با تداوم پخش و تحلیل فرکانس بدون خطای CORS انجام شود.
            </p>
          </div>
        </div>
      </section>

      {/* Queue & History Tables */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Queue */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ListMusic className="w-4 h-4 text-emerald-400" />
              <h3 className="text-base font-semibold text-slate-100">صف پخش گروه</h3>
              <span className="text-xs text-slate-400 font-mono tabular-nums">({group.queue.length})</span>
            </div>
            <button
              type="button"
              disabled={isBusy || group.queue.length === 0}
              onClick={() => onRunCommand('پاک کردن صف')}
              className="px-2.5 py-1.5 rounded bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 text-red-400 text-xs font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>پاک کردن صف</span>
            </button>
          </div>

          {group.queue.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-slate-800 rounded-lg text-xs text-slate-400">
              صف پخش خالی است. از بخش جستجو یا دستور «اضافه به صف» آهنگ اضافه کنید.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {group.queue.map((item, index) => {
                const isCueingThis =
                  headphonePreview.previewTrack?.id === item.id && headphonePreview.isPlaying;
                return (
                  <div key={`${item.id}_${index}`} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono tabular-nums text-xs text-slate-500 w-5">{index + 1}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate">{item.title}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {item.artist} · درخواست: {item.requestedBy}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => headphonePreview.previewCueTrack(item)}
                        className={`px-2.5 py-1 rounded border text-xs font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${
                          isCueingThis
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                            : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-200'
                        }`}
                      >
                        <Headphones className="w-3.5 h-3.5" />
                        <span>{isCueingThis ? 'توقف پیشنمایش' : 'پیشنمایش'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onRunCommand(`حذف از صف ${index + 1}`)}
                        className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/15 whitespace-nowrap cursor-pointer"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* History (last 5) */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-slate-400" />
              <h3 className="text-base font-semibold text-slate-100">تاریخچه آهنگ‌ها (۵ مورد آخر)</h3>
            </div>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onRunCommand('تاریخچه آهنگها')}
              className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium whitespace-nowrap cursor-pointer"
            >
              ارسال در چت گروه
            </button>
          </div>

          {group.history.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-slate-800 rounded-lg text-xs text-slate-400">
              هنوز آهنگی به پایان نرسیده یا تعویض نشده است.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {group.history
                .slice(-5)
                .reverse()
                .map((item, idx) => (
                  <div key={`${item.id}_hist_${idx}`} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">{item.title}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {item.artist} · {new Date(item.requestedAt).toLocaleTimeString('fa-IR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => headphonePreview.previewCueTrack(item)}
                        title="پیشنمایش محلی در هدفون"
                        aria-label={`پیشنمایش هدفون ${item.title}`}
                        className={`p-1.5 rounded border text-xs flex items-center whitespace-nowrap cursor-pointer transition-colors ${
                          headphonePreview.previewTrack?.id === item.id && headphonePreview.isPlaying
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                            : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300'
                        }`}
                      >
                        <Headphones className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectTrack(item, 'play_now')}
                        className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white text-xs font-medium whitespace-nowrap cursor-pointer"
                      >
                        پخش مجدد
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </section>

      {/* Custom User Playlists (Create, View, Add via Search/Link/Chat, Play, Rename, Delete) */}
      <CustomPlaylistsPanel
        group={group}
        isBusy={isBusy}
        previewState={headphonePreview}
        onCreatePlaylist={onCreateCustomPlaylist}
        onRenamePlaylist={onRenameCustomPlaylist}
        onDeletePlaylist={onDeleteCustomPlaylist}
        onAddTrack={onAddTrackToCustomPlaylist}
        onRemoveTrack={onRemoveTrackFromCustomPlaylist}
        onPlayPlaylist={onPlayCustomPlaylist}
        onSelectTrack={onSelectTrack}
      />

      {/* Smart Multi-Genre & Adaptive Playlist Builder */}
      <SmartPlaylistBuilder
        group={group}
        isBusy={isBusy}
        onApplySmartPlaylist={onApplySmartPlaylist}
        onSaveSmartPlaylistRule={onSaveSmartPlaylistRule}
        onDeletePreset={onDeletePreset}
      />

      {/* 1,000+ Categorized Music Archive (شاد / غمگین / پاپ / سنتی / محلی) */}
      <MusicCatalogPanel
        isBusy={isBusy}
        onSelectTrack={onSelectTrack}
        onRunCommand={onRunCommand}
        onEnqueueMood={onEnqueueMood}
      />
    </div>
  );
};
