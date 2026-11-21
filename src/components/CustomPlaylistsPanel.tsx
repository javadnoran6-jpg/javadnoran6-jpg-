import React, {useEffect, useMemo, useState} from 'react';
import {
  Check,
  Disc3,
  Edit3,
  Headphones,
  Link2,
  ListMusic,
  MessageSquareText,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {CustomPlaylist, GroupState, Track} from '../types/bot';

interface CustomPlaylistsPanelProps {
  group: GroupState;
  isBusy: boolean;
  previewState: {
    previewTrack: Track | null;
    isPlaying: boolean;
    previewCueTrack: (track: Track, autoPlay?: boolean) => void;
  };
  onCreatePlaylist: (name: string) => Promise<void>;
  onRenamePlaylist: (playlistId: string, newName: string) => Promise<void>;
  onDeletePlaylist: (playlistId: string) => Promise<void>;
  onAddTrack: (
    playlistId: string,
    payload: {track?: Track; searchQuery?: string; directUrl?: string; title?: string},
  ) => Promise<void>;
  onRemoveTrack: (playlistId: string, trackIndex: number) => Promise<void>;
  onPlayPlaylist: (playlistId: string, mode: 'replace_and_play' | 'append_queue') => Promise<void>;
  onSelectTrack: (track: Track, mode: 'play_now' | 'queue') => Promise<void>;
}

function formatSec(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const CustomPlaylistsPanel: React.FC<CustomPlaylistsPanelProps> = ({
  group,
  isBusy,
  previewState,
  onCreatePlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onAddTrack,
  onRemoveTrack,
  onPlayPlaylist,
  onSelectTrack,
}) => {
  const playlists = group.customPlaylists || [];
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>(playlists[0]?.id || '');
  const [newName, setNewName] = useState('');
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Add-track sub-tabs inside the selected playlist view
  const [addTab, setAddTab] = useState<'search' | 'link' | 'chat'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [directUrl, setDirectUrl] = useState('');
  const [directTitle, setDirectTitle] = useState('');

  useEffect(() => {
    if (playlists.length === 0) {
      if (selectedPlaylistId) setSelectedPlaylistId('');
      return;
    }
    if (!playlists.some((p) => p.id === selectedPlaylistId)) {
      setSelectedPlaylistId(playlists[0].id);
    }
  }, [playlists, selectedPlaylistId]);

  const activePlaylist: CustomPlaylist | null = useMemo(
    () => playlists.find((p) => p.id === selectedPlaylistId) || playlists[0] || null,
    [playlists, selectedPlaylistId],
  );

  // Candidate tracks from current track, queue, and audio files/replies in group chat
  const chatAndQueueCandidates = useMemo(() => {
    const items: Array<{track: Track; originLabel: string}> = [];
    const seenUrls = new Set<string>();

    const pushCandidate = (track: Track | null | undefined, originLabel: string) => {
      if (!track || !track.streamUrl || seenUrls.has(track.streamUrl)) return;
      seenUrls.add(track.streamUrl);
      items.push({track, originLabel});
    };

    pushCandidate(group.currentTrack, 'در حال پخش');
    pushCandidate(group.pausedTrack, 'متوقف‌شده');
    group.queue.forEach((t, i) => pushCandidate(t, `صف #${i + 1}`));

    [...group.messages].reverse().forEach((m) => {
      if (m.audioAttachment?.url) {
        pushCandidate(
          {
            id: `chat_pl_${m.id}`,
            title: m.audioAttachment.title || 'فایل صوتی چت',
            artist: m.audioAttachment.artist || m.senderName,
            durationSec: m.audioAttachment.durationSec || 60,
            streamUrl: m.audioAttachment.url,
            sourceUrl: m.audioAttachment.url,
            source: 'reply',
            requestedBy: m.senderName,
            requestedAt: m.timestamp,
          },
          `چت (${m.senderName})`,
        );
      }
    });

    return items;
  }, [group.currentTrack, group.pausedTrack, group.queue, group.messages]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newName.trim();
    if (!cleaned) return;
    await onCreatePlaylist(cleaned);
    setNewName('');
  };

  const handleSearchSongs = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/music/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as {tracks?: Track[]};
      const tracks = data.tracks || [];
      setSearchResults(tracks);
      if (tracks.length === 0) {
        setSearchError(`آهنگی برای «${q}» یافت نشد. عبارت دیگری امتحان کنید یا از لینک مستقیم استفاده نمایید.`);
      }
    } catch {
      setSearchError('خطا در اتصال به سرویس جستجوی آهنگ.');
    } finally {
      setSearching(false);
    }
  };

  const handleAddDirectLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePlaylist || !directUrl.trim()) return;
    await onAddTrack(activePlaylist.id, {
      directUrl: directUrl.trim(),
      title: directTitle.trim() || undefined,
    });
    setDirectUrl('');
    setDirectTitle('');
  };

  const totalDurationSec = useMemo(
    () => (activePlaylist ? activePlaylist.tracks.reduce((acc, t) => acc + (t.durationSec || 0), 0) : 0),
    [activePlaylist],
  );

  return (
    <section className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5">
      {/* Header + Create New Playlist Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <ListMusic className="w-4 h-4 text-emerald-400 shrink-0" />
            <h3 className="text-base font-semibold text-slate-100">
              پلی‌لیست‌های شخصی کاربران (ساخت، مدیریت و پخش در ویسکال)
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            در چت روبیکا هم با دستورهای{' '}
            <code className="font-mono text-emerald-400">ساخت پلی‌لیست نام</code>،{' '}
            <code className="font-mono text-emerald-400">افزودن به پلی‌لیست نام | آهنگ</code> (یا ریپلای روی فایل/لینک)،{' '}
            <code className="font-mono text-emerald-400">پخش پلی‌لیست نام</code> قابل کنترل است.
          </p>
        </div>

        <form onSubmit={handleCreate} className="flex items-center gap-2 shrink-0">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="نام پلی‌لیست جدید (مثلاً: گلچین شاد)..."
            className="w-56 sm:w-64 bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none"
          />
          <button
            type="submit"
            disabled={isBusy || !newName.trim()}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>ساخت پلی‌لیست جدید</span>
          </button>
        </form>
      </div>

      {playlists.length === 0 ? (
        <div className="py-10 px-4 text-center border border-dashed border-slate-800 rounded-lg space-y-2">
          <p className="text-sm font-medium text-slate-200">هنوز پلی‌لیست شخصی ساخته نشده است.</p>
          <p className="text-xs text-slate-400 max-w-lg mx-auto">
            یک نام در کادر بالا وارد کنید و دکمه «ساخت پلی‌لیست جدید» را بزنید تا آهنگ‌های دلخواه خود را با جستجو، لینک مستقیم یا ریپلای به آن اضافه کنید.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Playlists Selector List */}
          <div className="lg:col-span-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>لیست پلی‌لیست‌ها</span>
              <span className="font-mono tabular-nums">{playlists.length} پلی‌لیست</span>
            </div>

            <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-lg bg-[#0B0F17] overflow-hidden">
              {playlists.map((pl) => {
                const isSelected = activePlaylist?.id === pl.id;
                const isEditing = editingPlaylistId === pl.id;
                const isConfirmingDelete = confirmDeleteId === pl.id;

                return (
                  <div
                    key={pl.id}
                    className={`p-3 transition-colors ${
                      isSelected ? 'bg-emerald-500/10' : 'hover:bg-slate-800/35'
                    }`}
                  >
                    {isEditing ? (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!renameDraft.trim()) return;
                          await onRenamePlaylist(pl.id, renameDraft.trim());
                          setEditingPlaylistId(null);
                        }}
                        className="flex items-center gap-1.5"
                      >
                        <input
                          type="text"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          autoFocus
                          aria-label="نام جدید پلی‌لیست"
                          className="flex-1 min-w-0 bg-[#111827] border border-emerald-500/50 rounded px-2.5 py-1 text-xs text-slate-100 outline-none"
                        />
                        <button
                          type="submit"
                          disabled={isBusy || !renameDraft.trim()}
                          className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                          title="ثبت نام جدید"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPlaylistId(null)}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                          title="انصراف"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPlaylistId(pl.id);
                            setConfirmDeleteId(null);
                          }}
                          className="flex-1 min-w-0 text-right cursor-pointer"
                        >
                          <p
                            className={`text-sm font-medium truncate ${
                              isSelected ? 'text-emerald-300' : 'text-slate-100'
                            }`}
                          >
                            {pl.name}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums truncate">
                            {pl.tracks.length} آهنگ · سازنده: {pl.createdBy}
                          </p>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={isBusy || pl.tracks.length === 0}
                            onClick={() => void onPlayPlaylist(pl.id, 'replace_and_play')}
                            title="پخش در ویسکال"
                            aria-label={`پخش پلی‌لیست ${pl.name}`}
                            className="p-1.5 rounded bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white disabled:opacity-35 cursor-pointer transition-colors"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              setEditingPlaylistId(pl.id);
                              setRenameDraft(pl.name);
                              setConfirmDeleteId(null);
                            }}
                            title="تغییر نام پلی‌لیست"
                            aria-label={`تغییر نام ${pl.name}`}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {isConfirmingDelete ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={async () => {
                                  await onDeletePlaylist(pl.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-[11px] font-medium whitespace-nowrap cursor-pointer"
                              >
                                حذف شود؟
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="p-1 rounded bg-slate-800 text-slate-300 cursor-pointer"
                                aria-label="لغو حذف"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmDeleteId(pl.id)}
                              title="حذف پلی‌لیست"
                              aria-label={`حذف پلی‌لیست ${pl.name}`}
                              className="p-1.5 rounded bg-red-500/10 hover:bg-red-500/25 text-red-400 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Playlist Tracks & Add-Songs Workbench */}
          {activePlaylist && (
            <div className="lg:col-span-8 bg-[#0B0F17] border border-slate-800 rounded-lg p-4 space-y-4">
              {/* Selected Playlist Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-slate-100 truncate">{activePlaylist.name}</h4>
                  <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
                    {activePlaylist.tracks.length} آهنگ · زمان کل {formatSec(totalDurationSec)} · به‌روزرسانی{' '}
                    {new Date(activePlaylist.updatedAt).toLocaleTimeString('fa-IR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isBusy || activePlaylist.tracks.length === 0}
                    onClick={() => void onPlayPlaylist(activePlaylist.id, 'replace_and_play')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>پخش پلی‌لیست در ویسکال</span>
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || activePlaylist.tracks.length === 0}
                    onClick={() => void onPlayPlaylist(activePlaylist.id, 'append_queue')}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>افزودن کل به صف</span>
                  </button>
                </div>
              </div>

              {/* Add Songs Methods Tabs */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-300">
                    افزودن آهنگ به «{activePlaylist.name}»:
                  </span>
                  <div className="flex items-center gap-1 p-1 bg-[#111827] border border-slate-800 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setAddTab('search')}
                      className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                        addTab === 'search'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Search className="w-3 h-3" />
                      <span>جستجوی آهنگ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddTab('link')}
                      className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                        addTab === 'link'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Link2 className="w-3 h-3" />
                      <span>لینک مستقیم</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddTab('chat')}
                      className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                        addTab === 'chat'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <MessageSquareText className="w-3 h-3" />
                      <span>از چت و صف ({chatAndQueueCandidates.length})</span>
                    </button>
                  </div>
                </div>

                {/* Tab 1: Search & Add */}
                {addTab === 'search' && (
                  <div className="space-y-2.5">
                    <form onSubmit={handleSearchSongs} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="نام آهنگ یا خواننده برای افزودن به پلی‌لیست..."
                        className="flex-1 bg-[#111827] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none"
                      />
                      <button
                        type="submit"
                        disabled={searching || !searchQuery.trim()}
                        className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-emerald-300 text-xs font-medium whitespace-nowrap cursor-pointer"
                      >
                        {searching ? 'در حال جستجو...' : 'جستجو'}
                      </button>
                    </form>

                    {searchError && <p className="text-xs text-amber-400">{searchError}</p>}

                    {searchResults.length > 0 && (
                      <div className="divide-y divide-slate-800/70 max-h-52 overflow-y-auto border border-slate-800 rounded-lg bg-[#111827]">
                        {searchResults.slice(0, 8).map((t) => (
                          <div key={t.id} className="p-2.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {t.artworkUrl ? (
                                <img
                                  src={t.artworkUrl}
                                  alt={t.title}
                                  referrerPolicy="no-referrer"
                                  className="w-8 h-8 rounded object-cover shrink-0 border border-slate-700"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center shrink-0">
                                  <Disc3 className="w-4 h-4 text-slate-400" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-100 truncate">{t.title}</p>
                                <p className="text-[11px] text-slate-400 truncate tabular-nums">
                                  {t.artist} · {formatSec(t.durationSec)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => previewState.previewCueTrack(t)}
                                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                                title="پیشنمایش هدفون"
                              >
                                <Headphones className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void onAddTrack(activePlaylist.id, {track: t})}
                                className="px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                <span>افزودن به پلی‌لیست</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Direct Audio URL */}
                {addTab === 'link' && (
                  <form onSubmit={handleAddDirectLink} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="url"
                      dir="ltr"
                      value={directUrl}
                      onChange={(e) => setDirectUrl(e.target.value)}
                      placeholder="https://example.com/song.mp3"
                      className="sm:col-span-6 bg-[#111827] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 text-left outline-none"
                    />
                    <input
                      type="text"
                      value={directTitle}
                      onChange={(e) => setDirectTitle(e.target.value)}
                      placeholder="عنوان دلخواه (اختیاری)"
                      className="sm:col-span-3 bg-[#111827] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isBusy || !directUrl.trim()}
                      className="sm:col-span-3 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>ثبت لینک در پلی‌لیست</span>
                    </button>
                  </form>
                )}

                {/* Tab 3: From Current Track / Queue / Replied Chat Audio */}
                {addTab === 'chat' && (
                  <div className="space-y-2">
                    {chatAndQueueCandidates.length === 0 ? (
                      <p className="text-xs text-slate-400 py-3 px-3 border border-dashed border-slate-800 rounded-lg">
                        در حال حاضر فایل صوتی در چت یا صف گروه وجود ندارد. در چت روبیکا می‌توانید روی هر فایل صوتی یا لینک ریپلای کرده و بنویسید{' '}
                        <code className="font-mono text-emerald-400">
                          افزودن به پلی‌لیست {activePlaylist.name}
                        </code>
                        .
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-800/70 max-h-52 overflow-y-auto border border-slate-800 rounded-lg bg-[#111827]">
                        {chatAndQueueCandidates.map(({track, originLabel}) => (
                          <div
                            key={`${track.id}_${track.streamUrl}`}
                            className="p-2.5 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-100 truncate">{track.title}</p>
                              <p className="text-[11px] text-slate-400 truncate">
                                {originLabel} · {track.artist}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void onAddTrack(activePlaylist.id, {track})}
                              className="px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>افزودن</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Playlist Tracks List */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>آهنگ‌های داخل «{activePlaylist.name}»</span>
                  <span className="font-mono tabular-nums">{activePlaylist.tracks.length} قطعه</span>
                </div>

                {activePlaylist.tracks.length === 0 ? (
                  <div className="py-6 text-center border border-dashed border-slate-800 rounded-lg text-xs text-slate-400">
                    این پلی‌لیست هنوز خالی است. از بخش بالا آهنگ جستجو کنید یا لینک/فایل اضافه نمایید.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/70 max-h-72 overflow-y-auto">
                    {activePlaylist.tracks.map((track, idx) => {
                      const isCueing =
                        previewState.previewTrack?.id === track.id && previewState.isPlaying;
                      return (
                        <div
                          key={`${track.id}_${idx}`}
                          className="py-2.5 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono tabular-nums text-xs text-slate-500 w-5 shrink-0">
                              {idx + 1}
                            </span>
                            {track.artworkUrl ? (
                              <img
                                src={track.artworkUrl}
                                alt={track.title}
                                referrerPolicy="no-referrer"
                                className="w-9 h-9 rounded object-cover border border-slate-800 shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded bg-slate-800 flex items-center justify-center shrink-0">
                                <Disc3 className="w-4 h-4 text-slate-400" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-100 truncate">{track.title}</p>
                              <p className="text-[11px] text-slate-400 truncate tabular-nums">
                                {track.artist} · {formatSec(track.durationSec)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => previewState.previewCueTrack(track)}
                              title="پیشنمایش هدفون"
                              className={`p-1.5 rounded border text-xs cursor-pointer ${
                                isCueing
                                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                              }`}
                            >
                              <Headphones className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void onSelectTrack(track, 'play_now')}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors"
                            >
                              پخش تکی
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void onRemoveTrack(activePlaylist.id, idx)}
                              aria-label={`حذف ${track.title} از پلی‌لیست`}
                              className="p-1.5 rounded text-red-400 hover:bg-red-500/15 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
