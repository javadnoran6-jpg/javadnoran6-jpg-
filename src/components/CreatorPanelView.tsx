import React, {useEffect, useMemo, useState} from 'react';
import {
  CheckCircle2,
  Crown,
  Download,
  Headphones,
  Link2,
  Lock,
  Megaphone,
  Music2,
  PhoneCall,
  PhoneOff,
  Power,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldPlus,
  Terminal,
  Trash2,
  Unlock,
  UserMinus,
  Users,
} from 'lucide-react';
import {BotConfigState, GroupState, Track} from '../types/bot';

interface CreatorPanelViewProps {
  config: BotConfigState;
  activeGroup: GroupState;
  isBusy: boolean;
  onSaveConfig: (patch: {
    creatorName?: string;
    creatorUsername?: string;
    creatorRubikaGuid?: string;
    botName?: string;
    botUsername?: string;
    botEnabled?: boolean;
    globalDailyPlayLimit?: number;
    activeGroupId?: string;
  }) => Promise<void>;
  onRunCommand: (payload: {
    senderId?: string;
    text: string;
    sendToRubika?: boolean;
    allowBroadcastText?: boolean;
  }) => Promise<void>;
  onJoinInvite: (
    inviteLink: string,
    songQuery?: string,
  ) => Promise<{ok: boolean; queued?: boolean; error?: string; group?: GroupState; startedTrack?: Track}>;
  onRefreshState: () => Promise<void>;
  onNotify: (msg: string) => void;
  onNavigateTab: (tab: 'voice' | 'chat' | 'analytics' | 'groups' | 'rubika' | 'apk') => void;
}

