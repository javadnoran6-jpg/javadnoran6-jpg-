export type UserRole = 'creator' | 'owner' | 'admin' | 'vip' | 'member';

export type MusicMood =
  | 'شاد'
  | 'غمگین'
  | 'محلی و لری'
  | 'سنتی'
  | 'پاپ'
  | 'نوستالژی'
  | 'آرام';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationSec: number;
  streamUrl: string;
  sourceUrl?: string;
  artworkUrl?: string;
  source: 'itunes' | 'deezer' | 'direct' | 'reply';
  mood?: MusicMood;
  requestedBy: string;
  requestedAt: string;
}

export interface GroupMember {
  userId: string;
  name: string;
  username?: string;
  role: UserRole;
  joinedAt: string;
}

export interface GroupSubscription {
  planName: string;
  purchasedAt: string;
  expiresAt: string;
  isActive: boolean;
}

export interface ChatMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  isBot: boolean;
  isSystemEvent?: boolean;
  replyToMessageId?: string;
  replySenderName?: string;
  replyPreview?: string;
  audioAttachment?: {
    title: string;
    artist?: string;
    url: string;
    durationSec?: number;
  };
  deliveredToRubika?: boolean;
  rubikaMessageId?: string;
  timestamp: string;
}

export interface AutoShutdownConfig {
  enabled: boolean;
  targetTime: string;
  timezoneOffsetMinutes: number;
  stopPollingAlso: boolean;
  nextTriggerIso: string | null;
  lastTriggeredAt?: string | null;
}

export type SmartPlaylistAdaptMode = 'manual' | 'vc_popularity' | 'time_slot';

export type SmartPlaylistTimeSlot = 'auto_now' | 'morning' | 'afternoon' | 'evening' | 'night';

export interface SmartPlaylistRule {
  enabled: boolean;
  mode: SmartPlaylistAdaptMode;
  timeSlot: SmartPlaylistTimeSlot;
  moods: MusicMood[];
  trackCount: number;
  balanceMode: 'interleaved' | 'shuffled';
  timezoneOffsetMinutes?: number;
  lastAdaptedAt?: string | null;
  lastSlotApplied?: string | null;
  lastEventCount?: number;
  lastReason?: string | null;
}

export interface SmartPlaylistPreset {
  id: string;
  name: string;
  moods: MusicMood[];
  trackCount: number;
  balanceMode: 'interleaved' | 'shuffled';
  adaptMode?: SmartPlaylistAdaptMode;
  timeSlot?: SmartPlaylistTimeSlot;
  createdAt: string;
}

export interface CustomPlaylist {
  id: string;
  name: string;
  createdBy: string;
  createdById: string;
  tracks: Track[];
  createdAt: string;
  updatedAt: string;
}

export interface PlaybackAnalyticsEvent {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  mood?: MusicMood;
  source: Track['source'];
  requestedBy: string;
  timestamp: string;
}

export interface HourlyAnalyticsBucket {
  hour: number;
  label: string;
  tracksPlayed: number;
  commandsCount: number;
  totalActivity: number;
}

export interface GroupAnalyticsResponse {
  groupId: string;
  groupTitle: string;
  tzOffsetMinutes: number;
  hourly: HourlyAnalyticsBucket[];
  summary: {
    totalTracksPlayed: number;
    totalCommands: number;
    peakHour: HourlyAnalyticsBucket | null;
    activeHoursCount: number;
    avgPerActiveHour: number;
  };
  moodBreakdown: Array<{mood: string; count: number}>;
  recentPlays: PlaybackAnalyticsEvent[];
}

export type RubikaAudioProfileId = 'high_fidelity' | 'balance' | 'data_saver' | 'custom';

