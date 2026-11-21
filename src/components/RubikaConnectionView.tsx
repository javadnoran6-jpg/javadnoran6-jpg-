import React, {useCallback, useEffect, useState} from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  KeyRound,
  Link2,
  LogOut,
  Phone,
  PhoneCall,
  Play,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Square,
  Terminal,
  Webhook,
} from 'lucide-react';
import {BotConfigState, GroupState, Track} from '../types/bot';

interface RubikaConnectionViewProps {
  config: BotConfigState;
  activeGroup: GroupState;
  isBusy: boolean;
  onSaveConfig: (patch: {
    token?: string;
    creatorName?: string;
    botName?: string;
    rubikaMode?: 'bot_api_v3' | 'userbot_rubpy';
    autoSyncAudioToRubika?: boolean;
  }) => Promise<void>;
  onVerifyToken: () => Promise<void>;
  onTogglePolling: (action: 'start' | 'stop') => Promise<void>;
  onSendDirectRubika: (chatId: string, text: string) => Promise<void>;
  onJoinInvite?: (
    inviteLink: string,
    songQuery?: string,
  ) => Promise<{ok: boolean; queued?: boolean; error?: string; group?: GroupState; startedTrack?: Track}>;
  onOpenVoiceCallInGroup?: () => Promise<void>;
  onRefreshState?: () => Promise<void>;
  onNotify?: (msg: string) => void;
}

