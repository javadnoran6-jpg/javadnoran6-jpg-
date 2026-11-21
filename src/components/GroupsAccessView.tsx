import React, {useState} from 'react';
import {
  AlertTriangle,
  Calendar,
  Crown,
  Link2,
  Lock,
  PhoneCall,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Unlock,
  UserPlus,
  VolumeX,
  X,
} from 'lucide-react';
import {BotConfigState, GroupModerationLocks, GroupState, Track, UserRole} from '../types/bot';

interface GroupsAccessViewProps {
  config: BotConfigState;
  activeGroup: GroupState;
  isBusy: boolean;
  onSelectGroup: (groupId: string) => Promise<void>;
  onAddGroup: (payload: {title: string; rubikaChatId: string; daysValid: number}) => Promise<void>;
  onAddMember: (groupId: string, payload: {name: string; userId: string; role: UserRole}) => Promise<void>;
  onRunCommand: (payload: {senderId: string; text: string; replyToSenderId?: string}) => Promise<void>;
  onJoinInvite?: (
    inviteLink: string,
    songQuery?: string,
  ) => Promise<{ok: boolean; queued?: boolean; error?: string; group?: GroupState; startedTrack?: Track}>;
  onOpenVoiceCallInGroup?: () => Promise<void>;
  onUpdateModeration?: (payload: {
    locks?: GroupModerationLocks;
    addFilterWord?: string;
    removeFilterWord?: string;
    unmuteUserId?: string;
    clearWarnings?: boolean;
    clearViolations?: boolean;
    deleteRecentCount?: number;
  }) => Promise<void>;
  onSetAdminRole?: (payload: {
    targetUserOrUsername: string;
    adminAction: 'SetAdmin' | 'UnsetAdmin';
    targetNameHint?: string;
  }) => Promise<{ok: boolean; message?: string; error?: string}>;
  onSyncMembers?: () => Promise<{ok: boolean; error?: string}>;
}

const ROLE_LABELS: Record<UserRole, string> = {
  creator: 'سازنده ربات',
  owner: 'مالک گروه',
  admin: 'ادمین',
  vip: 'کاربر ویژه',
  member: 'کاربر عادی',
};