export const CreatorPanelView: React.FC<CreatorPanelViewProps> = ({
  config,
  activeGroup,
  isBusy,
  onSaveConfig,
  onRunCommand,
  onJoinInvite,
  onRefreshState,
  onNotify,
  onNavigateTab,
}) => {
  const [creatorNameInput, setCreatorNameInput] = useState(config.creatorName);
  const [creatorUsernameInput, setCreatorUsernameInput] = useState(
    config.creatorUsername || '@Paria25805',
  );
  const [creatorGuidInput, setCreatorGuidInput] = useState(config.creatorRubikaGuid || '');
  const [botNameInput, setBotNameInput] = useState(config.botName);
  const [botUsernameInput, setBotUsernameInput] = useState(config.botUsername);
  const [globalLimitInput, setGlobalLimitInput] = useState(
    String(config.globalDailyPlayLimit ?? 10),
  );

  const [sudoInput, setSudoInput] = useState('');
  const [resolveBusy, setResolveBusy] = useState(false);

  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastScope, setBroadcastScope] = useState<'all' | 'groups' | 'channels'>('all');
  const [attachCurrentTrack, setAttachCurrentTrack] = useState(false);
  const [broadcastBusy, setBroadcastBusy] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{
    sentCount: number;
    failedCount: number;
    details: Array<{title: string; rubikaChatId: string; ok: boolean; error?: string}>;
  } | null>(null);

  const [groupSearch, setGroupSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<'all' | 'groups' | 'channels' | 'vc_active'>('all');
  const [quickJoinInput, setQuickJoinInput] = useState('');
  const [quickJoinBusy, setQuickJoinBusy] = useState(false);

  const [creatorCmdInput, setCreatorCmdInput] = useState('');
  const [logFilter, setLogFilter] = useState<'all' | 'ok' | 'error'>('all');
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);

  useEffect(() => {
    setCreatorNameInput(config.creatorName);
    setCreatorUsernameInput(config.creatorUsername || '@Paria25805');
    setCreatorGuidInput(config.creatorRubikaGuid || '');
    setBotNameInput(config.botName);
    setBotUsernameInput(config.botUsername);
    setGlobalLimitInput(String(config.globalDailyPlayLimit ?? 10));
  }, [
    config.creatorName,
    config.creatorUsername,
    config.creatorRubikaGuid,
    config.botName,
    config.botUsername,
    config.globalDailyPlayLimit,
  ]);

  const allGroups = useMemo(() => Object.values(config.groups), [config.groups]);
  const activeVcCount = useMemo(
    () => allGroups.filter((g) => g.voiceCallActive).length,
    [allGroups],
  );
  const channelCount = useMemo(
    () => allGroups.filter((g) => g.chatType === 'channel' || g.rubikaChatId.startsWith('c0')).length,
    [allGroups],
  );
  const groupCount = useMemo(
    () => allGroups.filter((g) => g.rubikaChatId.startsWith('g0')).length,
    [allGroups],
  );
  const totalMembers = useMemo(
    () => allGroups.reduce((acc, g) => acc + g.members.length, 0),
    [allGroups],
  );

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    return allGroups.filter((g) => {
      const isChannel = g.chatType === 'channel' || g.rubikaChatId.startsWith('c0');
      if (groupFilter === 'groups' && isChannel) return false;
      if (groupFilter === 'channels' && !isChannel) return false;
      if (groupFilter === 'vc_active' && !g.voiceCallActive) return false;
      if (!q) return true;
      return (
        g.title.toLowerCase().includes(q) ||
        g.rubikaChatId.toLowerCase().includes(q) ||
        (g.channelUsername || '').toLowerCase().includes(q)
      );
    });
  }, [allGroups, groupSearch, groupFilter]);

  const filteredLogs = useMemo(() => {
    return (config.apiLogs || []).filter((l) => {
      if (logFilter === 'ok') return l.status === 'ok';
      if (logFilter === 'error') return l.status === 'error';
      return true;
    });
  }, [config.apiLogs, logFilter]);

  const botEnabled = config.botEnabled !== false;

  const handleResolveCreatorGuid = async () => {
    setResolveBusy(true);
    try {
      const res = await fetch('/api/creator/resolve-rubika', {method: 'POST'});
      const data = (await res.json()) as {
        ok?: boolean;
        creatorRubikaGuid?: string;
        name?: string;
        error?: string;
      };
      await onRefreshState();
      if (res.ok && data.ok && data.creatorRubikaGuid) {
        setCreatorGuidInput(data.creatorRubikaGuid);
        onNotify(
          `شناسه واقعی سازنده در روبیکا دریافت شد: ${data.creatorRubikaGuid}${data.name ? ` (${data.name})` : ''}`,
        );
      } else {
        onNotify(data.error || 'استعلام شناسه روبیکای سازنده انجام نشد.');
      }
    } finally {
      setResolveBusy(false);
    }
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastText.trim()) return;
    setBroadcastBusy(true);
    setBroadcastResult(null);
    try {
      const res = await fetch('/api/creator/broadcast', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          text: broadcastText.trim(),
          targetScope: broadcastScope,
          attachTrack: attachCurrentTrack ? activeGroup.currentTrack : null,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        sentCount?: number;
        failedCount?: number;
        details?: Array<{title: string; rubikaChatId: string; ok: boolean; error?: string}>;
        error?: string;
      };
      await onRefreshState();
      if (res.ok) {
        setBroadcastResult({
          sentCount: data.sentCount || 0,
          failedCount: data.failedCount || 0,
          details: data.details || [],
        });
        onNotify(`ارسال همگانی به ${data.sentCount || 0} گروه/کانال انجام شد.`);
      } else {
        onNotify(data.error || 'خطا در ارسال همگانی.');
      }
    } finally {
      setBroadcastBusy(false);
    }
  };

  const handleCreatorApiAction = async (
    key: string,
    url: string,
    init: RequestInit,
    successMsg: string,
  ) => {
    setActionBusyKey(key);
    try {
      const res = await fetch(url, init);
      const data = (await res.json()) as {ok?: boolean; error?: string; stoppedCount?: number};
      await onRefreshState();
      if (res.ok && data.ok !== false) {
        onNotify(successMsg);
      } else {
        onNotify(data.error || 'خطا در اجرای عملیات سازنده.');
      }
    } finally {
      setActionBusyKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top 4-KPI Summary Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400">هویت سازنده کل سیستم</p>
          <p className="text-base font-bold text-amber-300 mt-1 truncate">
            {config.creatorUsername || '@Paria25805'}
          </p>
          <p className="text-xs text-slate-400 mt-1 truncate">
            {config.creatorName}
            {config.creatorRubikaGuid ? ` · ${config.creatorRubikaGuid.slice(0, 10)}...` : ' · منتظر اتصال یا تایید'}
          </p>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400">چت‌های متصل و اعضا</p>
          <p className="text-base font-bold text-slate-100 mt-1 tabular-nums">
            {allGroups.length} چت ({groupCount} گروه · {channelCount} کانال)
          </p>
          <p className="text-xs text-slate-400 mt-1 tabular-nums">
            {totalMembers} عضو ثبت‌شده · {activeVcCount} ویسکال فعال
          </p>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <p className="text-xs text-slate-400">کلید سراسری ربات</p>
            <p className={`text-base font-bold mt-1 ${botEnabled ? 'text-emerald-400' : 'text-red-400'}`}>
              {botEnabled ? 'روشن و آماده پاسخگویی' : 'خاموش (حالت تعمیرات)'}
            </p>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void onSaveConfig({botEnabled: !botEnabled})}
            className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              botEnabled
                ? 'bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{botEnabled ? 'خاموش کردن سراسری ربات' : 'روشن کردن سراسری ربات'}</span>
          </button>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <p className="text-xs text-slate-400">پشتیبانی و کنترل فوری</p>
            <p className="text-xs text-slate-300 mt-1 tabular-nums">
              {config.userbotStatus?.connected ? 'Userbot متصل' : 'Userbot آفلاین'} ·{' '}
              {config.pollingActive ? 'Polling فعال' : 'Polling متوقف'}
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={isBusy || actionBusyKey === 'stop-all'}
              onClick={() =>
                void handleCreatorApiAction(
                  'stop-all',
                  '/api/creator/stop-all-calls',
                  {method: 'POST'},
                  'تمامی ویسکال‌های فعال در گروه‌ها و کانال‌ها قطع شدند.',
                )
              }
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-200 hover:text-red-200 border border-slate-700 text-xs font-medium flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <PhoneOff className="w-3.5 h-3.5 text-red-400" />
              <span>قطع همه کال‌ها</span>
            </button>
            <a
              href="/api/creator/backup"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-xs font-medium flex items-center justify-center gap-1 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>بکاپ</span>
            </a>
          </div>
        </div>
      </section>

      {/* Creator Identity, Sudo Users & Global Controls */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onSaveConfig({
              creatorName: creatorNameInput,
              creatorUsername: creatorUsernameInput,
              creatorRubikaGuid: creatorGuidInput,
              botName: botNameInput,
              botUsername: botUsernameInput,
              globalDailyPlayLimit: Math.max(0, Number(globalLimitInput) || 10),
            });
          }}
          className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400" />
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  تنظیمات سازنده و هویت کل ({config.creatorUsername || '@Paria25805'})
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  هر دستوری در گروه‌ها، کانال‌ها یا پیوی از سمت این آیدی یا GUID ارسال شود، با بالاترین سطح دسترسی سازنده اجرا می‌شود و مشمول قفل‌ها نمی‌شود.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-400">نام نمایشی سازنده</label>
              <input
                type="text"
                value={creatorNameInput}
                onChange={(e) => setCreatorNameInput(e.target.value)}
                className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">آیدی روبیکای سازنده (@username)</label>
              <input
                type="text"
                dir="ltr"
                value={creatorUsernameInput}
                onChange={(e) => setCreatorUsernameInput(e.target.value)}
                placeholder="@Paria25805"
                className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-amber-300 outline-none text-left"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-slate-400">شناسه GUID سازنده در روبیکا (u0...)</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  dir="ltr"
                  value={creatorGuidInput}
                  onChange={(e) => setCreatorGuidInput(e.target.value)}
                  placeholder="u0... (با اتصال Userbot خودکار استعلام می‌شود)"
                  className="flex-1 min-w-[200px] bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 outline-none text-left"
                />
                <button
                  type="button"
                  disabled={resolveBusy || isBusy}
                  onClick={() => void handleResolveCreatorGuid()}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-emerald-300 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${resolveBusy ? 'animate-spin' : ''}`} />
                  <span>{resolveBusy ? 'در حال استعلام...' : 'دریافت GUID از روبیکا'}</span>
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">نام ربات</label>
              <input
                type="text"
                value={botNameInput}
                onChange={(e) => setBotNameInput(e.target.value)}
                className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">یوزرنیم ربات</label>
              <input
                type="text"
                dir="ltr"
                value={botUsernameInput}
                onChange={(e) => setBotUsernameInput(e.target.value)}
                className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 outline-none text-left"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">سهمیه پخش روزانه پیش‌فرض (0 = نامحدود)</label>
              <input
                type="number"
                min={0}
                max={9999}
                value={globalLimitInput}
                onChange={(e) => setGlobalLimitInput(e.target.value)}
                className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 outline-none tabular-nums"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={isBusy}
                className="w-full py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
              >
                ذخیره تنظیمات سازنده
              </button>
            </div>
          </div>

          {/* Sudo / Co-Creators Management */}
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <ShieldPlus className="w-3.5 h-3.5 text-emerald-400" />
                <span>همکاران سازنده / سودو (Sudo)</span>
              </div>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {(config.sudoUserIds || []).length} کاربر سودو
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                dir="ltr"
                value={sudoInput}
                onChange={(e) => setSudoInput(e.target.value)}
                placeholder="@username یا u0..."
                className="flex-1 min-w-[180px] bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 outline-none text-left"
              />
              <button
                type="button"
                disabled={isBusy || !sudoInput.trim()}
                onClick={async () => {
                  const target = sudoInput.trim();
                  setSudoInput('');
                  await handleCreatorApiAction(
                    'sudo-add',
                    '/api/creator/sudo',
                    {
                      method: 'POST',
                      headers: {'Content-Type': 'application/json'},
                      body: JSON.stringify({action: 'add', target}),
                    },
                    `دسترسی همکار سازنده (Sudo) برای «${target}» اضافه شد.`,
                  );
                }}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-emerald-300 text-xs font-medium whitespace-nowrap cursor-pointer"
              >
                افزودن سودو
              </button>
            </div>

            {(config.sudoUserIds || []).length > 0 ? (
              <div className="divide-y divide-slate-800/80 bg-[#0B0F17] border border-slate-800 rounded-lg px-3">
                {(config.sudoUserIds || []).map((su) => (
                  <div key={su} className="py-2 flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-slate-200" dir="ltr">
                      {su}
                    </span>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void handleCreatorApiAction(
                          `sudo-rm-${su}`,
                          '/api/creator/sudo',
                          {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({action: 'remove', target: su}),
                          },
                          `دسترسی سودو «${su}» حذف شد.`,
                        )
                      }
                      className="text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                      <span>حذف</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">
                فعلاً فقط آیدی اصلی سازنده ({config.creatorUsername || '@Paria25805'}) دسترسی کامل کل سیستم را دارد.
              </p>
            )}
          </div>
        </form>

        {/* Broadcast Engine + System Maintenance Actions */}
        <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-emerald-400" />
            <div>
              <h2 className="text-base font-semibold text-slate-100">ارسال همگانی به گروه‌ها و کانال‌ها</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                ارسال پیام و آهنگ همزمان به تمام گروه‌ها و کانال‌های متصل در روبیکا
              </p>
            </div>
          </div>

          <form onSubmit={handleBroadcast} className="space-y-3">
            <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
              {(
                [
                  {id: 'all', label: 'همه چت‌ها'},
                  {id: 'groups', label: 'فقط گروه‌ها'},
                  {id: 'channels', label: 'فقط کانال‌ها'},
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setBroadcastScope(opt.id)}
                  className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    broadcastScope === opt.id
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <textarea
              rows={3}
              value={broadcastText}
              onChange={(e) => setBroadcastText(e.target.value)}
              placeholder="متن پیام همگانی از طرف سازنده را بنویسید..."
              className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none resize-none"
            />

            {activeGroup.currentTrack && (
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={attachCurrentTrack}
                  onChange={(e) => setAttachCurrentTrack(e.target.checked)}
                  className="rounded border-slate-700 bg-[#0B0F17] text-emerald-500"
                />
                <span className="truncate">
                  پیوست فایل آهنگ فعلی ({activeGroup.currentTrack.title})
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={broadcastBusy || isBusy || !broadcastText.trim()}
              className="w-full py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{broadcastBusy ? 'در حال ارسال همگانی...' : 'ارسال همگانی به روبیکا'}</span>
            </button>
          </form>

          {broadcastResult && (
            <div className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-200 font-medium tabular-nums">
                <span>گزارش ارسال همگانی:</span>
                <span>
                  {broadcastResult.sentCount} موفق · {broadcastResult.failedCount} خطا
                </span>
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1 text-[11px]">
                {broadcastResult.details.map((d) => (
                  <div key={d.rubikaChatId} className="flex items-center justify-between gap-2">
                    <span className="text-slate-300 truncate">{d.title}</span>
                    <span className={d.ok ? 'text-emerald-400 shrink-0' : 'text-red-400 shrink-0'}>
                      {d.ok ? 'ارسال شد' : d.error || 'خطا'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* System Tools */}
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <p className="text-xs font-semibold text-slate-300">ابزارهای سیستمی سازنده</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isBusy || actionBusyKey === 'sync-catalog'}
                onClick={() =>
                  void handleCreatorApiAction(
                    'sync-catalog',
                    '/api/music/catalog/sync',
                    {
                      method: 'POST',
                      headers: {'Content-Type': 'application/json'},
                      body: JSON.stringify({targetCount: 1500}),
                    },
                    'همگام‌سازی و گسترش بانک آهنگ‌های ربات انجام شد.',
                  )
                }
                className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Music2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>آپدیت کاتالوگ موزیک</span>
              </button>

              <button
                type="button"
                disabled={isBusy || actionBusyKey === 'clear-msgs'}
                onClick={() =>
                  void handleCreatorApiAction(
                    'clear-msgs',
                    `/api/creator/groups/${encodeURIComponent(activeGroup.groupId)}/clear-messages`,
                    {method: 'POST'},
                    `پیام‌های پنل گروه «${activeGroup.title}» پاکسازی شد.`,
                  )
                }
                className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-amber-400" />
                <span>پاکسازی چت گروه فعال</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Master Groups & Channels Control Table */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                مدیریت متمرکز همه گروه‌ها، کانال‌ها، اشتراک‌ها و ویسکال‌ها
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                کنترل مستقیم وضعیت ویسکال، تمدید اشتراک، سهمیه روزانه، دسترسی عمومی و اتصال گروه/کانال جدید
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder="جستجو در گروه‌ها و کانال‌ها..."
                className="bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg pr-8 pl-3 py-1.5 text-xs text-slate-100 outline-none w-52"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
              {(
                [
                  {id: 'all', label: 'همه'},
                  {id: 'groups', label: 'گروه‌ها'},
                  {id: 'channels', label: 'کانال‌ها'},
                  {id: 'vc_active', label: 'ویسکال فعال'},
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setGroupFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                    groupFilter === tab.id
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Join Link / Channel Input */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!quickJoinInput.trim()) return;
            setQuickJoinBusy(true);
            try {
              const res = await onJoinInvite(quickJoinInput.trim());
              if (res.ok) setQuickJoinInput('');
            } finally {
              setQuickJoinBusy(false);
            }
          }}
          className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-[#0B0F17] border border-slate-800"
        >
          <Link2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <input
            type="text"
            dir="ltr"
            value={quickJoinInput}
            onChange={(e) => setQuickJoinInput(e.target.value)}
            placeholder="https://rubika.ir/joing/... یا @ChannelUsername"
            className="flex-1 min-w-[220px] bg-[#111827] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 outline-none text-left"
          />
          <button
            type="submit"
            disabled={quickJoinBusy || isBusy || !quickJoinInput.trim()}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium whitespace-nowrap cursor-pointer"
          >
            {quickJoinBusy ? 'در حال ورود و پخش...' : 'ورود سریع، کال و پخش آهنگ'}
          </button>
        </form>

        {/* Groups Table */}
        <div className="divide-y divide-slate-800/80">
          {filteredGroups.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              گروه یا کانالی مطابق جستجوی شما یافت نشد.
            </div>
          ) : (
            filteredGroups.map((g) => {
              const isChannel = g.chatType === 'channel' || g.rubikaChatId.startsWith('c0');
              const isSelected = g.groupId === activeGroup.groupId;
              const daysLeft = Math.max(
                0,
                Math.ceil((new Date(g.subscription.expiresAt).getTime() - Date.now()) / 86400000),
              );
              const dailyLim = g.dailyPlayLimit ?? config.globalDailyPlayLimit ?? 10;

              return (
                <div
                  key={g.groupId}
                  className={`py-3.5 px-3 rounded-lg flex flex-col xl:flex-row xl:items-center justify-between gap-3 ${
                    isSelected ? 'bg-emerald-500/5' : 'hover:bg-slate-900/40'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-slate-100 truncate">{g.title}</span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-400">
                        {isChannel ? 'کانال' : g.rubikaChatId.startsWith('u0') ? 'پیوی' : 'گروه'}
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs font-mono text-slate-400" dir="ltr">
                        {g.rubikaChatId}
                      </span>
                      {g.channelUsername && (
                        <>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="text-xs font-mono text-emerald-400" dir="ltr">
                            @{g.channelUsername.replace(/^@/, '')}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
                      <span className={g.voiceCallActive ? 'text-emerald-400 font-medium' : ''}>
                        {g.voiceCallActive ? 'ویسکال فعال' : 'ویسکال خاموش'}
                      </span>
                      <span>·</span>
                      <span>{g.members.length} عضو</span>
                      <span>·</span>
                      <span>
                        اشتراک: {daysLeft >= 1000 ? 'دائمی' : `${daysLeft} روز`}
                      </span>
                      <span>·</span>
                      <span>
                        سهمیه روزانه: {dailyLim >= 9999 || dailyLim === 0 ? 'نامحدود' : `${g.dailyPlayCount || 0}/${dailyLim}`}
                      </span>
                      <span>·</span>
                      <span>{g.publicAccess === 'open' ? 'دسترسی باز' : 'دسترسی قفل'}</span>
                      {g.currentTrack && (
                        <>
                          <span>·</span>
                          <span className="text-slate-200 truncate max-w-[220px]">
                            در حال پخش: {g.currentTrack.title}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void onSaveConfig({activeGroupId: g.groupId})}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      {isSelected ? 'گروه فعال' : 'انتخاب'}
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void handleCreatorApiAction(
                          `vc-${g.groupId}`,
                          `/api/creator/groups/${encodeURIComponent(g.groupId)}/voice-call`,
                          {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({action: g.voiceCallActive ? 'stop' : 'start'}),
                          },
                          g.voiceCallActive
                            ? `ویسکال «${g.title}» قطع شد.`
                            : `ویسکال «${g.title}» فعال شد.`,
                        )
                      }
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                        g.voiceCallActive
                          ? 'bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30'
                          : 'bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {g.voiceCallActive ? <PhoneOff className="w-3.5 h-3.5" /> : <PhoneCall className="w-3.5 h-3.5" />}
                      <span>{g.voiceCallActive ? 'قطع کال' : 'شروع کال'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void handleCreatorApiAction(
                          `sub30-${g.groupId}`,
                          `/api/creator/groups/${encodeURIComponent(g.groupId)}/subscription`,
                          {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({addDays: 30}),
                          },
                          `اشتراک «${g.title}» ۳۰ روز تمدید شد.`,
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium whitespace-nowrap cursor-pointer"
                    >
                      +۳۰ روز اشتراک
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void handleCreatorApiAction(
                          `unlim-${g.groupId}`,
                          `/api/creator/groups/${encodeURIComponent(g.groupId)}/subscription`,
                          {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({setUnlimited: true, dailyPlayLimit: 9999}),
                          },
                          `اشتراک و سهمیه «${g.title}» دائمی و نامحدود شد.`,
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-medium whitespace-nowrap cursor-pointer"
                    >
                      نامحدود
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        void handleCreatorApiAction(
                          `acc-${g.groupId}`,
                          `/api/creator/groups/${encodeURIComponent(g.groupId)}/subscription`,
                          {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({
                              publicAccess: g.publicAccess === 'open' ? 'locked' : 'open',
                            }),
                          },
                          `دسترسی عمومی «${g.title}» ${g.publicAccess === 'open' ? 'قفل' : 'باز'} شد.`,
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      {g.publicAccess === 'open' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      <span>{g.publicAccess === 'open' ? 'قفل' : 'باز'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        await onSaveConfig({activeGroupId: g.groupId});
                        onNavigateTab('groups');
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>اعضا</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        await onSaveConfig({activeGroupId: g.groupId});
                        onNavigateTab('voice');
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      <Headphones className="w-3.5 h-3.5" />
                      <span>استودیو</span>
                    </button>

                    {allGroups.length > 1 && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          void handleCreatorApiAction(
                            `del-${g.groupId}`,
                            `/api/creator/groups/${encodeURIComponent(g.groupId)}`,
                            {method: 'DELETE'},
                            `گروه «${g.title}» از پنل حذف شد.`,
                          )
                        }
                        className="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 cursor-pointer"
                        title="حذف گروه از پنل"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Creator God-Mode Command Console & Real API Logs */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <div>
              <h3 className="text-base font-semibold text-slate-100">کنسول اجرای مستقیم دستورات سازنده</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                اجرای مستقیم دستورات روی «{activeGroup.title}» با هویت سازنده ({config.creatorUsername || '@Paria25805'})
              </p>
            </div>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!creatorCmdInput.trim()) return;
              const txt = creatorCmdInput.trim();
              setCreatorCmdInput('');
              await onRunCommand({
                senderId: config.creatorId,
                text: txt,
                sendToRubika: Boolean(config.pollingActive),
                allowBroadcastText: true,
              });
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={creatorCmdInput}
              onChange={(e) => setCreatorCmdInput(e.target.value)}
              placeholder="مثلاً: تمدید اشتراک 30 یا تنظیم مدیر @username..."
              className="flex-1 bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none"
            />
            <button
              type="submit"
              disabled={isBusy || !creatorCmdInput.trim()}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium whitespace-nowrap cursor-pointer"
            >
              اجرا
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {[
              'پنل سازنده',
              'آمار کل',
              'ساخت کال',
              'پخش رندوم',
              'اشتراک نامحدود',
              'سهمیه نامحدود',
              'قفل لینک',
              'حذف 100',
              'مدیران',
            ].map((cmdLabel) => (
              <button
                key={cmdLabel}
                type="button"
                disabled={isBusy}
                onClick={() =>
                  void onRunCommand({
                    senderId: config.creatorId,
                    text: cmdLabel,
                    sendToRubika: Boolean(config.pollingActive),
                    allowBroadcastText: true,
                  })
                }
                className="px-2.5 py-1.5 rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 whitespace-nowrap cursor-pointer"
              >
                {cmdLabel}
              </button>
            ))}
          </div>

          <div className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs text-slate-300 space-y-1">
            <p className="font-semibold text-amber-300">دستورات قابل تایپ مستقیم در روبیکا توسط {config.creatorUsername || '@Paria25805'}:</p>
            <p className="text-slate-400 leading-relaxed">
              پنل سازنده · تنظیم مالک (ریپلای) · تنظیم مدیر @آیدی · حذف مدیر @آیدی · تمدید اشتراک 30 · اشتراک نامحدود · سهمیه نامحدود · ارسال همگانی متن · ربات خاموش / روشن · قطع همه ویسکال ها · آمار کل
            </p>
          </div>
        </div>

        {/* Live API & Bridge Logs */}
        <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h3 className="text-base font-semibold text-slate-100">
                گزارش زنده رویدادها و API روبیکا ({filteredLogs.length})
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
                {(
                  [
                    {id: 'all', label: 'همه'},
                    {id: 'ok', label: 'موفق'},
                    {id: 'error', label: 'خطا'},
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setLogFilter(f.id)}
                    className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                      logFilter === f.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  void handleCreatorApiAction(
                    'clear-logs',
                    '/api/creator/logs',
                    {method: 'DELETE'},
                    'لاگ‌های سیستم پاکسازی شد.',
                  )
                }
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs whitespace-nowrap cursor-pointer"
              >
                پاکسازی لاگ‌ها
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-800/80 max-h-72 overflow-y-auto pr-1">
            {filteredLogs.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">لاگی در این فیلتر ثبت نشده است.</p>
            ) : (
              filteredLogs.slice(0, 40).map((log) => (
                <div key={log.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono text-[11px] font-semibold ${
                          log.status === 'error'
                            ? 'text-red-400'
                            : log.status === 'ok'
                              ? 'text-emerald-400'
                              : 'text-amber-300'
                        }`}
                      >
                        {log.method}
                      </span>
                      <span className="text-slate-400 text-[11px] tabular-nums font-mono">
                        {new Date(log.timestamp).toLocaleTimeString('fa-IR')}
                      </span>
                    </div>
                    <p className="text-slate-300 break-words">{log.detail}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
