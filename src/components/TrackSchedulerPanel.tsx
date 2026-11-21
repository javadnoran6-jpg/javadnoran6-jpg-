import React, {useEffect, useMemo, useState} from 'react';
import {CalendarClock, Clock, Play, Plus, Power, Trash2} from 'lucide-react';
import {GroupState, Track, TrackScheduleItem} from '../types/bot';

interface TrackSchedulerPanelProps {
  group: GroupState;
  isBusy: boolean;
  onAddSchedule: (payload: {
    track: Track;
    startTime: string;
    endTime: string;
    endAction: TrackScheduleItem['endAction'];
  }) => Promise<void>;
  onToggleSchedule: (scheduleId: string, enabled: boolean) => Promise<void>;
  onDeleteSchedule: (scheduleId: string) => Promise<void>;
}

function addMinutesToHHMM(baseHHMM: string, minsToAdd: number): string {
  const parts = baseHHMM.split(':');
  const now = new Date();
  const h = parts.length === 2 ? Number(parts[0]) : now.getHours();
  const m = parts.length === 2 ? Number(parts[1]) : now.getMinutes();
  const totalMins = (((Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0) + minsToAdd) % 1440 + 1440) % 1440;
  return `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;
}

function currentHHMMPlus(mins: number): string {
  const d = new Date(Date.now() + mins * 60 * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatCountdown(targetIso: string | null, nowMs: number): string {
  if (!targetIso) return '';
  const diff = Math.max(0, new Date(targetIso).getTime() - nowMs);
  if (diff <= 0) return '00:00:00';
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const TrackSchedulerPanel: React.FC<TrackSchedulerPanelProps> = ({
  group,
  isBusy,
  onAddSchedule,
  onToggleSchedule,
  onDeleteSchedule,
}) => {
  const selectableTracks = useMemo(() => {
    const list: Array<{track: Track; origin: 'queue' | 'current' | 'history'; label: string}> = [];
    const seen = new Set<string>();

    group.queue.forEach((t, idx) => {
      seen.add(t.id);
      list.push({
        track: t,
        origin: 'queue',
        label: `[صف #${idx + 1}] ${t.title} — ${t.artist}`,
      });
    });

    if (group.currentTrack && !seen.has(group.currentTrack.id)) {
      seen.add(group.currentTrack.id);
      list.push({
        track: group.currentTrack,
        origin: 'current',
        label: `[در حال پخش] ${group.currentTrack.title} — ${group.currentTrack.artist}`,
      });
    }

    group.history
      .slice(-5)
      .reverse()
      .forEach((t) => {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          list.push({
            track: t,
            origin: 'history',
            label: `[تاریخچه] ${t.title} — ${t.artist}`,
          });
        }
      });

    return list;
  }, [group.queue, group.currentTrack, group.history]);

  const [selectedTrackId, setSelectedTrackId] = useState<string>(
    () => selectableTracks[0]?.track.id || '',
  );
  const [startTime, setStartTime] = useState<string>(() => currentHHMMPlus(2));
  const [endTime, setEndTime] = useState<string>(() => currentHHMMPlus(7));
  const [endAction, setEndAction] =
    useState<TrackScheduleItem['endAction']>('stop_playback');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (
      selectableTracks.length > 0 &&
      !selectableTracks.some((item) => item.track.id === selectedTrackId)
    ) {
      setSelectedTrackId(selectableTracks[0].track.id);
    }
  }, [selectableTracks, selectedTrackId]);

  const schedules = group.trackSchedules || [];
  const hasEnabled = schedules.some((s) => s.enabled);

  useEffect(() => {
    if (!hasEnabled) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasEnabled]);

  const selectedTrack =
    selectableTracks.find((item) => item.track.id === selectedTrackId)?.track ||
    selectableTracks[0]?.track ||
    null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrack || !startTime) return;
    await onAddSchedule({
      track: selectedTrack,
      startTime,
      endTime,
      endAction,
    });
  };

  return (
    <section
      aria-label="زمان‌بندی دقیق پخش آهنگ‌های صف"
      className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
            <CalendarClock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100">
                زمان‌بندی پخش آهنگ‌های صف (Scheduler)
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                ({schedules.length})
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              ساعت دقیق شروع و پایان پخش هر آهنگ از صف گروه را تنظیم کنید تا به صورت خودکار در ویسکال اجرا و متوقف شود.
            </p>
          </div>
        </div>
      </div>

      {/* Add Schedule Form */}
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end"
      >
        <div className="lg:col-span-4 space-y-1.5">
          <label className="block text-xs text-slate-300">
            انتخاب آهنگ از صف پخش ({group.queue.length} در صف)
          </label>
          {selectableTracks.length === 0 ? (
            <div className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-amber-300">
              ابتدا از بخش جستجو یا کاتالوگ یک آهنگ به صف اضافه کنید.
            </div>
          ) : (
            <select
              value={selectedTrack?.id || ''}
              onChange={(e) => setSelectedTrackId(e.target.value)}
              className="w-full bg-[#111827] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none"
            >
              {selectableTracks.map((item) => (
                <option key={item.track.id} value={item.track.id}>
                  {item.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="lg:col-span-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-slate-300">ساعت شروع</label>
            <div className="flex items-center gap-1">
              {[1, 5, 15].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    const nextStart = currentHHMMPlus(m);
                    setStartTime(nextStart);
                    setEndTime(addMinutesToHHMM(nextStart, 5));
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 cursor-pointer"
                >
                  +{m}د
                </button>
              ))}
            </div>
          </div>
          <input
            type="time"
            dir="ltr"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            aria-label="ساعت شروع پخش آهنگ"
            className="w-full bg-[#111827] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 outline-none"
          />
        </div>

        <div className="lg:col-span-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-slate-300">ساعت پایان</label>
            <div className="flex items-center gap-1">
              {[3, 5, 10].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setEndTime(addMinutesToHHMM(startTime, m))}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 cursor-pointer"
                >
                  +{m}د مدت
                </button>
              ))}
            </div>
          </div>
          <input
            type="time"
            dir="ltr"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            aria-label="ساعت پایان پخش آهنگ"
            className="w-full bg-[#111827] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 outline-none"
          />
        </div>

        <div className="lg:col-span-2 space-y-1.5">
          <label className="block text-xs text-slate-300">اقدام در ساعت پایان</label>
          <select
            value={endAction}
            onChange={(e) =>
              setEndAction(e.target.value as TrackScheduleItem['endAction'])
            }
            className="w-full bg-[#111827] border border-slate-800 focus:border-emerald-500 rounded-lg px-2.5 py-2 text-xs text-slate-100 outline-none"
          >
            <option value="stop_playback">توقف پخش</option>
            <option value="next_in_queue">آهنگ بعدی صف</option>
            <option value="stop_call">قطع کامل ویسکال</option>
          </select>
        </div>

        <div className="lg:col-span-12 flex items-center justify-between gap-3 pt-2 border-t border-slate-800/70">
          <p className="text-[11px] text-slate-400">
            زمان‌بندی روی ساعت محلی مرورگر شما تنظیم می‌شود و توسط هسته سرور ربات اجرا می‌گردد.
          </p>
          <button
            type="submit"
            disabled={isBusy || !selectedTrack || !startTime}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>ثبت زمان‌بندی پخش</span>
          </button>
        </div>
      </form>

      {/* Scheduled Items List */}
      {schedules.length === 0 ? (
        <div className="py-6 text-center border border-dashed border-slate-800 rounded-lg text-xs text-slate-400">
          هنوز زمان‌بندی پخشی برای آهنگ‌های صف ثبت نشده است.
        </div>
      ) : (
        <div className="divide-y divide-slate-800/80">
          {schedules.map((item) => {
            const countdown =
              item.status === 'pending' && item.enabled
                ? formatCountdown(item.startTriggerIso, nowMs)
                : item.status === 'active' && item.enabled && item.endTriggerIso
                  ? formatCountdown(item.endTriggerIso, nowMs)
                  : '';

            const statusBadge =
              item.status === 'active'
                ? {
                    text: 'در حال پخش زمان‌بندی‌شده',
                    cls: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
                  }
                : item.status === 'completed'
                  ? {
                      text: 'اجرا و پایان یافته',
                      cls: 'text-slate-400 bg-slate-800/80 border-slate-700',
                    }
                  : item.enabled
                    ? {
                        text: 'در انتظار شروع',
                        cls: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
                      }
                    : {
                        text: 'غیرفعال',
                        cls: 'text-slate-400 bg-slate-800/60 border-slate-700',
                      };

            const endActionLabel =
              item.endAction === 'next_in_queue'
                ? 'رفتن به آهنگ بعدی'
                : item.endAction === 'stop_call'
                  ? 'قطع کامل ویسکال'
                  : 'توقف پخش';

            return (
              <div
                key={item.id}
                className="py-3 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Play className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-sm font-semibold text-slate-100 truncate">
                      {item.track.title}
                    </span>
                    <span className="text-xs text-slate-400 truncate">
                      — {item.track.artist}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded border text-[11px] font-medium ${statusBadge.cls}`}
                    >
                      {statusBadge.text}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1 font-mono tabular-nums text-slate-200">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>
                        شروع: {item.startTime}
                        {item.endTime ? ` · پایان: ${item.endTime}` : ''}
                      </span>
                    </span>
                    <span>· پایان: {endActionLabel}</span>
                    {countdown && (
                      <span className="font-mono tabular-nums text-emerald-400">
                        · {item.status === 'active' ? 'باقیمانده تا پایان:' : 'تا شروع:'}{' '}
                        {countdown}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void onToggleSchedule(item.id, !item.enabled)}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                      item.enabled
                        ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>{item.enabled ? 'فعال' : 'فعال‌سازی مجدد'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void onDeleteSchedule(item.id)}
                    className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer"
                    aria-label="حذف زمان‌بندی"
                    title="حذف زمان‌بندی"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