export const GroupsAccessView: React.FC<GroupsAccessViewProps> = ({
  config,
  activeGroup,
  isBusy,
  onSelectGroup,
  onAddGroup,
  onAddMember,
  onRunCommand,
  onJoinInvite,
  onOpenVoiceCallInGroup,
  onUpdateModeration,
  onSetAdminRole,
  onSyncMembers,
}) => {
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [newGroupChatId, setNewGroupChatId] = useState('');
  const [newGroupDays, setNewGroupDays] = useState(30);
  const [inviteLinkInput, setInviteLinkInput] = useState(activeGroup.inviteLink || '');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<{
    type: 'ok' | 'queued' | 'error';
    text: string;
  } | null>(null);

  const [memberName, setMemberName] = useState('');
  const [memberId, setMemberId] = useState('');
  const [memberRole, setMemberRole] = useState<UserRole>('member');
  const [filterWordInput, setFilterWordInput] = useState('');

  const [adminTargetInput, setAdminTargetInput] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [adminFeedback, setAdminFeedback] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);

  const expiresDate = new Date(activeGroup.subscription.expiresAt);
  const purchasedDate = new Date(activeGroup.subscription.purchasedAt);
  const remainingDays = Math.max(
    0,
    Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );

  return (
    <div className="space-y-6">
      {/* Subscription & Access Overview */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400">مالک فعلی گروه</p>
          <p className="text-base font-semibold text-slate-100 mt-1 truncate">{activeGroup.ownerName}</p>
          <p className="text-xs font-mono text-slate-400 mt-1">{activeGroup.ownerId}</p>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400">تاریخ خرید اشتراک</p>
          <p className="text-base font-semibold text-slate-100 mt-1 tabular-nums">
            {purchasedDate.toLocaleDateString('fa-IR')}
          </p>
          <p className="text-xs text-slate-400 mt-1">{activeGroup.subscription.planName}</p>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400">انقضا و روزهای باقیمانده</p>
          <p className="text-base font-semibold text-emerald-400 mt-1 tabular-nums">
            {remainingDays} روز باقیمانده
          </p>
          <p className="text-xs text-slate-400 mt-1 tabular-nums">
            انقضا: {expiresDate.toLocaleDateString('fa-IR')}
          </p>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <p className="text-xs text-slate-400">دسترسی عمومی گروه</p>
            <p className="text-base font-semibold text-slate-100 mt-1">
              {activeGroup.publicAccess === 'open' ? 'باز برای همه اعضا' : 'قفل (فقط ویژه و ادمین)'}
            </p>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={() =>
              onRunCommand({
                senderId: config.creatorId,
                text: activeGroup.publicAccess === 'open' ? 'دسترسی عموم قفل باشد' : 'دسترسی عموم باز',
              })
            }
            className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
              activeGroup.publicAccess === 'open'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
                : 'bg-emerald-600 text-white hover:bg-emerald-500'
            }`}
          >
            {activeGroup.publicAccess === 'open' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            <span>{activeGroup.publicAccess === 'open' ? 'قفل کردن دسترسی عموم' : 'باز کردن دسترسی عموم'}</span>
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Members & Role Management */}
        <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-100">اعضا، مدیران و مالکیت گروه</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                اجرای واقعی «تنظیم ادمین / تنظیم مدیر»، «حذف مدیر»، «ویژه» و «تنظیم مالک» در روبیکا
              </p>
            </div>
            <div className="flex items-center gap-2">
              {onSyncMembers && (
                <button
                  type="button"
                  disabled={isBusy || syncBusy}
                  onClick={async () => {
                    setSyncBusy(true);
                    setAdminFeedback(null);
                    try {
                      const res = await onSyncMembers();
                      if (!res.ok && res.error) {
                        setAdminFeedback({type: 'error', text: res.error});
                      } else if (res.ok) {
                        setAdminFeedback({
                          type: 'ok',
                          text: 'لیست اعضا و مدیران واقعی از گروه/کانال روبیکا دریافت و همگام شد.',
                        });
                      }
                    } finally {
                      setSyncBusy(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${syncBusy ? 'animate-spin' : ''}`} />
                  <span>{syncBusy ? 'در حال دریافت...' : 'همگام‌سازی اعضا از روبیکا'}</span>
                </button>
              )}
              <Calendar className="w-4 h-4 text-slate-500 hidden sm:block" />
            </div>
          </div>

          {/* Direct Real Rubika Admin Promotion / Demotion by @username or GUID */}
          {onSetAdminRole && (
            <div className="p-3.5 rounded-lg bg-[#0B0F17] border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-200">
                  تنظیم ادمین / مدیر واقعی در روبیکا (با آیدی @ یا User ID)
                </span>
                <span className="text-[11px] text-slate-400">
                  در روبیکا هم با ریپلای یا «تنظیم مدیر @آیدی» کار می‌کند
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  dir="ltr"
                  value={adminTargetInput}
                  onChange={(e) => setAdminTargetInput(e.target.value)}
                  placeholder="@username یا u0..."
                  className="flex-1 min-w-[180px] bg-[#111827] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 outline-none text-left"
                />
                <button
                  type="button"
                  disabled={isBusy || adminBusy || !adminTargetInput.trim()}
                  onClick={async () => {
                    setAdminBusy(true);
                    setAdminFeedback(null);
                    try {
                      const res = await onSetAdminRole({
                        targetUserOrUsername: adminTargetInput.trim(),
                        adminAction: 'SetAdmin',
                      });
                      setAdminFeedback({
                        type: res.ok ? 'ok' : 'error',
                        text: res.ok
                          ? res.message || 'کاربر در روبیکا مدیر/ادمین شد.'
                          : res.error || 'خطا در تنظیم ادمین.',
                      });
                      if (res.ok) setAdminTargetInput('');
                    } finally {
                      setAdminBusy(false);
                    }
                  }}
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{adminBusy ? 'در حال اعمال...' : 'تنظیم مدیر (ادمین روبیکا)'}</span>
                </button>
                <button
                  type="button"
                  disabled={isBusy || adminBusy || !adminTargetInput.trim()}
                  onClick={async () => {
                    setAdminBusy(true);
                    setAdminFeedback(null);
                    try {
                      const res = await onSetAdminRole({
                        targetUserOrUsername: adminTargetInput.trim(),
                        adminAction: 'UnsetAdmin',
                      });
                      setAdminFeedback({
                        type: res.ok ? 'ok' : 'error',
                        text: res.ok
                          ? res.message || 'مقام مدیر/ادمین برداشته شد.'
                          : res.error || 'خطا در حذف ادمین.',
                      });
                      if (res.ok) setAdminTargetInput('');
                    } finally {
                      setAdminBusy(false);
                    }
                  }}
                  className="px-3 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 disabled:opacity-40 text-red-300 border border-red-500/30 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <ShieldOff className="w-3.5 h-3.5" />
                  <span>حذف مدیر</span>
                </button>
              </div>
              {adminFeedback && (
                <p
                  className={`text-xs ${
                    adminFeedback.type === 'ok' ? 'text-emerald-300' : 'text-red-300'
                  }`}
                >
                  {adminFeedback.text}
                </p>
              )}
            </div>
          )}

          <div className="divide-y divide-slate-800/80 max-h-[380px] overflow-y-auto pr-1">
            {activeGroup.members.map((m) => (
              <div key={m.userId} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-100 truncate">{m.name}</p>
                  <p className="text-xs text-slate-400">
                    {ROLE_LABELS[m.role]}
                    {m.username ? ` · ${m.username}` : ''} ·{' '}
                    <span className="font-mono tabular-nums">{m.userId}</span>
                  </p>
                </div>

                {m.role !== 'creator' && (
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {m.role !== 'admin' && m.role !== 'owner' && (
                      <button
                        type="button"
                        disabled={isBusy || adminBusy}
                        onClick={async () => {
                          if (onSetAdminRole) {
                            setAdminBusy(true);
                            setAdminFeedback(null);
                            try {
                              const res = await onSetAdminRole({
                                targetUserOrUsername: m.userId || m.username || '',
                                adminAction: 'SetAdmin',
                                targetNameHint: m.name,
                              });
                              setAdminFeedback({
                                type: res.ok ? 'ok' : 'error',
                                text: res.ok
                                  ? res.message || `کاربر «${m.name}» مدیر/ادمین شد.`
                                  : res.error || 'خطا در تنظیم ادمین.',
                              });
                            } finally {
                              setAdminBusy(false);
                            }
                          } else {
                            await onRunCommand({
                              senderId: config.creatorId,
                              text: 'تنظیم مدیر',
                              replyToSenderId: m.userId,
                            });
                          }
                        }}
                        className="px-2.5 py-1.5 rounded bg-sky-600/15 hover:bg-sky-600/25 text-sky-300 border border-sky-500/30 text-xs font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>تنظیم مدیر</span>
                      </button>
                    )}

                    {m.role === 'admin' && (
                      <button
                        type="button"
                        disabled={isBusy || adminBusy}
                        onClick={async () => {
                          if (onSetAdminRole) {
                            setAdminBusy(true);
                            setAdminFeedback(null);
                            try {
                              const res = await onSetAdminRole({
                                targetUserOrUsername: m.userId || m.username || '',
                                adminAction: 'UnsetAdmin',
                                targetNameHint: m.name,
                              });
                              setAdminFeedback({
                                type: res.ok ? 'ok' : 'error',
                                text: res.ok
                                  ? res.message || `مقام مدیر «${m.name}» برداشته شد.`
                                  : res.error || 'خطا در حذف ادمین.',
                              });
                            } finally {
                              setAdminBusy(false);
                            }
                          } else {
                            await onRunCommand({
                              senderId: config.creatorId,
                              text: 'حذف مدیر',
                              replyToSenderId: m.userId,
                            });
                          }
                        }}
                        className="px-2.5 py-1.5 rounded bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 text-xs font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer"
                      >
                        <ShieldOff className="w-3.5 h-3.5" />
                        <span>حذف مدیر</span>
                      </button>
                    )}

                    {m.role !== 'vip' && m.role !== 'owner' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          onRunCommand({
                            senderId: config.creatorId,
                            text: 'ویژه',
                            replyToSenderId: m.userId,
                          })
                        }
                        className="px-2.5 py-1.5 rounded bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-300 border border-emerald-500/30 text-xs font-medium whitespace-nowrap cursor-pointer"
                      >
                        ویژه کردن
                      </button>
                    )}

                    {m.role === 'vip' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          onRunCommand({
                            senderId: config.creatorId,
                            text: 'حذف ویژه',
                            replyToSenderId: m.userId,
                          })
                        }
                        className="px-2.5 py-1.5 rounded bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 text-xs font-medium whitespace-nowrap cursor-pointer"
                      >
                        حذف ویژه
                      </button>
                    )}

                    {m.role !== 'owner' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          onRunCommand({
                            senderId: config.creatorId,
                            text: 'تنظیم مالک',
                            replyToSenderId: m.userId,
                          })
                        }
                        className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer"
                      >
                        <Crown className="w-3.5 h-3.5 text-amber-400" />
                        <span>تنظیم مالک</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add Member Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!memberName.trim() || !memberId.trim()) return;
              void onAddMember(activeGroup.groupId, {
                name: memberName,
                userId: memberId,
                role: memberRole,
              });
              setMemberName('');
              setMemberId('');
            }}
            className="pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-2.5"
          >
            <input
              type="text"
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              placeholder="نام کاربر"
              className="sm:col-span-4 bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none"
            />
            <input
              type="text"
              dir="ltr"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder="Rubika User ID"
              className="sm:col-span-3 bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 outline-none text-left"
            />
            <select
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value as UserRole)}
              className="sm:col-span-3 bg-[#0B0F17] border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-200 outline-none"
            >
              <option value="member">عادی</option>
              <option value="vip">ویژه</option>
              <option value="admin">ادمین</option>
              <option value="owner">مالک گروه</option>
            </select>
            <button
              type="submit"
              disabled={!memberName.trim() || !memberId.trim()}
              className="sm:col-span-2 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium flex items-center justify-center gap-1 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>افزودن</span>
            </button>
          </form>
        </div>

        {/* Connected Rubika Groups List & Add Group */}
        <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h3 className="text-base font-semibold text-slate-100">گروه‌های متصل روبیکا</h3>
          </div>

          <div className="space-y-2">
            {Object.values(config.groups).map((g) => {
              const isSelected = g.groupId === activeGroup.groupId;
              const isChannel = g.chatType === 'channel' || g.rubikaChatId.startsWith('c0');
              return (
                <button
                  key={g.groupId}
                  type="button"
                  onClick={() => onSelectGroup(g.groupId)}
                  className={`w-full text-right p-3 rounded-lg border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-slate-100'
                      : 'bg-[#0B0F17] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 shrink-0">
                        {isChannel ? 'کانال' : 'گروه'}
                      </span>
                      <span className="text-sm font-medium truncate">{g.title}</span>
                    </div>
                    <span className="text-xs font-mono text-slate-400 shrink-0">{g.rubikaChatId}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {g.voiceCallActive ? 'ویسکال فعال' : 'آماده'} · {g.members.length} عضو ·{' '}
                    {g.publicAccess === 'open' ? 'دسترسی باز' : 'دسترسی قفل'}
                    {g.channelUsername ? ` · @${g.channelUsername.replace(/^@/, '')}` : ''}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Automatic Invite Link / Channel Join */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!inviteLinkInput.trim() || !onJoinInvite) return;
              setInviteBusy(true);
              setInviteFeedback(null);
              try {
                const res = await onJoinInvite(inviteLinkInput.trim());
                if (res.ok && res.group) {
                  const isCh =
                    res.group.chatType === 'channel' || res.group.rubikaChatId.startsWith('c0');
                  const trackTitle = res.startedTrack?.title || res.group.currentTrack?.title;
                  setInviteFeedback({
                    type: 'ok',
                    text: trackTitle
                      ? `${isCh ? 'کانال' : 'گروه'} «${res.group.title}» متصل شد، کال باز شد و آهنگ «${trackTitle}» در حال پخش است.`
                      : `${isCh ? 'کانال' : 'گروه'} «${res.group.title}» (${res.group.rubikaChatId}) متصل و ویسکال فعال شد.`,
                  });
                } else if (res.queued) {
                  setInviteFeedback({
                    type: 'queued',
                    text:
                      res.error ||
                      'در صف عضویت خودکار ثبت شد و بلافاصله پس از ورود Userbot متصل می‌شود.',
                  });
                } else {
                  setInviteFeedback({
                    type: 'error',
                    text: res.error || 'خطا در اتصال خودکار گروه یا کانال روبیکا.',
                  });
                }
              } finally {
                setInviteBusy(false);
              }
            }}
            className="pt-4 border-t border-slate-800 space-y-2.5"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <Link2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>ورود به کانال/گروه، باز کردن کال و پخش آهنگ</span>
            </div>
            <input
              type="text"
              dir="ltr"
              value={inviteLinkInput}
              onChange={(e) => setInviteLinkInput(e.target.value)}
              placeholder="https://rubika.ir/joing/... یا @Pari92i29mmm"
              className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 outline-none text-left"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={inviteBusy || isBusy || !inviteLinkInput.trim() || !onJoinInvite}
                className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>{inviteBusy ? 'در حال ورود و پخش در کال...' : 'عضویت، کال و پخش آهنگ'}</span>
              </button>

              {onOpenVoiceCallInGroup && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void onOpenVoiceCallInGroup()}
                  className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>باز کردن ویسکال و ارسال دکمه پیوستن در گپ</span>
                </button>
              )}
            </div>
            {inviteFeedback && (
              <p
                className={`text-xs ${
                  inviteFeedback.type === 'ok'
                    ? 'text-emerald-300'
                    : inviteFeedback.type === 'queued'
                      ? 'text-amber-300'
                      : 'text-red-300'
                }`}
              >
                {inviteFeedback.text}
              </p>
            )}
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newGroupTitle.trim() || !newGroupChatId.trim()) return;
              void onAddGroup({
                title: newGroupTitle,
                rubikaChatId: newGroupChatId,
                daysValid: newGroupDays,
              });
              setNewGroupTitle('');
              setNewGroupChatId('');
            }}
            className="pt-4 border-t border-slate-800 space-y-3"
          >
            <p className="text-xs font-semibold text-slate-200">افزودن گروه جدید روبیکا</p>
            <input
              type="text"
              value={newGroupTitle}
              onChange={(e) => setNewGroupTitle(e.target.value)}
              placeholder="نام گروه (مثلاً: گروه دورهمی موزیک)"
              className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                dir="ltr"
                value={newGroupChatId}
                onChange={(e) => setNewGroupChatId(e.target.value)}
                placeholder="Chat ID (g0...)"
                className="col-span-2 bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 outline-none text-left"
              />
              <input
                type="number"
                min={1}
                max={365}
                value={newGroupDays}
                onChange={(e) => setNewGroupDays(Number(e.target.value))}
                placeholder="روز اشتراک"
                className="bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={!newGroupTitle.trim() || !newGroupChatId.trim()}
              className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>ثبت و اتصال گروه / کانال</span>
            </button>
          </form>
        </div>
      </section>

      {/* Real Helper-Admin Moderation Panel */}
      {onUpdateModeration && (
        <section className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  مدیر کمکی واقعی (قفل‌ها و ضدتخلف روبیکا)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  اجرای واقعی حذف خودکار لینک/فوروارد/اسپم، قفل چت گروه، فیلتر کلمات و پاکسازی پیام‌ها روی روبیکا
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {[10, 50, 100].map((count) => (
                <button
                  key={count}
                  type="button"
                  disabled={isBusy}
                  onClick={() => void onUpdateModeration({deleteRecentCount: count})}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 border border-slate-700 hover:border-red-500/40 text-slate-200 hover:text-red-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  <span>پاکسازی {count} پیام</span>
                </button>
              ))}
            </div>
          </div>

          {/* 4 Security Locks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                key: 'antiLink' as const,
                title: 'قفل لینک (ضد تبلیغ)',
                desc: 'حذف خودکار لینک‌های rubika.ir و آیدی @ در گپ',
                active: Boolean(activeGroup.locks?.antiLink),
              },
              {
                key: 'antiForward' as const,
                title: 'قفل فوروارد',
                desc: 'حذف پیام‌های فوروارد شده از کانال و گپ دیگر',
                active: Boolean(activeGroup.locks?.antiForward),
              },
              {
                key: 'antiSpam' as const,
                title: 'ضد اسپم هوشمند',
                desc: 'حذف پیام‌های رگباری (۵ پیام در ۶ ثانیه) و اخطار',
                active: Boolean(activeGroup.locks?.antiSpam),
              },
              {
                key: 'lockChat' as const,
                title: 'قفل چت عمومی گروه',
                desc: 'بستن SendMessages برای اعضای عادی در روبیکا',
                active: Boolean(activeGroup.locks?.lockChat),
              },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                disabled={isBusy}
                onClick={() =>
                  void onUpdateModeration({
                    locks: {[item.key]: !item.active},
                  })
                }
                className={`text-right p-3.5 rounded-lg border transition-colors cursor-pointer ${
                  item.active
                    ? 'bg-emerald-500/10 border-emerald-500/40'
                    : 'bg-[#0B0F17] border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-100">{item.title}</span>
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                      item.active
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.active ? 'قفل فعال' : 'آزاد'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">{item.desc}</p>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2 border-t border-slate-800">
            {/* Filtered Words & Muted Users */}
            <div className="lg:col-span-6 space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-200">فیلتر کلمات ممنوعه (حذف خودکار)</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const cleaned = filterWordInput.trim();
                    if (!cleaned) return;
                    void onUpdateModeration({addFilterWord: cleaned});
                    setFilterWordInput('');
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={filterWordInput}
                    onChange={(e) => setFilterWordInput(e.target.value)}
                    placeholder="کلمه ممنوعه را بنویسید (مثلاً: تبلیغ)..."
                    className="flex-1 bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isBusy || !filterWordInput.trim()}
                    className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium whitespace-nowrap cursor-pointer"
                  >
                    افزودن فیلتر
                  </button>
                </form>

                {activeGroup.filteredWords && activeGroup.filteredWords.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {activeGroup.filteredWords.map((word) => (
                      <span
                        key={word}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0B0F17] border border-slate-800 text-xs text-slate-200"
                      >
                        <span>{word}</span>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void onUpdateModeration({removeFilterWord: word})}
                          className="text-slate-400 hover:text-red-400 cursor-pointer"
                          aria-label={`حذف ${word}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">هیچ کلمه فیلترشده‌ای ثبت نشده است.</p>
                )}
              </div>

              <div className="space-y-2 pt-3 border-t border-slate-800/80">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                    <span>کاربران در سکوت ({activeGroup.mutedUserIds?.length || 0})</span>
                  </div>
                  {activeGroup.warnings && Object.keys(activeGroup.warnings).length > 0 && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void onUpdateModeration({clearWarnings: true})}
                      className="text-[11px] text-amber-300 hover:text-amber-200 cursor-pointer"
                    >
                      پاکسازی اخطارها ({Object.keys(activeGroup.warnings).length})
                    </button>
                  )}
                </div>
                {activeGroup.mutedUserIds && activeGroup.mutedUserIds.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {activeGroup.mutedUserIds.map((uid) => {
                      const member = activeGroup.members.find((m) => m.userId === uid);
                      return (
                        <div
                          key={uid}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#0B0F17] border border-amber-500/30 text-xs"
                        >
                          <span className="text-slate-200">{member?.name || uid}</span>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void onUpdateModeration({unmuteUserId: uid})}
                            className="text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
                          >
                            حذف سکوت
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">هیچ کاربری در وضعیت سکوت نیست.</p>
                )}
              </div>
            </div>

            {/* Violation Logs */}
            <div className="lg:col-span-6 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span>گزارش تخلفات اخیر ({activeGroup.violationLogs?.length || 0})</span>
                </div>
                {activeGroup.violationLogs && activeGroup.violationLogs.length > 0 && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void onUpdateModeration({clearViolations: true})}
                    className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    پاکسازی لیست تخلفات
                  </button>
                )}
              </div>

              {activeGroup.violationLogs && activeGroup.violationLogs.length > 0 ? (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {activeGroup.violationLogs.slice(0, 10).map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-200 truncate">{log.userName}</span>
                        <span className="text-[11px] text-red-300 shrink-0">{log.reason}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                        <span className="truncate">{log.actionTaken}</span>
                        <span className="font-mono tabular-nums shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString('fa-IR')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs text-slate-400">
                  تا این لحظه تخلفی در این گروه ثبت نشده است. با فعال کردن قفل‌ها، پیام‌های متخلف به صورت خودکار در روبیکا حذف و ثبت می‌شوند.
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
