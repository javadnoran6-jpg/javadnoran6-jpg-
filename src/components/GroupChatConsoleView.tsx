import React, {useEffect, useRef, useState} from 'react';
import {
  Check,
  CheckCheck,
  Copy,
  CornerDownLeft,
  Download,
  Headphones,
  LayoutGrid,
  Mic,
  MicOff,
  Music2,
  Paperclip,
  Pause,
  PhoneCall,
  PhoneOff,
  Play,
  Plus,
  Reply,
  Send,
  SkipBack,
  Square,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {CallParticipantInfo} from '../hooks/useWebRTCCall';
import {ChatMessage, GroupState, Track, UserRole, UserbotBridgeStatus} from '../types/bot';

interface GroupChatConsoleViewProps {
  group: GroupState;
  creatorId: string;
  isBusy: boolean;
  pollingActive?: boolean;
  userbotStatus?: UserbotBridgeStatus;
  onOpenRubikaTab?: () => void;
  onJoinVoiceCall?: () => Promise<void>;
  audioState: {
    currentTime: number;
    duration: number;
    frequencyBars: number[];
    audioError: string | null;
    unlockAudioAndPlay: () => void;
    primeAudio: () => void;
  };
  callState: {
    callStatus: 'idle' | 'ringing' | 'connected';
    participants: CallParticipantInfo[];
    micEnabled: boolean;
    micAvailable: boolean;
    micLevel: number;
    callSeconds: number;
    inviteUrl: string;
    joinCall: () => Promise<void>;
    leaveCall: (playTone?: boolean) => void;
    toggleCallMic: () => void;
  };
  onExecuteCommand: (payload: {
    senderId: string;
    text: string;
    replyToMessageId?: string;
    replyToSenderId?: string;
    replyToAudioUrl?: string;
    sendToRubika?: boolean;
  }) => Promise<void>;
  onSelectTrack: (track: Track, mode: 'play_now' | 'queue') => Promise<void>;
  onSendVoiceNote: (payload: {
    senderId: string;
    mimeType: string;
    audioBase64: string;
    durationSec: number;
    title?: string;
  }) => Promise<void>;
  onAddTrackToPlaylist?: (
    playlistId: string,
    payload: {track: Track},
  ) => Promise<void>;
}

const ROLE_BADGE_TEXT: Record<UserRole, string> = {
  creator: 'سازنده ربات',
  owner: 'مالک گروه',
  admin: 'ادمین',
  vip: 'ویژه',
  member: 'عادی',
};

const HELP_KEYPAD_ROWS: Array<Array<{label: string; cmd: string; fullWidth?: boolean}>> = [
  [
    {label: 'قفل‌ها 🔒', cmd: 'قفل‌ها 🔒'},
    {label: 'مدیران 🛡️', cmd: 'مدیران 🛡️'},
    {label: 'نصب 📦', cmd: 'نصب 📦'},
  ],
  [
    {label: 'سکوت 🔇', cmd: 'سکوت 🔇'},
    {label: 'اخطار ⚠️', cmd: 'اخطار ⚠️'},
    {label: 'تخلفات 🚨', cmd: 'تخلفات 🚨'},
  ],
  [
    {label: 'آمار 📊', cmd: 'آمار 📊'},
    {label: 'پاکسازی 🧹', cmd: 'پاکسازی 🧹'},
    {label: 'Kill ⚔️', cmd: 'Kill ⚔️'},
  ],
  [
    {label: 'نکات 📝', cmd: 'نکات 📝'},
    {label: 'فیلتر 🔍', cmd: 'فیلتر 🔍'},
    {label: 'سرگرمی 🎭', cmd: 'سرگرمی 🎭'},
  ],
  [{label: 'بازگشت به منو 🔙', cmd: 'بازگشت به منو 🔙', fullWidth: true}],
];

const MAIN_KEYPAD_ROWS: Array<Array<{label: string; cmd: string; fullWidth?: boolean}>> = [
  [
    {label: 'راهنمای جامع 📚', cmd: 'راهنمای جامع 📚'},
    {label: 'پخش آهنگ 🎵', cmd: 'پخش آهنگ بهنام بانی'},
    {label: 'ویسکال 📞', cmd: 'ویسکال'},
  ],
  [
    {label: 'پیوستن به ویسکال 🎧', cmd: 'پیوستن به ویسکال'},
    {label: 'پلی‌لیست‌ها 🎶', cmd: 'پلی‌لیست‌ها'},
    {label: 'صف پخش 📋', cmd: 'صف پخش 📋'},
  ],
  [
    {label: 'آمار 📊', cmd: 'آمار 📊'},
    {label: 'نصب 📦', cmd: 'نصب 📦'},
    {label: 'مدیران 🛡️', cmd: 'مدیران 🛡️'},
  ],
  [
    {label: 'وضعیت اشتراک 🔐', cmd: 'وضعیت اشتراک 🔐'},
    {label: 'سرگرمی 🎭', cmd: 'سرگرمی 🎭'},
  ],
];

const QUICK_COMMANDS: Array<{label: string; cmd: string}> = [
  {label: '#موزیکال 🦇', cmd: '#موزیکال'},
  {label: 'کال 📞', cmd: 'کال'},
  {label: 'قطع کال 📴', cmd: 'قطع کال'},
  {label: 'قطع آهنگ ⏹', cmd: 'قطع آهنگ'},
  {label: 'پخش آهنگ تتلو جدید', cmd: 'پخش آهنگ تتلو جدید'},
  {label: 'دانلود آهنگ تتلو جدید ⬇️', cmd: 'دانلود آهنگ تتلو جدید'},
  {label: 'حذف 100 🧹', cmd: 'حذف 100'},
  {
    label: 'ورود موزیک گپ بتمن',
    cmd: 'ورود موزیک https://rubika.ir/joing/BCABACAHA0KBYOJFGCWRGGAGCVKPBTKR',
  },
  {label: 'ویسکال 📞', cmd: 'ویسکال'},
  {label: 'پیوستن به ویسکال', cmd: 'پیوستن به ویسکال'},
  {label: 'پخش کن (روی فایل ریپلای)', cmd: 'پخش کن'},
  {label: 'پخش آهنگ شایان یو جدید', cmd: 'پخش آهنگ شایان یو جدید'},
  {label: 'پلی‌لیست‌ها 🎶', cmd: 'پلی‌لیست‌ها'},
  {label: 'ساخت پلی‌لیست موردعلاقه', cmd: 'ساخت پلی‌لیست موردعلاقه'},
  {label: 'پخش آهنگ بهنام بانی', cmd: 'پخش آهنگ بهنام بانی'},
  {label: 'راهنمای جامع 📚', cmd: 'راهنمای جامع 📚'},
  {label: 'بازگشت به منو 🔙', cmd: 'بازگشت به منو 🔙'},
  {label: '/get', cmd: '/get'},
  {label: 'آهنگ لری', cmd: 'آهنگ لری'},
  {label: 'آهنگ شاد', cmd: 'آهنگ شاد'},
  {label: 'ساخت کال', cmd: 'ساخت کال'},
  {label: 'پخش ریپلای', cmd: 'پخش ریپلای'},
  {label: 'پخش رندوم', cmd: 'پخش رندوم'},
  {label: 'بعدی', cmd: 'بعدی'},
  {label: 'قبلی', cmd: 'قبلی'},
  {label: 'صف', cmd: 'صف'},
  {label: 'تاریخچه آهنگها', cmd: 'تاریخچه آهنگها'},
  {label: 'تنظیم صدا 50', cmd: 'تنظیم صدا 50'},
  {label: 'بیصدا', cmd: 'بیصدا'},
  {label: 'باصدا', cmd: 'باصدا'},
  {label: 'توقف آهنگ', cmd: 'توقف آهنگ'},
  {label: 'ادامه آهنگ', cmd: 'ادامه آهنگ'},
  {label: 'قطع ویسکال', cmd: 'قطع ویسکال'},
  {label: 'مقام', cmd: 'مقام'},
  {label: 'وضعیت', cmd: 'وضعیت'},
];

function resolveAudioSrc(url: string): string {
  return url.startsWith('/api/') ? url : `/api/music/stream?url=${encodeURIComponent(url)}`;
}

function formatCallDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const GroupChatConsoleView: React.FC<GroupChatConsoleViewProps> = ({
  group,
  creatorId,
  isBusy,
  pollingActive = false,
  userbotStatus,
  onOpenRubikaTab,
  onJoinVoiceCall,
  audioState,
  callState,
  onExecuteCommand,
  onSelectTrack,
  onSendVoiceNote,
  onAddTrackToPlaylist,
}) => {
  const [selectedSenderId, setSelectedSenderId] = useState<string>(creatorId);
  const [inputText, setInputText] = useState('');
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [sendToRubika, setSendToRubika] = useState(Boolean(pollingActive));
  const [copiedLink, setCopiedLink] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(true);
  const [targetPlaylistId, setTargetPlaylistId] = useState<string>(
    group.customPlaylists?.[0]?.id || '',
  );

  // Voice Note Recorder state
  const [recording, setRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);
  const recordTimerRef = useRef<number | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!group.members.some((m) => m.userId === selectedSenderId) && group.members.length > 0) {
      setSelectedSenderId(group.members[0].userId);
    }
  }, [group.members, selectedSenderId]);

  useEffect(() => {
    if (pollingActive) {
      setSendToRubika(true);
    }
  }, [pollingActive]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [group.messages.length]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleSend = async (commandOverride?: string) => {
    const text = (commandOverride ?? inputText).trim();
    if (!text) return;
    audioState.primeAudio();
    if (!commandOverride) setInputText('');

    const isCallStart =
      [
        'ویسکال',
        'باز کردن ویسکال',
        'شروع ویسکال',
        'ویس چت',
        'ویس‌چت',
        'کال',
        'ساخت کال',
        'پیوستن',
        'پیوستن به ویسکال',
        'تماس',
        'شروع تماس',
        'تماس صوتی',
        'تماس تلفنی',
        'برقراری تماس',
        'پخش',
        'پخش کن',
        'اینو پخش کن',
        'پخش ریپلای',
        'بخوان',
        'بخون',
        'play',
      ].includes(text) ||
      text.startsWith('پخش ') ||
      text.startsWith('پخش آهنگ ') ||
      text.startsWith('آهنگ ') ||
      text.startsWith('پخش موزیک ') ||
      text.startsWith('پخش پلی‌لیست ');
    const isCallEnd = ['قطع ویسکال', 'قطع تماس', 'پایان تماس', 'خروج', 'Kill ⚔️', 'Kill'].includes(
      text,
    );

    if (isCallStart && callState.callStatus === 'idle') {
      void callState.joinCall();
    } else if (isCallEnd && callState.callStatus !== 'idle') {
      callState.leaveCall(true);
    }

    await onExecuteCommand({
      senderId: selectedSenderId,
      text,
      replyToMessageId: replyTarget?.id,
      replyToSenderId: replyTarget?.senderId,
      replyToAudioUrl: replyTarget?.audioAttachment?.url,
      sendToRubika,
    });
    setReplyTarget(null);
  };

  const handleToggleCallInChat = async () => {
    audioState.primeAudio();
    if (callState.callStatus !== 'idle' || group.voiceCallActive) {
      callState.leaveCall(true);
      await onExecuteCommand({
        senderId: selectedSenderId,
        text: 'قطع ویسکال',
        sendToRubika,
      });
    } else {
      await callState.joinCall();
      await onExecuteCommand({
        senderId: selectedSenderId,
        text: 'ساخت کال',
        sendToRubika,
      });
    }
  };

  const handlePlayAttachmentInCall = async (att: NonNullable<ChatMessage['audioAttachment']>) => {
    audioState.primeAudio();
    const track: Track = {
      id: `chat_att_${Date.now()}`,
      title: att.title,
      artist: att.artist || 'چت گروهی',
      durationSec: att.durationSec || 60,
      streamUrl: att.url,
      sourceUrl: att.url,
      source: 'reply',
      requestedBy:
        group.members.find((m) => m.userId === selectedSenderId)?.name || 'کاربر چت',
      requestedAt: new Date().toISOString(),
    };
    await onSelectTrack(track, 'play_now');
  };

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(callState.inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      // Fallback
    }
  };

  const toggleVoiceRecording = async () => {
    setRecordError(null);
    if (recording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (recordTimerRef.current) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      return;
    }

    try {
      audioState.primeAudio();
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = mimeType ? new MediaRecorder(stream, {mimeType}) : new MediaRecorder(stream);
      recordChunksRef.current = [];
      recordStartRef.current = Date.now();
      setRecordingSec(0);

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const durationSec = Math.max(1, Math.round((Date.now() - recordStartRef.current) / 1000));
        const blob = new Blob(recordChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = String(reader.result || '');
          if (base64) {
            void onSendVoiceNote({
              senderId: selectedSenderId,
              mimeType: blob.type,
              audioBase64: base64,
              durationSec,
            });
          }
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      recordTimerRef.current = window.setInterval(() => {
        setRecordingSec((s) => s + 1);
      }, 1000);
    } catch {
      setRecordError('دسترسی میکروفون برای ضبط ویس در مرورگر مسدود است.');
      setRecording(false);
    }
  };

  const handleAudioFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setRecordError(null);
    if (file.size > 22 * 1024 * 1024) {
      setRecordError('حجم فایل صوتی نباید بیشتر از ۲۲ مگابایت باشد.');
      return;
    }

    audioState.primeAudio();
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = String(reader.result || '');
      if (!base64) return;
      let durationSec = 120;
      try {
        const objUrl = URL.createObjectURL(file);
        const probe = new Audio(objUrl);
        await new Promise<void>((resolve) => {
          probe.onloadedmetadata = () => {
            if (Number.isFinite(probe.duration) && probe.duration > 0) {
              durationSec = Math.round(probe.duration);
            }
            resolve();
          };
          probe.onerror = () => resolve();
          setTimeout(resolve, 1200);
        });
        URL.revokeObjectURL(objUrl);
      } catch {
        // Fallback to default duration
      }
      await onSendVoiceNote({
        senderId: selectedSenderId,
        mimeType: file.type || 'audio/mpeg',
        audioBase64: base64,
        durationSec,
        title: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const isCallLive = callState.callStatus !== 'idle' || group.voiceCallActive;
  const activeKeypadRows =
    group.activeKeypadMenu === 'help' ? HELP_KEYPAD_ROWS : MAIN_KEYPAD_ROWS;
  const participantDisplayCount = Math.max(
    callState.participants.length,
    group.voiceCallActive ? 1 : 0,
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Main Rubika-Style Group Chat & Interactive Keypad Console */}
      <div className="lg:col-span-8 bg-[#111827] border border-slate-800 rounded-xl flex flex-col h-[780px] overflow-hidden">
        {/* Top Group Bar (Rubika style) */}
        <div className="px-5 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-[#151E2E]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-sky-500/20 border border-sky-400/30 text-sky-300 font-bold flex items-center justify-center shrink-0">
              {group.title.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-100 truncate">{group.title}</h3>
              <p className="text-xs text-slate-400 flex items-center gap-2">
                <span>{group.members.length} عضو</span>
                <span>·</span>
                <span className="font-mono">{group.rubikaChatId}</span>
                <span>·</span>
                <span>{group.publicAccess === 'open' ? 'دسترسی عموم باز' : 'دسترسی قفل'}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sendToRubika}
                onChange={(e) => setSendToRubika(e.target.checked)}
                className="accent-emerald-500 rounded cursor-pointer"
              />
              <span>ارسال پاسخ واقعی به روبیکا</span>
            </label>
          </div>
        </div>

        {/* Rubika Active Group Call Strip (mirrors Rubika live VC top bar) */}
        <div
          className={`px-4 py-2 border-b flex flex-wrap items-center justify-between gap-3 ${
            isCallLive
              ? 'bg-gradient-to-l from-[#1C7CB8] via-[#2896D2] to-[#1C7CB8] border-sky-400/40 text-white'
              : 'bg-[#0E1523] border-slate-800 text-slate-200'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {isCallLive ? (
              <>
                <div className="flex items-center -space-x-2 space-x-reverse shrink-0" aria-hidden="true">
                  {(callState.participants.length > 0
                    ? callState.participants.slice(0, 3)
                    : [
                        {peerId: 'bot', name: group.title.slice(0, 1)},
                        {peerId: 'host', name: 'P'},
                      ]
                  ).map((p, idx) => (
                    <div
                      key={p.peerId}
                      className={`w-7 h-7 rounded-full border-2 border-[#2896D2] flex items-center justify-center text-[11px] font-bold ${
                        idx === 0
                          ? 'bg-slate-900 text-sky-300'
                          : idx === 1
                            ? 'bg-purple-700 text-white'
                            : 'bg-emerald-700 text-white'
                      }`}
                    >
                      {p.name.slice(0, 1)}
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold truncate max-w-[160px]">{group.title}</span>
                  <span className="text-[11px] text-sky-100/90 flex items-center gap-1 whitespace-nowrap">
                    <Users className="w-3.5 h-3.5" />
                    <span className="font-mono tabular-nums">{participantDisplayCount}</span>
                  </span>
                </div>

                {callState.callStatus === 'idle' ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      audioState.primeAudio();
                      if (onJoinVoiceCall) {
                        void onJoinVoiceCall();
                      } else {
                        void callState.joinCall();
                      }
                    }}
                    className="px-3.5 py-1 rounded-full bg-white text-[#156598] hover:bg-sky-50 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>پیوستن</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleToggleCallInChat()}
                    className="px-3 py-1 rounded-full bg-slate-950/35 hover:bg-red-600/80 border border-white/25 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <PhoneOff className="w-3.5 h-3.5" />
                    <span>قطع تماس</span>
                  </button>
                )}
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleSend(group.pausedTrack ? 'ادامه آهنگ' : 'پخش آهنگ')}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>ورود به ویسکال و پخش آهنگ</span>
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleToggleCallInChat()}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>فقط ساخت کال</span>
                </button>
              </div>
            )}

            {!userbotStatus?.connected && onOpenRubikaTab && (
              <button
                type="button"
                onClick={onOpenRubikaTab}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs whitespace-nowrap cursor-pointer"
              >
                اتصال اکانت روبیکا برای ویسکال واقعی گپ
              </button>
            )}

            {callState.callStatus !== 'idle' && (
              <>
                <button
                  type="button"
                  onClick={callState.toggleCallMic}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 border whitespace-nowrap cursor-pointer ${
                    callState.micEnabled && callState.micAvailable
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  {callState.micEnabled && callState.micAvailable ? (
                    <Mic className="w-3.5 h-3.5" />
                  ) : (
                    <MicOff className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {callState.micEnabled && callState.micAvailable ? 'میکروفون باز' : 'میکروفون بسته'}
                  </span>
                </button>

                <span className="text-xs font-mono tabular-nums text-emerald-400 whitespace-nowrap">
                  {callState.callStatus === 'ringing'
                    ? 'در حال برقراری...'
                    : formatCallDuration(callState.callSeconds)}
                </span>
              </>
            )}

            <button
              type="button"
              onClick={() => void handleCopyInvite()}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 whitespace-nowrap cursor-pointer"
              title="ارسال لینک تماس تلفنی برای پیوستن دیگران"
            >
              {copiedLink ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedLink ? 'کپی شد' : 'لینک تماس'}</span>
            </button>
          </div>

          {/* Currently Singing Song Mini Deck inside Chat */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-end gap-0.5 h-4 shrink-0" aria-hidden="true">
              {audioState.frequencyBars.slice(0, 8).map((v, i) => (
                <span
                  key={i}
                  style={{height: `${Math.max(15, v)}%`}}
                  className={`w-1 rounded-t ${
                    group.isPlaying && !group.isMuted ? 'bg-emerald-400' : 'bg-slate-600'
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-slate-200 truncate max-w-[160px]">
              {group.currentTrack
                ? group.currentTrack.title
                : group.pausedTrack
                  ? `متوقف: ${group.pausedTrack.title}`
                  : 'بدون آهنگ فعال'}
            </span>

            {group.currentTrack && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleSend(group.isPlaying ? 'توقف آهنگ' : 'ادامه آهنگ')}
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 cursor-pointer"
                  title={group.isPlaying ? 'توقف موقت' : 'پخش'}
                >
                  {group.isPlaying ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleSend('بعدی')}
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 cursor-pointer"
                  title="آهنگ بعدی"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleSend(group.isMuted ? 'باصدا' : 'بیصدا')}
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 cursor-pointer"
                  title={group.isMuted ? 'باصدا' : 'بیصدا'}
                >
                  {group.isMuted ? (
                    <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                </button>
              </div>
            )}

            {audioState.audioError && (
              <button
                type="button"
                onClick={audioState.unlockAudioAndPlay}
                className="px-2.5 py-1 rounded bg-amber-500 text-slate-950 text-xs font-bold whitespace-nowrap cursor-pointer"
              >
                پخش صدا
              </button>
            )}
          </div>
        </div>

        {/* Messages Feed (Rubika bubbles + centered Voice Call system banners) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-gradient-to-b from-[#0B0F17] via-[#0E1422] to-[#0B0F17]">
          {group.messages.map((msg) => {
            if (msg.isSystemEvent) {
              return (
                <div key={msg.id} className="flex justify-center my-2">
                  <div className="px-4 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/70 text-xs text-slate-200 font-medium shadow-sm">
                    {msg.text}
                  </div>
                </div>
              );
            }

            const isOutgoingUser = !msg.isBot;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isOutgoingUser ? 'items-start' : 'items-end'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-2.5 border shadow-sm ${
                    isOutgoingUser
                      ? 'bg-[#6D3B96]/70 border-purple-400/25 text-slate-50 rounded-tr-sm'
                      : 'bg-[#1D2533] border-slate-700/70 text-slate-100 rounded-tl-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 mb-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`font-bold ${
                          msg.isBot ? 'text-sky-400' : 'text-purple-200'
                        }`}
                      >
                        {msg.senderName}
                      </span>
                      {!msg.isBot && (
                        <span className="text-[11px] text-purple-200/75">
                          · {ROLE_BADGE_TEXT[msg.senderRole]}
                        </span>
                      )}
                      {msg.deliveredToRubika && (
                        <span className="text-[11px] text-emerald-400">· ارسال‌شده به روبیکا</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyTarget(msg)}
                      className="text-xs text-slate-300/70 hover:text-white flex items-center gap-1 cursor-pointer"
                      title="ریپلای روی این پیام"
                    >
                      <Reply className="w-3.5 h-3.5" />
                      <span>ریپلای</span>
                    </button>
                  </div>

                  {msg.replyPreview && (
                    <div className="mb-2 px-3 py-1.5 rounded-lg bg-black/25 border-r-2 border-sky-400 text-xs space-y-0.5">
                      {msg.replySenderName && (
                        <p className="font-semibold text-sky-400 text-[11px]">
                          {msg.replySenderName}
                        </p>
                      )}
                      <p className="text-slate-300 truncate">{msg.replyPreview}</p>
                    </div>
                  )}

                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>

                  {msg.audioAttachment && (
                    <div className="mt-3 pt-2.5 border-t border-white/10 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-300">
                        <div className="flex items-center gap-2 min-w-0">
                          <Music2 className="w-4 h-4 shrink-0" />
                          <span className="truncate font-medium">
                            {msg.audioAttachment.title}
                            {msg.audioAttachment.artist ? ` — ${msg.audioAttachment.artist}` : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {onAddTrackToPlaylist && (group.customPlaylists || []).length > 0 && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                const plId =
                                  (group.customPlaylists || []).find(
                                    (p) => p.id === targetPlaylistId,
                                  )?.id || group.customPlaylists?.[0]?.id;
                                if (!plId) return;
                                void onAddTrackToPlaylist(plId, {
                                  track: {
                                    id: `chat_msg_${msg.id}`,
                                    title: msg.audioAttachment!.title,
                                    artist: msg.audioAttachment!.artist || msg.senderName,
                                    durationSec: msg.audioAttachment!.durationSec || 60,
                                    streamUrl: msg.audioAttachment!.url,
                                    sourceUrl: msg.audioAttachment!.url,
                                    source: 'reply',
                                    requestedBy: msg.senderName,
                                    requestedAt: msg.timestamp,
                                  },
                                });
                              }}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>+ پلی‌لیست</span>
                            </button>
                          )}
                          <a
                            href={resolveAudioSrc(msg.audioAttachment.url)}
                            download={`${msg.audioAttachment.title || 'track'}.m4a`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Download className="w-3 h-3 text-emerald-400" />
                            <span>دانلود فایل</span>
                          </a>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handlePlayAttachmentInCall(msg.audioAttachment!)}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Headphones className="w-3 h-3" />
                            <span>پخش در ویسکال</span>
                          </button>
                        </div>
                      </div>
                      <audio
                        controls
                        preload="none"
                        src={resolveAudioSrc(msg.audioAttachment.url)}
                        onPlay={() => audioState.primeAudio()}
                        className="w-full h-9 rounded"
                      />
                    </div>
                  )}

                  <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-slate-300/70 font-mono tabular-nums">
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString('fa-IR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {isOutgoingUser && <CheckCheck className="w-3.5 h-3.5 text-sky-300" />}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply Indicator */}
        {replyTarget && (
          <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0 text-slate-300">
              <CornerDownLeft className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">
                در حال ریپلای به <strong className="text-sky-300">{replyTarget.senderName}</strong>:{' '}
                {replyTarget.text.slice(0, 60)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReplyTarget(null)}
              className="text-slate-400 hover:text-white cursor-pointer"
              aria-label="لغو ریپلای"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {recordError && (
          <div className="px-4 py-2 bg-amber-500/10 border-t border-amber-500/30 text-xs text-amber-300">
            {recordError}
          </div>
        )}

        {/* Composer Bar + Keypad Toggle */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="px-3.5 py-2.5 border-t border-slate-800 bg-[#1B2230] flex flex-wrap sm:flex-nowrap items-center gap-2"
        >
          <div className="flex items-center gap-1.5 shrink-0">
            <UserCheck className="w-4 h-4 text-slate-400" />
            <select
              value={selectedSenderId}
              onChange={(e) => setSelectedSenderId(e.target.value)}
              aria-label="ارسال با هویت کاربر"
              className="bg-[#0B0F17] border border-slate-800 rounded-lg px-2 py-2 text-xs text-slate-200 outline-none max-w-[140px]"
            >
              {group.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name} ({ROLE_BADGE_TEXT[m.role]})
                </option>
              ))}
            </select>
          </div>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="پیام یا دستور (مثلاً: پخش آهنگ بهنام بانی، راهنمای جامع)..."
            className="flex-1 min-w-[160px] bg-[#0B0F17] border border-slate-800 focus:border-sky-500 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
          />

          <button
            type="button"
            onClick={() => setKeypadOpen((prev) => !prev)}
            className={`p-2 rounded-lg border transition-colors cursor-pointer ${
              keypadOpen
                ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
            title="نمایش / مخفی کردن کیبورد دستورات ربات"
            aria-label="کیبورد دستورات ربات"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>

          <input
            ref={audioFileInputRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.ogg,.wav,.aac"
            onChange={(e) => void handleAudioFileSelected(e)}
            className="hidden"
          />

          <button
            type="button"
            disabled={isBusy}
            onClick={() => audioFileInputRef.current?.click()}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
            title="ارسال فایل آهنگ (MP3/M4A) در چت برای پخش با ریپلای"
            aria-label="آپلود فایل آهنگ"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => void toggleVoiceRecording()}
            className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              recording
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
            title="ضبط پیام صوتی واقعی در چت"
          >
            {recording ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            <span className="font-mono tabular-nums">
              {recording ? `ارسال (${formatCallDuration(recordingSec)})` : 'ویس'}
            </span>
          </button>

          <button
            type="submit"
            disabled={isBusy || !inputText.trim()}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-sm font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>ارسال</span>
          </button>
        </form>

        {/* Rubika Bottom 3-Column Interactive Reply Keyboard (Screenshot 1) */}
        {keypadOpen && (
          <div className="p-2.5 bg-[#121722] border-t border-slate-800 space-y-1.5">
            {activeKeypadRows.map((row, rIdx) => (
              <div
                key={rIdx}
                className={`grid gap-1.5 ${
                  row.length === 1 ? 'grid-cols-1' : 'grid-cols-3'
                }`}
              >
                {row.map((btn) => (
                  <button
                    key={btn.cmd}
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleSend(btn.cmd)}
                    className="py-2.5 px-2 rounded-lg bg-[#242C3D] hover:bg-[#2F394E] active:scale-[0.99] border border-slate-700/60 text-xs sm:text-sm font-medium text-slate-100 transition-all truncate cursor-pointer disabled:opacity-50"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Commands Reference & 1-Click Runner */}
      <aside className="lg:col-span-4 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-100">اجرای سریع دستورات ربات</h3>
          <p className="text-xs text-slate-400 mt-1">
            با ارسال دستورهایی مثل «پخش آهنگ بهنام بانی»، ربات به صورت خودکار گفتگوی گروهی (ویسکال) را آغاز کرده و فایل صوتی را پخش می‌کند. از کیبورد پایین چت نیز می‌توانید مستقیماً منوها را کنترل کنید.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_COMMANDS.map((item) => (
            <button
              key={item.cmd}
              type="button"
              disabled={isBusy}
              onClick={() => void handleSend(item.cmd)}
              className="px-3 py-1.5 rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
            >
              {item.label}
            </button>
          ))}
        </div>

        {(group.customPlaylists || []).length > 0 && (
          <div className="pt-3 border-t border-slate-800 space-y-1.5">
            <label className="block text-xs text-slate-400">
              پلی‌لیست مقصد برای ذخیره سریع فایل‌های چت:
            </label>
            <select
              value={
                (group.customPlaylists || []).some((p) => p.id === targetPlaylistId)
                  ? targetPlaylistId
                  : group.customPlaylists?.[0]?.id || ''
              }
              onChange={(e) => setTargetPlaylistId(e.target.value)}
              className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none"
            >
              {(group.customPlaylists || []).map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.name} ({pl.tracks.length} آهنگ)
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="pt-4 border-t border-slate-800 text-xs text-slate-400 space-y-2">
          <p className="text-slate-200 font-medium">دستورات پرکاربرد (مطابق ربات روبیکا):</p>
          <ul className="space-y-1.5 list-disc list-inside">
            <li>
              <code className="font-mono text-emerald-400">ویسکال</code> — باز کردن ویسکال در گروه روبیکا و ارسال دکمه پیوستن
            </li>
            <li>
              <code className="font-mono text-emerald-400">ساخت پلی‌لیست نام</code> — ایجاد پلی‌لیست جدید
            </li>
            <li>
              <code className="font-mono text-emerald-400">افزودن به پلی‌لیست نام | آهنگ</code> — افزودن با جستجو، لینک یا ریپلای
            </li>
            <li>
              <code className="font-mono text-emerald-400">پخش پلی‌لیست نام</code> — پخش فوری پلی‌لیست در ویسکال
            </li>
            <li>
              <code className="font-mono text-emerald-400">پخش آهنگ بهنام بانی</code> — شروع ویسکال و پخش آهنگ + سهمیه روزانه
            </li>
            <li>
              <code className="font-mono text-emerald-400">/get</code> — گزارش زنده گروه و سهمیه امروز
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
};
