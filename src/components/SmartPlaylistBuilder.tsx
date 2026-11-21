import React, {useEffect, useState} from 'react';
import {
  Check,
  Clock,
  Flame,
  Layers,
  ListPlus,
  Play,
  RefreshCw,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react';
import {
  GroupState,
  MusicMood,
  SmartPlaylistAdaptMode,
  SmartPlaylistPreset,
  SmartPlaylistTimeSlot,
  Track,
} from '../types/bot';

const ALL_MOODS: MusicMood[] = [
  'شاد',
  'غمگین',
  'محلی و لری',
  'سنتی',
  'پاپ',
  'نوستالژی',
  'آرام',
];

const TIME_SLOTS: Array<{value: SmartPlaylistTimeSlot; label: string; hint: string}> = [
  {value: 'auto_now', label: 'تشخیص خودکار بر اساس ساعت فعلی', hint: 'تطبیق لحظه‌ای'},
  {value: 'morning', label: 'صبحگاهی (۰۶:۰۰ تا ۱۲:۰۰)', hint: 'شاد و پرانرژی'},
  {value: 'afternoon', label: 'عصرگاهی (۱۲:۰۰ تا ۱۸:۰۰)', hint: 'پاپ و محلی'},
  {value: 'evening', label: 'غروب و دورهمی (۱۸:۰۰ تا ۲۲:۰۰)', hint: 'نوستالژی و سنتی'},
  {value: 'night', label: 'شبانه و آخر شب (۲۲:۰۰ تا ۰۶:۰۰)', hint: 'آرام و غمگین'},
];

interface SmartPlaylistBuilderProps {
  group: GroupState;
  isBusy: boolean;
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
}

export const SmartPlaylistBuilder: React.FC<SmartPlaylistBuilderProps> = ({
  group,
  isBusy,
  onApplySmartPlaylist,
  onSaveSmartPlaylistRule,
  onDeletePreset,
}) => {
  const existingRule = group.smartPlaylistRule;
  const [selectedMoods, setSelectedMoods] = useState<MusicMood[]>(
    existingRule?.moods?.length ? existingRule.moods : ['شاد', 'پاپ'],
  );
  const [playlistName, setPlaylistName] = useState('');
  const [trackCount, setTrackCount] = useState<number>(existingRule?.trackCount || 20);
  const [balanceMode, setBalanceMode] = useState<'interleaved' | 'shuffled'>(
    existingRule?.balanceMode || 'interleaved',
  );
  const [adaptMode, setAdaptMode] = useState<SmartPlaylistAdaptMode>(
    existingRule?.mode || 'manual',
  );
  const [timeSlot, setTimeSlot] = useState<SmartPlaylistTimeSlot>(
    existingRule?.timeSlot || 'auto_now',
  );
  const [autoAdaptEnabled, setAutoAdaptEnabled] = useState<boolean>(
    Boolean(existingRule?.enabled),
  );
  const [savePreset, setSavePreset] = useState<boolean>(true);

  const [previewTracks, setPreviewTracks] = useState<Track[]>([]);
  const [previewBreakdown, setPreviewBreakdown] = useState<Record<string, number>>({});
  const [previewSummary, setPreviewSummary] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (group.smartPlaylistRule) {
      setAdaptMode(group.smartPlaylistRule.mode);
      setTimeSlot(group.smartPlaylistRule.timeSlot);
      setAutoAdaptEnabled(group.smartPlaylistRule.enabled);
    }
  }, [
    group.smartPlaylistRule?.mode,
    group.smartPlaylistRule?.timeSlot,
    group.smartPlaylistRule?.enabled,
  ]);

  const toggleMood = (mood: MusicMood) => {
    setSelectedMoods((prev) => {
      if (prev.includes(mood)) {
        if (prev.length === 1) return prev;
        return prev.filter((m) => m !== mood);
      }
      return [...prev, mood];
    });
  };

  const handleGeneratePreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch('/api/music/catalog/smart-playlist/preview', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          groupId: group.groupId,
          moods: selectedMoods,
          count: trackCount,
          balanceMode,
          adaptMode,
          timeSlot,
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          tracks?: Track[];
          breakdown?: Record<string, number>;
          adaptSummary?: string;
        };
        setPreviewTracks(data.tracks || []);
        setPreviewBreakdown(data.breakdown || {});
        setPreviewSummary(data.adaptSummary || '');
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleRemovePreviewTrack = (trackId: string) => {
    setPreviewTracks((prev) => prev.filter((t) => t.id !== trackId));
  };

  const handleApply = async (startMode: 'replace_and_play' | 'append_queue') => {
    const finalName =
      playlistName.trim() ||
      (adaptMode === 'vc_popularity'
        ? 'پلی‌لیست هوشمند محبوب‌ترین‌های ویسکال'
        : adaptMode === 'time_slot'
          ? `پلی‌لیست هوشمند زمانی (${TIME_SLOTS.find((s) => s.value === timeSlot)?.label.split(' ')[0] || 'خودکار'})`
          : `میکس هوشمند: ${selectedMoods.join(' + ')}`);

    await onApplySmartPlaylist({
      name: finalName,
      moods: selectedMoods,
      count: trackCount,
      balanceMode,
      startMode,
      savePreset,
      customTracks: previewTracks.length > 0 ? previewTracks : undefined,
      adaptMode,
      timeSlot,
      autoAdaptEnabled: adaptMode === 'manual' ? false : autoAdaptEnabled,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    });
    setPreviewTracks([]);
    setPreviewSummary('');
  };

  const handleRunSavedPreset = async (preset: SmartPlaylistPreset) => {
    await onApplySmartPlaylist({
      name: preset.name,
      moods: preset.moods,
      count: preset.trackCount,
      balanceMode: preset.balanceMode,
      startMode: 'replace_and_play',
      savePreset: false,
      adaptMode: preset.adaptMode || 'manual',
      timeSlot: preset.timeSlot,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    });
  };

  const handleAdaptQueueNow = async () => {
    if (!onSaveSmartPlaylistRule) return;
    await onSaveSmartPlaylistRule({
      enabled: adaptMode !== 'manual' ? autoAdaptEnabled : false,
      mode: adaptMode,
      timeSlot,
      moods: selectedMoods,
      trackCount,
      balanceMode,
      applyNow: true,
    });
  };

  return (
    <section className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <h3 className="text-base font-semibold text-slate-100">
              سازنده پلی‌لیست هوشمند و تطبیق خودکار ویسکال
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            ترکیب سبک‌ها را دستی بچینید یا به ربات اجازه دهید لیست آهنگ‌های پلی‌لیست هوشمند را بر اساس محبوبیت در ویسکال‌ها یا بازه زمانی (مثلاً شبانه) خودکار تغییر دهد.
          </p>
        </div>

        <div className="text-xs text-slate-400 font-mono tabular-nums shrink-0">
          {selectedMoods.length} سبک · {trackCount} آهنگ
        </div>
      </div>

      {/* Adaptive Smart Mode Selector */}
      <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-200">
            حالت هوشمند تغییر خودکار لیست آهنگ‌ها
          </p>
          {existingRule?.enabled && existingRule.lastReason && (
            <span className="text-[11px] text-emerald-400 truncate max-w-full">
              فعال: {existingRule.lastReason}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setAdaptMode('manual')}
            className={`p-3 rounded-lg border text-right transition-colors cursor-pointer ${
              adaptMode === 'manual'
                ? 'bg-emerald-600/15 border-emerald-500 text-emerald-200'
                : 'bg-[#111827] border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>انتخاب دستی سبک‌ها</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              فقط بر اساس سبک‌های انتخاب‌شده توسط شما
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setAdaptMode('vc_popularity');
              setAutoAdaptEnabled(true);
            }}
            className={`p-3 rounded-lg border text-right transition-colors cursor-pointer ${
              adaptMode === 'vc_popularity'
                ? 'bg-emerald-600/15 border-emerald-500 text-emerald-200'
                : 'bg-[#111827] border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Flame className="w-4 h-4 text-amber-400 shrink-0" />
              <span>بر اساس محبوبیت در ویسکال‌ها</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              اولویت به آهنگ‌ها و هنرمندان پرتکرار ویس‌چت
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setAdaptMode('time_slot');
              setAutoAdaptEnabled(true);
            }}
            className={`p-3 rounded-lg border text-right transition-colors cursor-pointer ${
              adaptMode === 'time_slot'
                ? 'bg-emerald-600/15 border-emerald-500 text-emerald-200'
                : 'bg-[#111827] border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Clock className="w-4 h-4 text-sky-400 shrink-0" />
              <span>بر اساس بازه زمانی مشخص</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              تغییر خودکار حال‌وهوا (صبحگاهی، عصرگاهی، شبانه)
            </p>
          </button>
        </div>

        {adaptMode === 'time_slot' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 pt-1">
            {TIME_SLOTS.map((slot) => (
              <button
                key={slot.value}
                type="button"
                onClick={() => setTimeSlot(slot.value)}
                className={`px-3 py-2 rounded-lg border text-right transition-colors cursor-pointer ${
                  timeSlot === slot.value
                    ? 'bg-sky-500/15 border-sky-400 text-sky-200'
                    : 'bg-[#111827] border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <p className="text-xs font-medium truncate">{slot.label}</p>
                <p className="text-[11px] text-slate-400 truncate">{slot.hint}</p>
              </button>
            ))}
          </div>
        )}

        {adaptMode !== 'manual' && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
            <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoAdaptEnabled}
                onChange={(e) => {
                  const next = e.target.checked;
                  setAutoAdaptEnabled(next);
                  if (onSaveSmartPlaylistRule) {
                    void onSaveSmartPlaylistRule({
                      enabled: next,
                      mode: adaptMode,
                      timeSlot,
                      moods: selectedMoods,
                      trackCount,
                      balanceMode,
                      applyNow: false,
                    });
                  }
                }}
                className="accent-emerald-500 rounded cursor-pointer"
              />
              <span>
                بروزرسانی خودکار لیست صف در پس‌زمینه (با تغییر بازه زمانی یا افزایش محبوبیت ویسکال)
              </span>
            </label>

            {onSaveSmartPlaylistRule && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleAdaptQueueNow()}
                className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>تطبیق و تغییر صف الان</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Multi-select Genre Buttons */}
      <div className="space-y-2">
        <p className="text-xs text-slate-300 font-medium">
          {adaptMode === 'manual'
            ? 'انتخاب سبک‌های ترکیبی (حداقل ۱ یا چند سبک):'
            : 'سبک‌های پایه / پشتیبان (در کنار تطبیق هوشمند):'}
        </p>
        <div className="flex flex-wrap gap-2">
          {ALL_MOODS.map((mood) => {
            const active = selectedMoods.includes(mood);
            return (
              <button
                key={mood}
                type="button"
                onClick={() => toggleMood(mood)}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                    : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {active && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                <span>{mood}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Configuration Row */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-5">
          <label className="block text-xs text-slate-400 mb-1.5">نام پلی‌لیست (اختیاری)</label>
          <input
            type="text"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            placeholder={`میکس هوشمند: ${selectedMoods.join(' + ')}`}
            className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none"
          />
        </div>

        <div className="md:col-span-3">
          <label className="block text-xs text-slate-400 mb-1.5">تعداد آهنگ‌های ترکیب</label>
          <select
            value={trackCount}
            onChange={(e) => setTrackCount(Number(e.target.value))}
            className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none"
          >
            <option value={10}>۱۰ آهنگ متوالی</option>
            <option value={20}>۲۰ آهنگ متوالی</option>
            <option value={30}>۳۰ آهنگ متوالی</option>
            <option value={50}>۵۰ آهنگ متوالی</option>
          </select>
        </div>

        <div className="md:col-span-4">
          <label className="block text-xs text-slate-400 mb-1.5">الگوریتم چیدمان پخش</label>
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setBalanceMode('interleaved')}
              className={`py-1.5 px-2 rounded text-xs font-medium transition-colors cursor-pointer ${
                balanceMode === 'interleaved'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              نوبتی متعادل
            </button>
            <button
              type="button"
              onClick={() => setBalanceMode('shuffled')}
              className={`py-1.5 px-2 rounded text-xs font-medium transition-colors cursor-pointer ${
                balanceMode === 'shuffled'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              تصادفی ترکیبی
            </button>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800/80">
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={savePreset}
            onChange={(e) => setSavePreset(e.target.checked)}
            className="accent-emerald-500 rounded cursor-pointer"
          />
          <span>ذخیره به عنوان پلی‌لیست آماده در گروه</span>
        </label>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={previewLoading}
            onClick={handleGeneratePreview}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {previewLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Shuffle className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>{previewTracks.length > 0 ? 'تغییر ترکیب پیش‌نمایش' : 'پیش‌نمایش لیست ترکیب'}</span>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => void handleApply('append_queue')}
            className="px-3.5 py-2 rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ListPlus className="w-3.5 h-3.5 text-amber-400" />
            <span>افزودن به صف فعلی</span>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => void handleApply('replace_and_play')}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>ساخت و پخش متوالی در ویس‌چت</span>
          </button>
        </div>
      </div>

      {/* Generated Preview List */}
      {previewTracks.length > 0 && (
        <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <div className="space-y-0.5">
              <div className="text-xs text-slate-300">
                پیش‌نمایش ترکیب ({previewTracks.length} آهنگ):{' '}
                <span className="text-slate-400">
                  {Object.entries(previewBreakdown)
                    .map(([m, c]) => `${m} (${c})`)
                    .join(' · ')}
                </span>
              </div>
              {previewSummary && (
                <p className="text-[11px] text-emerald-400">{previewSummary}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setPreviewTracks([]);
                setPreviewSummary('');
              }}
              className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              بستن پیش‌نمایش
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/70">
            {previewTracks.map((t, idx) => (
              <div key={`${t.id}_${idx}`} className="py-2 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-mono tabular-nums text-slate-500 w-5">{idx + 1}</span>
                  <span className="text-slate-100 font-medium truncate">{t.title}</span>
                  <span className="text-slate-400 truncate">· {t.artist}</span>
                  <span className="text-emerald-400 shrink-0">· {t.mood || 'پاپ'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemovePreviewTrack(t.id)}
                  className="text-slate-500 hover:text-red-400 cursor-pointer"
                  title="حذف از ترکیب"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved Smart Playlist Presets */}
      {(group.savedPlaylists?.length || 0) > 0 && (
        <div className="pt-4 border-t border-slate-800 space-y-2.5">
          <p className="text-xs font-semibold text-slate-300">پلی‌لیست‌های هوشمند ذخیره‌شده گروه</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.savedPlaylists!.map((preset) => (
              <div
                key={preset.id}
                className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-100 truncate">{preset.name}</p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {preset.moods.join(' + ')} ·{' '}
                    <span className="font-mono tabular-nums">{preset.trackCount}</span> آهنگ
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleRunSavedPreset(preset)}
                    className="px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3 h-3" />
                    <span>پخش</span>
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void onDeletePreset(preset.id)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 cursor-pointer"
                    aria-label="حذف پلی‌لیست ذخیره‌شده"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