export interface AudioEngineSettings {
  profile?: RubikaAudioProfileId;
  streamBitrateKbps?: 32 | 64 | 96 | 128 | 192;
  channels?: 'stereo' | 'mono';
  volumeNormalization?: boolean;
  sampleRate: 16000 | 24000 | 32000 | 44100 | 48000;
  latencyHint: 'interactive' | 'balanced' | 'playback';
  bufferSize: 256 | 512 | 1024 | 2048 | 4096;
  fftSize: 64 | 128 | 256 | 512;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export interface TrackScheduleItem {
  id: string;
  track: Track;
  startTime: string;
  endTime: string;
  timezoneOffsetMinutes: number;
  startTriggerIso: string;
  endTriggerIso: string | null;
  endAction: 'stop_playback' | 'next_in_queue' | 'stop_call';
  status: 'pending' | 'active' | 'completed';
  enabled: boolean;
  createdAt: string;
  lastStartedAt?: string | null;
  lastEndedAt?: string | null;
}

export interface VoiceCallRecording {
  id: string;
  groupId: string;
  filename: string;
  downloadUrl: string;
  mimeType: string;
  durationSec: number;
  sizeBytes: number;
  startedAt: string;
  endedAt: string;
  tracksLabel?: string;
}

export interface GroupModerationLocks {
  antiLink?: boolean;
  antiForward?: boolean;
  antiSpam?: boolean;
  lockChat?: boolean;
  autoDeleteFiltered?: boolean;
}

export interface GroupViolationLog {
  id: string;
  userId: string;
  userName: string;
  reason: string;
  actionTaken: string;
  messagePreview?: string;
  timestamp: string;
}

export interface GroupState {
  groupId: string;
  title: string;
  rubikaChatId: string;
  chatType?: 'group' | 'channel' | 'dm';
  channelUsername?: string;
  inviteLink?: string;
  ownerId: string;
  ownerName: string;
  publicAccess: 'open' | 'locked';
  voiceCallActive: boolean;
  voiceCallId?: string;
  voiceCallStartedAt?: string;
  volume: number;
  isMuted: boolean;
  isPlaying: boolean;
  currentTrack: Track | null;
  pausedTrack: Track | null;
  pausedPositionSec: number;
  queue: Track[];
  history: Track[];
  playbackEvents?: PlaybackAnalyticsEvent[];
  members: GroupMember[];
  subscription: GroupSubscription;
  autoShutdown?: AutoShutdownConfig;
  trackSchedules?: TrackScheduleItem[];
  callRecordings?: VoiceCallRecording[];
  autoRecordVoiceCall?: boolean;
  activeKeypadMenu?: 'main' | 'help';
  dailyPlayDate?: string;
  dailyPlayCount?: number;
  dailyPlayLimit?: number;
  mutedUserIds?: string[];
  warnings?: Record<string, number>;
  filteredWords?: string[];
  locks?: GroupModerationLocks;
  violationLogs?: GroupViolationLog[];
  savedPlaylists?: SmartPlaylistPreset[];
  customPlaylists?: CustomPlaylist[];
  smartPlaylistRule?: SmartPlaylistRule;
  messages: ChatMessage[];
}

export interface RubikaApiLog {
  id: string;
  timestamp: string;
  method: string;
  status: 'ok' | 'error' | 'info';
  detail: string;
}

export interface QuickCommandShortcut {
  id: string;
  label: string;
  commandText: string;
  accent: 'emerald' | 'amber' | 'slate' | 'rose';
  sendToRubika: boolean;
  createdAt: string;
}

export interface VoiceCallTask {
  id: string;
  action:
    | 'start_call'
    | 'play_in_vc'
    | 'stop_vc'
    | 'pause_vc'
    | 'resume_vc'
    | 'mute_vc'
    | 'unmute_vc'
    | 'set_volume'
    | 'set_audio_profile'
    | 'delete_messages'
    | 'delete_single_message'
    | 'ban_member'
    | 'unban_member'
    | 'pin_message'
    | 'unpin_message'
    | 'set_group_locks'
    | 'set_group_admin'
    | 'sync_group_members'
    | 'join_target'
    | 'send_audio_in_chat'
    | 'send_text_message'
    | 'resolve_creator_username';
  groupId: string;
  rubikaChatId: string;
  trackTitle?: string;
  trackArtist?: string;
  streamUrl?: string;
  volume?: number;
  deleteCount?: number;
  targetUserId?: string;
  targetName?: string;
  messageId?: string;
  messageText?: string;
  creatorUsername?: string;
  lockChat?: boolean;
  inviteTarget?: string;
  adminAction?: 'SetAdmin' | 'UnsetAdmin';
  audioProfile?: AudioEngineSettings;
  createdAt: string;
}

export interface UserbotBridgeStatus {
  connected: boolean;
  sessionName?: string;
  accountName?: string;
  activeVoiceChatId?: string;
  activeChatGuid?: string;
  streamingTrack?: string;
  participantCount?: number;
  lastHeartbeatAt?: string;
  lastError?: string;
  availableGroups?: Array<{
    chatGuid: string;
    title: string;
    chatType?: 'group' | 'channel';
    username?: string;
  }>;
}

export interface BotConfigState {
  token: string;
  creatorId: string;
  creatorName: string;
  creatorUsername?: string;
  creatorRubikaGuid?: string;
  botUsername: string;
  botName: string;
  botEnabled?: boolean;
  globalDailyPlayLimit?: number;
  sudoUserIds?: string[];
  publicBaseUrl?: string;
  pollingActive: boolean;
  rubikaOffsetId?: string;
  autoSyncAudioToRubika?: boolean;
  rubikaAudioProfile?: AudioEngineSettings;
  quickShortcuts?: QuickCommandShortcut[];
  pendingJoinTargets?: string[];
  userbotStatus?: UserbotBridgeStatus;
  lastVerifyResult: {
    verified: boolean;
    checkedAt?: string;
    botInfo?: Record<string, unknown>;
    error?: string;
  };
  rubikaMode: 'bot_api_v3' | 'userbot_rubpy';
  activeGroupId: string;
  groups: Record<string, GroupState>;
  apiLogs: RubikaApiLog[];
}

export interface ExportFileEntry {
  path: string;
  language: 'python' | 'yaml' | 'ini' | 'markdown' | 'text';
  title: string;
  description: string;
  content: string;
}
