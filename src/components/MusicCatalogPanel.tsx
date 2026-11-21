import React, {useCallback, useEffect, useState} from 'react';
import {ChevronLeft, ChevronRight, Disc3, ListPlus, Plus, RefreshCw, Search, Shuffle, Zap} from 'lucide-react';
import {MusicMood, Track} from '../types/bot';

interface CatalogResponse {
  tracks: Track[];
  totalMatched: number;
  stats: {
    total: number;
    isIndexing: boolean;
    lastSyncedAt: string | null;
    countsByMood: Record<string, number>;
  };
}

interface MusicCatalogPanelProps {
  isBusy: boolean;
  onSelectTrack: (track: Track, mode: 'play_now' | 'queue') => Promise<void>;
  onRunCommand: (text: string) => Promise<void>;
  onEnqueueMood: (mood: MusicMood, count: number) => Promise<void>;
}

const MOOD_TABS: Array<string> = [
  'همه',
  'شاد',
  'غمگین',
  'محلی و لری',
  'سنتی',
  'پاپ',
  'نوستالژی',
  'آرام',
];

const PAGE_SIZE = 36;

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '00:30';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const MusicCatalogPanel: React.FC<MusicCatalogPanelProps> = ({
  isBusy,
  onSelectTrack,
  onRunCommand,
  onEnqueueMood,
}) => {
  const [selectedMood, setSelectedMood] = useState<string>('همه');
  const [filterText, setFilterText] = useState<string>('');
  const [page, setPage] = useState<number>(0);
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);

  const fetchCatalog = useCallback(async (mood: string, q: string, pageIdx: number) => {
    try {
      const params = new URLSearchParams({
        mood,
        q,
        offset: String(pageIdx * PAGE_SIZE),
        limit: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/music/catalog?${params.toString()}`);
      if (res.ok) {
        const json = (await res.json()) as CatalogResponse;
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(0);
  }, [selectedMood, filterText]);

  useEffect(() => {
    void fetchCatalog(selectedMood, filterText, page);
  }, [selectedMood, filterText, page, fetchCatalog]);

  // Auto-refresh smoothly while background catalog indexing is running
  useEffect(() => {
    if (!data?.stats.isIndexing && (data?.stats.total ?? 0) >= 1000) return;
    const timer = setInterval(() => {
      void fetchCatalog(selectedMood, filterText, page);
    }, 2500);
    return () => clearInterval(timer);
  }, [data?.stats.isIndexing, data?.stats.total, selectedMood, filterText, page, fetchCatalog]);

  const handleSyncMore = async () => {
    setSyncing(true);
    try {
      const target = Math.max(1300, (data?.stats.total || 0) + 350);
      await fetch('/api/music/catalog/sync', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({targetCount: target}),
      });
      await fetchCatalog(selectedMood, filterText, page);
    } finally {
      setSyncing(false);
    }
  };

  const totalCatalog = data?.stats.total || 0;
  const totalMatched = data?.totalMatched || 0;
  const totalPages = Math.max(1, Math.ceil(totalMatched / PAGE_SIZE));
  const counts = data?.stats.countsByMood || {};

  return (
    <section className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5">
      {/* Header & Bulk Mood Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-base font-semibold text-slate-100">
              آرشیو جامع موسیقی ربات (شاد، غمگین، محلی، سنتی و پاپ)
            </h3>
            <span className="text-xs font-mono tabular-nums text-emerald-400">
              {totalCatalog.toLocaleString('fa-IR')} آهنگ آماده پخش
              {data?.stats.isIndexing ? ' (در حال دریافت بیشتر...)' : ''}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            کلیک روی هر آهنگ بلافاصله در ویسکال گروه پخش می‌شود یا به صف اضافه می‌گردد
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onRunCommand('پخش رندوم شاد')}
            className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>پخش رندوم شاد</span>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => onRunCommand('پخش رندوم غمگین')}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Shuffle className="w-3.5 h-3.5 text-amber-400" />
            <span>پخش رندوم غمگین</span>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => onEnqueueMood('شاد', 10)}
            className="px-3 py-2 rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <ListPlus className="w-3.5 h-3.5 text-emerald-400" />
            <span>+۱۰ شاد به صف</span>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => onEnqueueMood('غمگین', 10)}
            className="px-3 py-2 rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <ListPlus className="w-3.5 h-3.5 text-amber-400" />
            <span>+۱۰ غمگین به صف</span>
          </button>

          <button
            type="button"
            disabled={syncing || data?.stats.isIndexing}
            onClick={handleSyncMore}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing || data?.stats.isIndexing ? 'animate-spin' : ''}`} />
            <span>{syncing || data?.stats.isIndexing ? 'در حال دریافت...' : 'دریافت آهنگ بیشتر'}</span>
          </button>
        </div>
      </div>

      {/* Category Filter Tabs & Local Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
          {MOOD_TABS.map((mood) => {
            const active = selectedMood === mood;
            const count = mood === 'همه' ? totalCatalog : counts[mood] || 0;
            return (
              <button
                key={mood}
                type="button"
                onClick={() => setSelectedMood(mood)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {mood} <span className="font-mono tabular-nums opacity-80">({count})</span>
              </button>
            );
          })}
        </div>

        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="فیلتر بین آهنگ‌ها و خواننده‌ها..."
            className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg pr-9 pl-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none"
          />
        </div>
      </div>

      {/* Track Grid */}
      {loading && !data ? (
        <div className="py-12 text-center text-xs text-slate-400">در حال بارگذاری آرشیو موسیقی...</div>
      ) : (data?.tracks.length || 0) === 0 ? (
        <div className="py-10 text-center border border-dashed border-slate-800 rounded-lg text-xs text-slate-400">
          {totalCatalog === 0
            ? 'آرشیو در حال دریافت اولین سری آهنگ‌هاست؛ چند ثانیه صبر کنید...'
            : 'آهنگی مطابق فیلتر شما یافت نشد.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {data!.tracks.map((track) => (
            <div
              key={track.id}
              className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800/90 hover:border-slate-700 flex items-center justify-between gap-3 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                {track.artworkUrl ? (
                  <img
                    src={track.artworkUrl}
                    alt={track.title}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 rounded object-cover shrink-0 border border-slate-800"
                  />
                ) : (
                  <div className="w-11 h-11 rounded bg-slate-800 flex items-center justify-center shrink-0">
                    <Disc3 className="w-5 h-5 text-slate-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-100 truncate">{track.title}</p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {track.artist} · {track.mood || 'پاپ'} ·{' '}
                    <span className="font-mono tabular-nums">{formatDuration(track.durationSec)}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onSelectTrack(track, 'play_now')}
                  className="p-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                  title="پخش فوری در ویسکال"
                  aria-label="پخش فوری"
                >
                  <Zap className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onSelectTrack(track, 'queue')}
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

      {/* Pagination */}
      {totalMatched > PAGE_SIZE && (
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-4 text-xs text-slate-400">
          <span className="tabular-nums">
            نمایش {(page * PAGE_SIZE + 1).toLocaleString('fa-IR')} تا{' '}
            {Math.min((page + 1) * PAGE_SIZE, totalMatched).toLocaleString('fa-IR')} از{' '}
            {totalMatched.toLocaleString('fa-IR')} آهنگ
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center gap-1 cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              <span>قبلی</span>
            </button>
            <span className="font-mono tabular-nums text-slate-200">
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 flex items-center gap-1 cursor-pointer"
            >
              <span>بعدی</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