export const RubikaConnectionView: React.FC<RubikaConnectionViewProps> = ({
  config,
  activeGroup,
  isBusy,
  onSaveConfig,
  onVerifyToken,
  onTogglePolling,
  onSendDirectRubika,
  onJoinInvite,
  onOpenVoiceCallInGroup,
  onRefreshState,
  onNotify,
}) => {
  const [tokenInput, setTokenInput] = useState(config.token);
  const [creatorInput, setCreatorInput] = useState(config.creatorName);
  const [botNameInput, setBotNameInput] = useState(config.botName);
  const [directChatId, setDirectChatId] = useState(activeGroup.rubikaChatId);
  const [directText, setDirectText] = useState('🎵 ربات موزیکال پریا چش رنگی با موفقیت به گروه متصل شد.');
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedUserbotCmd, setCopiedUserbotCmd] = useState(false);

  // Built-in Rubika Userbot OTP & Daemon state
  const [daemonInfo, setDaemonInfo] = useState<{
    runtimeReady: boolean;
    hasSession: boolean;
    daemonRunning: boolean;
    installingRuntime?: boolean;
    audioLibs?: Array<{name: string; installed: boolean; version?: string}>;
    accountName?: string;
    phone?: string;
  } | null>(null);
  const [installingLibs, setInstallingLibs] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [passKeyInput, setPassKeyInput] = useState('');
  const [needsPassKey, setNeedsPassKey] = useState(false);
  const [passKeyHint, setPassKeyHint] = useState('');
  const [codeHash, setCodeHash] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [smsCodeInput, setSmsCodeInput] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMsg, setAuthMsg] = useState<{type: 'ok' | 'error'; text: string} | null>(null);
  const [inviteLinkInput, setInviteLinkInput] = useState(
    activeGroup.inviteLink || 'https://rubika.ir/joing/JDFJCAGH0HWQXNCTTKOBTPOMBBJAIRJS',
  );
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{
    type: 'ok' | 'queued' | 'error';
    text: string;
  } | null>(null);

  const loadDaemonInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/userbot/daemon-status');
      if (res.ok) {
        const data = (await res.json()) as {
          runtimeReady: boolean;
          hasSession: boolean;
          daemonRunning: boolean;
          installingRuntime?: boolean;
          audioLibs?: Array<{name: string; installed: boolean; version?: string}>;
          accountName?: string;
          phone?: string;
        };
        setDaemonInfo(data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadDaemonInfo();
  }, [loadDaemonInfo]);

  useEffect(() => {
    setTokenInput(config.token);
    setCreatorInput(config.creatorName);
    setBotNameInput(config.botName);
  }, [config.token, config.creatorName, config.botName]);

  useEffect(() => {
    setDirectChatId(activeGroup.rubikaChatId);
  }, [activeGroup.rubikaChatId]);

  const webhookUrl = `${window.location.origin}/api/rubika/webhook`;
  const cleanUsername = (config.botUsername || '').replace(/^@/, '').trim();
  const autoSyncEnabled = config.autoSyncAudioToRubika !== false;
  const userbotStatus = config.userbotStatus;
  const userbotRunCommand = `pip install -U "rubpy[rtc]" aiohttp av yt-dlp && python3 rubika_userbot_vc.py --server "${window.location.origin}" --session "parya_userbot"`;

  const handleSendOtp = async () => {
    if (!phoneInput.trim()) return;
    setAuthBusy(true);
    setAuthMsg(null);
    try {
      const res = await fetch('/api/userbot/auth/send-code', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          phone: phoneInput.trim(),
          ...(needsPassKey && passKeyInput.trim() ? {passKey: passKeyInput.trim()} : {}),
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        status?: string;
        phone?: string;
        phoneCodeHash?: string;
        hintPassKey?: string;
        error?: string;
      };
      if (data.status === 'SendPassKey') {
        setNeedsPassKey(true);
        setPassKeyHint(data.hintPassKey || '');
        setAuthMsg({type: 'error', text: data.error || 'این اکانت رمز دوم دارد. رمز را وارد کرده و دوباره بزنید.'});
      } else if (data.ok && data.phoneCodeHash) {
        setCodeHash(data.phoneCodeHash);
        setNormalizedPhone(data.phone || phoneInput.trim());
        setNeedsPassKey(false);
        setAuthMsg({type: 'ok', text: 'کد تایید پیامکی روبیکا ارسال شد. کد ۵ رقمی را وارد کنید.'});
      } else {
        setAuthMsg({type: 'error', text: data.error || 'ارسال کد تایید ناموفق بود.'});
      }
    } catch {
      setAuthMsg({type: 'error', text: 'خطا در ارتباط با سرور هنگام ارسال کد.'});
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignInOtp = async () => {
    if (!smsCodeInput.trim() || !codeHash) return;
    setAuthBusy(true);
    setAuthMsg(null);
    try {
      const res = await fetch('/api/userbot/auth/sign-in', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          phone: normalizedPhone || phoneInput.trim(),
          code: smsCodeInput.trim(),
          phoneCodeHash: codeHash,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        accountName?: string;
        autoJoinedGroup?: {ok?: boolean; title?: string; chatGuid?: string} | null;
        error?: string;
      };
      if (data.ok) {
        setCodeHash('');
        setSmsCodeInput('');
        setPassKeyInput('');
        const joinSuffix = data.autoJoinedGroup?.ok
          ? ` و گروه «${data.autoJoinedGroup.title || ''}» (${data.autoJoinedGroup.chatGuid || ''}) به صورت خودکار متصل شد.`
          : '.';
        setAuthMsg({
          type: 'ok',
          text: `اتصال واقعی اکانت «${data.accountName || 'Userbot'}» برقرار و سرویس ویس‌چت فعال شد${joinSuffix}`,
        });
        onNotify?.(
          data.autoJoinedGroup?.ok
            ? `اکانت متصل و عضو گروه «${data.autoJoinedGroup.title}» شد.`
            : 'اکانت ویس‌چت روبیکا متصل شد.',
        );
        await Promise.all([loadDaemonInfo(), onRefreshState?.()]);
      } else {
        setAuthMsg({type: 'error', text: data.error || 'تایید کد ناموفق بود.'});
      }
    } catch {
      setAuthMsg({type: 'error', text: 'خطا در تایید کد ورود روبیکا.'});
    } finally {
      setAuthBusy(false);
    }
  };

  const handleDaemonControl = async (action: 'start' | 'stop' | 'logout') => {
    setAuthBusy(true);
    setAuthMsg(null);
    try {
      const url =
        action === 'logout'
          ? '/api/userbot/auth/logout'
          : action === 'start'
            ? '/api/userbot/daemon/start'
            : '/api/userbot/daemon/stop';
      const res = await fetch(url, {method: 'POST'});
      const data = (await res.json()) as {started?: boolean; reason?: string};
      if (action === 'start' && data.started === false && data.reason) {
        setAuthMsg({type: 'error', text: data.reason});
      } else {
        onNotify?.(
          action === 'logout'
            ? 'سشن اکانت ویسکال روبیکا حذف شد.'
            : action === 'start'
              ? 'استریمر ویسکال روبیکا فعال شد.'
              : 'استریمر ویسکال روبیکا متوقف شد.',
        );
      }
      await Promise.all([loadDaemonInfo(), onRefreshState?.()]);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleBindGroup = async (chatGuid: string, title: string) => {
    setAuthBusy(true);
    try {
      const res = await fetch('/api/userbot/bind-group', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({chatGuid, title}),
      });
      if (res.ok) {
        onNotify?.(`گروه «${title}» (${chatGuid}) به عنوان گپ فعال ویسکال تنظیم شد.`);
        await onRefreshState?.();
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleJoinInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = inviteLinkInput.trim();
    if (!cleaned) return;
    setInviteBusy(true);
    setInviteMsg(null);
    try {
      if (onJoinInvite) {
        const res = await onJoinInvite(cleaned);
        if (res.ok && res.group) {
          const isCh =
            res.group.chatType === 'channel' || res.group.rubikaChatId.startsWith('c0');
          const trackTitle = res.startedTrack?.title || res.group.currentTrack?.title;
          setInviteMsg({
            type: 'ok',
            text: trackTitle
              ? `${isCh ? 'کانال' : 'گروه'} «${res.group.title}» متصل شد، ویسکال باز شد و پخش «${trackTitle}» آغاز گردید.`
              : `${isCh ? 'کانال' : 'گروه'} «${res.group.title}» (${res.group.rubikaChatId}) متصل و ویسکال فعال شد.`,
          });
        } else if (res.queued) {
          setInviteMsg({
            type: 'queued',
            text:
              res.error ||
              'در صف عضویت خودکار ثبت شد و بلافاصله پس از ورود Userbot متصل می‌شود.',
          });
        } else {
          setInviteMsg({
            type: 'error',
            text: res.error || 'خطا در اتصال خودکار گروه یا کانال روبیکا.',
          });
        }
      } else {
        const resp = await fetch('/api/userbot/join-invite', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({inviteLink: cleaned, autoPlayInCall: true}),
        });
        const data = (await resp.json()) as {
          ok?: boolean;
          queued?: boolean;
          error?: string;
          group?: GroupState;
          startedTrack?: Track;
        };
        if (resp.ok && data.ok && data.group) {
          const isCh =
            data.group.chatType === 'channel' || data.group.rubikaChatId.startsWith('c0');
          const trackTitle = data.startedTrack?.title || data.group.currentTrack?.title;
          setInviteMsg({
            type: 'ok',
            text: trackTitle
              ? `${isCh ? 'کانال' : 'گروه'} «${data.group.title}» متصل شد، ویسکال باز شد و پخش «${trackTitle}» آغاز گردید.`
              : `${isCh ? 'کانال' : 'گروه'} «${data.group.title}» (${data.group.rubikaChatId}) متصل و ویسکال فعال شد.`,
          });
          await onRefreshState?.();
        } else if (data.queued) {
          setInviteMsg({
            type: 'queued',
            text:
              data.error ||
              'در صف عضویت خودکار ثبت شد و بلافاصله پس از ورود Userbot متصل می‌شود.',
          });
          await onRefreshState?.();
        } else {
          setInviteMsg({
            type: 'error',
            text: data.error || 'خطا در اتصال خودکار گروه یا کانال روبیکا.',
          });
        }
      }
    } catch {
      setInviteMsg({type: 'error', text: 'خطا در برقراری ارتباط با سرور برای عضویت.'});
    } finally {
      setInviteBusy(false);
    }
  };

  const handleInstallAudioLibs = async () => {
    setInstallingLibs(true);
    setAuthMsg(null);
    try {
      const res = await fetch('/api/userbot/install-runtime', {method: 'POST'});
      const data = (await res.json()) as {
        ok: boolean;
        runtimeReady: boolean;
        audioLibs?: Array<{name: string; installed: boolean; version?: string}>;
        error?: string;
      };
      await loadDaemonInfo();
      if (data.ok || data.runtimeReady) {
        setAuthMsg({type: 'ok', text: 'تمام کتابخانه‌های صدا و ویسکال (rubpy[rtc], aiortc, PyAV, yt-dlp, pydub, FFmpeg) با موفقیت نصب و آماده شدند.'});
        onNotify?.('کتابخانه‌های صدا و ویسکال نصب و فعال شدند.');
      } else {
        setAuthMsg({type: 'error', text: data.error || 'خطا در نصب کتابخانه‌های صوتی.'});
      }
    } catch {
      setAuthMsg({type: 'error', text: 'عدم دسترسی به سرور هنگام نصب کتابخانه‌های صدا.'});
    } finally {
      setInstallingLibs(false);
    }
  };

  const copyWebhook = () => {
    void navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 1800);
  };

  const copyUserbotCmd = () => {
    void navigator.clipboard.writeText(userbotRunCommand);
    setCopiedUserbotCmd(true);
    setTimeout(() => setCopiedUserbotCmd(false), 1800);
  };

  return (
    <div className="space-y-6">
      {/* Mode Switcher & Built-in Real Rubika Group Voice Chat Userbot Login + Bridge */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400 shrink-0" />
              <h3 className="text-base font-semibold text-slate-100">
                ورود مستقیم به ویس‌چت واقعی گروه روبیکا (Userbot RTC داخلی)
              </h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
              سرور رسمی <span className="font-mono text-slate-300">Bot API v3</span> روبیکا متدی برای ورود ربات به تماس صوتی ندارد. با وارد کردن شماره اکانت روبیکای ربات در همین بخش، سرور خودکار وارد حساب شده و هنگام زدن دکمه پخش یا ارسال دستور <span className="text-emerald-300 font-medium">پخش آهنگ</span>، مستقیماً داخل ویسکال گروه روبیکا رفته و آهنگ را زنده پخش می‌کند.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-[#0B0F17] border border-slate-800 rounded-lg p-1 shrink-0">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void onSaveConfig({rubikaMode: 'bot_api_v3'})}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                config.rubikaMode === 'bot_api_v3'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              ربات رسمی Bot API v3
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void onSaveConfig({rubikaMode: 'userbot_rubpy'})}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                config.rubikaMode === 'userbot_rubpy'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Userbot ویس‌چت زنده (rubpy)
            </button>
          </div>
        </div>

        {/* Live Bridge Status Readout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#0B0F17] border border-slate-800 rounded-lg p-4 text-xs">
          <div className="space-y-1">
            <span className="text-slate-400 block">وضعیت پل Userbot</span>
            <span
              className={
                userbotStatus?.connected ? 'text-emerald-400 font-semibold' : 'text-amber-300 font-medium'
              }
            >
              {userbotStatus?.connected
                ? 'متصل و آماده ویسکال روبیکا'
                : daemonInfo?.hasSession
                  ? 'سشن ذخیره شده · آماده اجرا'
                  : 'نیاز به ورود با شماره روبیکا'}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-slate-400 block">حساب متصل</span>
            <span className="text-slate-200 font-mono truncate block" dir="ltr">
              {userbotStatus?.accountName || daemonInfo?.accountName || 'وارد نشده'}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-slate-400 block">شناسه ویسکال روبیکا</span>
            <span className="text-slate-200 font-mono tabular-nums truncate block" dir="ltr">
              {userbotStatus?.activeVoiceChatId || '—'}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-slate-400 block">استریم زنده فعلی</span>
            <span className="text-slate-200 truncate block">
              {userbotStatus?.streamingTrack || 'در حال انتظار دستور پخش'}
            </span>
          </div>
        </div>

        {/* Audio & Voice Chat Libraries Status + 1-Click Installer */}
        <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-slate-200">
                وضعیت کتابخانه‌های صدا و ویسکال سرور
              </p>
              <p className="text-[11px] text-slate-400">
                پکیج‌های مورد نیاز پخش زنده، رمزگشایی صدا و استریم WebRTC در ویس‌چت روبیکا
              </p>
            </div>
            <button
              type="button"
              disabled={installingLibs || Boolean(daemonInfo?.installingRuntime)}
              onClick={() => void handleInstallAudioLibs()}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${installingLibs ? 'animate-spin' : ''}`} />
              <span>
                {installingLibs
                  ? 'در حال نصب کتابخانه‌های صدا...'
                  : daemonInfo?.runtimeReady
                    ? 'بررسی مجدد / به‌روزرسانی کتابخانه صدا'
                    : 'نصب کتابخانه صدا و ویسکال'}
              </span>
            </button>
          </div>

          {daemonInfo?.audioLibs && daemonInfo.audioLibs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {daemonInfo.audioLibs.map((lib) => (
                <span
                  key={lib.name}
                  dir="ltr"
                  className={`px-2.5 py-1 rounded text-[11px] font-mono border ${
                    lib.installed
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}
                >
                  {lib.name}
                  {lib.installed ? (lib.version ? ` v${lib.version}` : ' ✓') : ' (نصب نشده)'}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Interactive Phone + SMS OTP Login directly on server */}
        {!daemonInfo?.hasSession ? (
          <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>اتصال یک‌باره اکانت Userbot روبیکا (بدون نیاز به ترمینال)</span>
              </div>
              {daemonInfo && (
                <span className="text-[11px] text-slate-400">
                  {daemonInfo.runtimeReady ? 'موتور rubpy + FFmpeg روی سرور آماده است' : 'در حال آماده‌سازی موتور...'}
                </span>
              )}
            </div>

            {!codeHash ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  dir="ltr"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="09123456789"
                  className="flex-1 min-w-[180px] bg-[#111827] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 text-left outline-none"
                />
                {needsPassKey && (
                  <input
                    type="password"
                    dir="ltr"
                    value={passKeyInput}
                    onChange={(e) => setPassKeyInput(e.target.value)}
                    placeholder={passKeyHint ? `رمز دوم (${passKeyHint})` : 'رمز تایید دومرحله‌ای'}
                    className="flex-1 min-w-[160px] bg-[#111827] border border-amber-500/40 rounded-lg px-3 py-2 text-xs text-slate-100 text-left outline-none"
                  />
                )}
                <button
                  type="button"
                  disabled={authBusy || !phoneInput.trim()}
                  onClick={() => void handleSendOtp()}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{authBusy ? 'در حال ارسال...' : 'ارسال کد تایید روبیکا'}</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  dir="ltr"
                  value={smsCodeInput}
                  onChange={(e) => setSmsCodeInput(e.target.value)}
                  placeholder="کد تایید پیامکی (مثلاً 12345)"
                  className="flex-1 min-w-[180px] bg-[#111827] border border-emerald-500/40 rounded-lg px-3 py-2 text-xs font-mono text-emerald-300 text-left outline-none"
                />
                <button
                  type="button"
                  disabled={authBusy || !smsCodeInput.trim()}
                  onClick={() => void handleSignInOtp()}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{authBusy ? 'در حال تایید...' : 'تایید کد و اتصال به ویسکال'}</span>
                </button>
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => {
                    setCodeHash('');
                    setSmsCodeInput('');
                  }}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs whitespace-nowrap cursor-pointer"
                >
                  تغییر شماره
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-300">
                اکانت <strong className="text-emerald-400">{userbotStatus?.accountName || daemonInfo.accountName || 'Userbot'}</strong> روی سرور ذخیره شده است.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!daemonInfo.daemonRunning ? (
                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={() => void handleDaemonControl('start')}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>راه‌اندازی سرویس ویسکال</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={() => void handleDaemonControl('stop')}
                    className="px-3.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>توقف موقت استریمر</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => void handleDaemonControl('logout')}
                  className="px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>خروج از اکانت</span>
                </button>
              </div>
            </div>

            {userbotStatus?.availableGroups && userbotStatus.availableGroups.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <p className="text-xs text-slate-400">
                  گروه‌ها و کانال‌های شناسایی‌شده در اکانت روبیکا (برای اتصال فوری ویسکال کلیک کنید):
                </p>
                <div className="flex flex-wrap gap-2">
                  {userbotStatus.availableGroups.map((g) => {
                    const isSelected = activeGroup.rubikaChatId === g.chatGuid;
                    const isChannel = g.chatType === 'channel' || g.chatGuid.startsWith('c0');
                    return (
                      <button
                        key={g.chatGuid}
                        type="button"
                        disabled={authBusy}
                        onClick={() => void handleBindGroup(g.chatGuid, g.title)}
                        className={`px-3 py-1.5 rounded-lg text-xs border transition-colors whitespace-nowrap cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 font-semibold'
                            : 'bg-[#111827] border-slate-800 hover:border-slate-700 text-slate-200'
                        }`}
                      >
                        <span className="opacity-70 ml-1">{isChannel ? '[کانال]' : '[گروه]'}</span>
                        {g.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {authMsg && (
          <div
            className={`px-3.5 py-2.5 rounded-lg border text-xs ${
              authMsg.type === 'ok'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            {authMsg.text}
          </div>
        )}

        {userbotStatus?.lastError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3.5 py-2.5 text-xs text-red-300">
            {userbotStatus.lastError}
          </div>
        )}

        {/* Auto-Join & Bind Real Rubika Group or Channel via Invite Link / @Username */}
        <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Link2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>اتصال خودکار کانال یا گروه، ساخت کال و پخش زنده آهنگ</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                آیدی/لینک کانال (<span dir="ltr" className="font-mono text-slate-300">@Pari92i29mmm</span> یا <span dir="ltr" className="font-mono text-slate-300">https://rubika.ir/joinc/...</span>) یا لینک گروه (<span dir="ltr" className="font-mono text-slate-300">https://rubika.ir/joing/...</span>) را بفرستید تا ربات عضو شود، کال را باز کند و بلافاصله آهنگ پخش کند.
              </p>
            </div>

            {onOpenVoiceCallInGroup && (
              <button
                type="button"
                disabled={isBusy || inviteBusy}
                onClick={() => void onOpenVoiceCallInGroup()}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>باز کردن ویسکال و ارسال دکمه پیوستن در گپ</span>
              </button>
            )}
          </div>

          <form onSubmit={handleJoinInviteSubmit} className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              dir="ltr"
              value={inviteLinkInput}
              onChange={(e) => setInviteLinkInput(e.target.value)}
              placeholder="https://rubika.ir/joing/... یا @Pari92i29mmm"
              className="flex-1 min-w-[220px] bg-[#111827] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 text-left outline-none"
            />
            <button
              type="submit"
              disabled={inviteBusy || isBusy || !inviteLinkInput.trim()}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-emerald-600 border border-slate-700 hover:border-emerald-500 disabled:opacity-40 text-slate-100 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>{inviteBusy ? 'در حال ورود و پخش در کال...' : 'ورود، شروع کال و پخش آهنگ'}</span>
            </button>
          </form>

          {config.pendingJoinTargets && config.pendingJoinTargets.length > 0 && (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-1.5">
              <p className="text-[11px] font-semibold text-amber-300">
                صف عضویت خودکار (بلافاصله پس از ورود Userbot با شماره موبایل بالا خودکار عضو می‌شود):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {config.pendingJoinTargets.map((target) => (
                  <span
                    key={target}
                    dir="ltr"
                    className="px-2 py-0.5 rounded bg-[#111827] border border-amber-500/30 text-[11px] font-mono text-amber-200 truncate max-w-full"
                  >
                    {target}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span>{activeGroup.chatType === 'channel' || activeGroup.rubikaChatId.startsWith('c0') ? 'کانال فعال:' : 'گروه فعال:'}</span>
            <span className="text-slate-200 font-medium">{activeGroup.title}</span>
            <span>·</span>
            <span className="font-mono text-emerald-400" dir="ltr">
              {activeGroup.rubikaChatId}
            </span>
            {activeGroup.inviteLink && (
              <>
                <span>·</span>
                <span className="font-mono truncate max-w-[240px]" dir="ltr">
                  {activeGroup.inviteLink}
                </span>
              </>
            )}
          </div>

          {inviteMsg && (
            <div
              className={`px-3 py-2 rounded-lg border text-xs ${
                inviteMsg.type === 'ok'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : inviteMsg.type === 'queued'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}
            >
              {inviteMsg.text}
            </div>
          )}
        </div>

        {/* Secondary External Script Export (optional) */}
        <details className="border-t border-slate-800 pt-3">
          <summary className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer flex items-center gap-2 select-none">
            <Terminal className="w-3.5 h-3.5 text-slate-400" />
            <span>گزینه پیشرفته: دانلود و اجرای اسکریپت Userbot روی سرور شخصی جداگانه</span>
          </summary>
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-400">
                در صورت تمایل به اجرا روی سرور لینوکس/ویندوز شخصی:
              </span>
              <a
                href="/api/export/userbot-vc.py"
                download="rubika_userbot_vc.py"
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>دانلود rubika_userbot_vc.py</span>
              </a>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                dir="ltr"
                value={userbotRunCommand}
                className="flex-1 bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-emerald-300 text-left outline-none"
              />
              <button
                type="button"
                onClick={copyUserbotCmd}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                {copiedUserbotCmd ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedUserbotCmd ? 'کپی شد' : 'کپی دستور'}</span>
              </button>
            </div>
          </div>
        </details>
      </section>

      {/* Token & Rubika API Configuration */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-100">تنظیمات توکن و اتصال واقعی روبیکا</h3>
              <p className="text-xs text-slate-400 mt-1">
                ارتباط مستقیم با سرور رسمی <span className="font-mono">botapi.rubika.ir/v3</span> و پشتیبانی از ارسال واقعی فایل آهنگ در گروه
              </p>
            </div>
            <KeyRound className="w-5 h-5 text-emerald-400 shrink-0" />
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-300 mb-1.5">توکن ربات روبیکا (Rubika Bot Token)</label>
              <input
                type="text"
                dir="ltr"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3.5 py-2.5 text-xs font-mono text-emerald-300 outline-none text-left"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1.5">نام سازنده ربات</label>
                <input
                  type="text"
                  value={creatorInput}
                  onChange={(e) => setCreatorInput(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3.5 py-2 text-sm text-slate-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1.5">نام نمایشی ربات</label>
                <input
                  type="text"
                  value={botNameInput}
                  onChange={(e) => setBotNameInput(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3.5 py-2 text-sm text-slate-100 outline-none"
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={autoSyncEnabled}
                disabled={isBusy}
                onChange={(e) =>
                  void onSaveConfig({autoSyncAudioToRubika: e.target.checked})
                }
                className="accent-emerald-500 rounded cursor-pointer"
              />
              <span>ارسال خودکار فایل آهنگ به گروه روبیکا هنگام پخش در پنل</span>
            </label>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  onSaveConfig({
                    token: tokenInput,
                    creatorName: creatorInput,
                    botName: botNameInput,
                  })
                }
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium whitespace-nowrap cursor-pointer"
              >
                ذخیره تنظیمات
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={onVerifyToken}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>بررسی و اتصال توکن (getMe)</span>
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => onTogglePolling(config.pollingActive ? 'stop' : 'start')}
                className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  config.pollingActive
                    ? 'bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25'
                    : 'bg-amber-500 text-slate-950 hover:bg-amber-400 font-semibold'
                }`}
              >
                {config.pollingActive ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{config.pollingActive ? 'توقف دریافت پیام‌ها (Polling)' : 'شروع دریافت زنده پیام‌های روبیکا'}</span>
              </button>
            </div>
          </div>

          {/* Real API verification result */}
          {config.lastVerifyResult.checkedAt && (
            <div
              className={`p-3.5 rounded-lg border text-xs ${
                config.lastVerifyResult.verified
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {config.lastVerifyResult.verified
                    ? 'اتصال توکن به سرور روبیکا تایید شد'
                    : 'پاسخ سرور روبیکا در بررسی توکن'}
                </span>
                <div className="flex items-center gap-3">
                  {config.lastVerifyResult.verified && cleanUsername && (
                    <a
                      href={`https://rubika.ir/${cleanUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      dir="ltr"
                      className="font-mono text-emerald-300 hover:underline flex items-center gap-1"
                    >
                      <span>@{cleanUsername}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <span className="font-mono tabular-nums">
                    {new Date(config.lastVerifyResult.checkedAt).toLocaleTimeString('fa-IR')}
                  </span>
                </div>
              </div>
              <p className="mt-1.5 font-mono text-[11px] break-all opacity-90" dir="ltr">
                {config.lastVerifyResult.error || JSON.stringify(config.lastVerifyResult.botInfo)}
              </p>
            </div>
          )}
        </div>

        {/* Webhook + Direct Send to Rubika Group */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Webhook className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-slate-100">آدرس Webhook رسمی روبیکا</h3>
            </div>
            <p className="text-xs text-slate-400">
              این آدرس را می‌توانید در پنل ربات‌ساز روبیکا تنظیم کنید تا پیام‌های گروه‌ها آنی دریافت شوند:
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                dir="ltr"
                value={webhookUrl}
                className="flex-1 bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 text-left outline-none"
              />
              <button
                type="button"
                onClick={copyWebhook}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                {copiedWebhook ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedWebhook ? 'کپی شد' : 'کپی'}</span>
              </button>
            </div>
          </div>

          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-100">ارسال مستقیم پیام تست به گروه روبیکا</h3>
            <input
              type="text"
              dir="ltr"
              value={directChatId}
              onChange={(e) => setDirectChatId(e.target.value)}
              placeholder="Rubika Chat ID"
              className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 text-left outline-none"
            />
            <textarea
              rows={2}
              value={directText}
              onChange={(e) => setDirectText(e.target.value)}
              className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none resize-none"
            />
            <button
              type="button"
              disabled={isBusy || !directChatId.trim() || !directText.trim()}
              onClick={() => onSendDirectRubika(directChatId, directText)}
              className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>ارسال به روبیکا (sendMessage)</span>
            </button>
          </div>
        </div>
      </section>

      {/* Real Rubika API Request Log */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-100">گزارش واقعی ارتباط با API روبیکا</h3>
          <span className="text-xs text-slate-400 font-mono tabular-nums">{config.apiLogs.length} رویداد</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400">
                <th className="py-2 px-3 font-medium">زمان</th>
                <th className="py-2 px-3 font-medium">متد API</th>
                <th className="py-2 px-3 font-medium">وضعیت</th>
                <th className="py-2 px-3 font-medium">جزئیات پاسخ سرور</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {config.apiLogs.slice(0, 20).map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30">
                  <td className="py-2.5 px-3 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString('fa-IR')}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-200 whitespace-nowrap">{log.method}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span
                      className={
                        log.status === 'ok'
                          ? 'text-emerald-400'
                          : log.status === 'error'
                            ? 'text-red-400'
                            : 'text-slate-300'
                      }
                    >
                      {log.status === 'ok' ? 'موفق' : log.status === 'error' ? 'خطا' : 'اطلاعات'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-300 max-w-xl truncate">{log.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
