import React, {useRef, useState} from 'react';
import {Clock, Pause, Play, RotateCcw, Timer} from 'lucide-react';
import {Track} from '../types/bot';

interface LiveTrackProgressWidgetProps {
  currentTrack: Track | null;
  pausedTrack: Track | null;
  isPlaying: boolean;
  isMuted: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  onSeekTo: (seconds: number) => void;
  onTogglePlayPause?: () => void;
}

function formatSec(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '00:00';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const LiveTrackProgressWidget: React.FC<LiveTrackProgressWidgetProps> = ({
  currentTrack,
  pausedTrack,
  isPlaying,
  isMuted,
  isBuffering,
  currentTime,
  duration,
  onSeekTo,
  onTogglePlayPause,
}) => {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [dragSeconds, setDragSeconds] = useState<number | null>(null);

  const activeTrack = currentTrack || pausedTrack;
  const totalDuration = Math.max(0, duration || activeTrack?.durationSec || 0);
  const effectiveElapsed = Math.min(
    totalDuration || Number.MAX_SAFE_INTEGER,
    Math.max(0, dragSeconds ?? currentTime),
  );
  const remainingSeconds = totalDuration > 0 ? Math.max(0, totalDuration - effectiveElapsed) : 0;
  const progressPercent =
    totalDuration > 0 ? Math.min(100, Math.max(0, (effectiveElapsed / totalDuration) * 100)) : 0;

  const isSeekable = Boolean(currentTrack && totalDuration > 0);

  const computeRatioFromClientX = (clientX: number): number => {
    const el = barRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSeekable) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const ratio = computeRatioFromClientX(e.clientX);
    const targetSec = ratio * totalDuration;
    setIsDragging(true);
    setDragSeconds(targetSec);
    onSeekTo(targetSec);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const ratio = computeRatioFromClientX(e.clientX);
    setHoverRatio(ratio);
    if (isDragging && isSeekable) {
      const targetSec = ratio * totalDuration;
      setDragSeconds(targetSec);
      onSeekTo(targetSec);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setIsDragging(false);
      setDragSeconds(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isSeekable) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onSeekTo(Math.min(totalDuration, effectiveElapsed + 5));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onSeekTo(Math.max(0, effectiveElapsed - 5));
    }
  };

  const hoverTargetSec = hoverRatio !== null && totalDuration > 0 ? hoverRatio * totalDuration : null;
  const hoverRemainingSec =
    hoverTargetSec !== null && totalDuration > 0 ? Math.max(0, totalDuration - hoverTargetSec) : null;

  return (
    <section
      aria-label="نوار پیشرفت زنده و زمان باقیمانده آهنگ"
      className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4"
    >
      {/* Top Info Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
              currentTrack && isPlaying
                ? isMuted
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-800/80 border-slate-700 text-slate-400'
            }`}
          >
            <Timer className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100 truncate">
                نوار پیشرفت زنده و زمان باقیمانده
              </h3>
              {isBuffering && currentTrack && (
                <span className="text-[11px] text-amber-400 whitespace-nowrap">در حال بافر...</span>
              )}
            </div>
            <p className="text-xs text-slate-400 truncate mt-0.5">
              {activeTrack
                ? `${activeTrack.title} — ${activeTrack.artist}`
                : 'برای فعال‌سازی نوار پیشرفت، یک آهنگ در ویسکال پخش کنید'}
            </p>
          </div>
        </div>

        {/* Remaining Time Readout + Quick Seek Buttons */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="px-3 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-800 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-xs text-slate-400">زمان باقیمانده:</span>
            <span
              dir="ltr"
              className={`font-mono tabular-nums text-sm font-bold ${
                currentTrack && isPlaying
                  ? remainingSeconds <= 5
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                  : 'text-slate-300'
              }`}
            >
              {totalDuration > 0 ? `-${formatSec(remainingSeconds)}` : '--:--'}
            </span>
          </div>

          <div className="flex items-center gap-1.5" dir="ltr">
            <button
              type="button"
              disabled={!isSeekable}
              onClick={() => onSeekTo(Math.max(0, effectiveElapsed - 10))}
              className="px-2.5 py-1.5 rounded-lg bg-[#0B0F17] hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-xs font-mono text-slate-300 cursor-pointer"
              title="۱۰ ثانیه به عقب"
            >
              -10s
            </button>
            <button
              type="button"
              disabled={!isSeekable}
              onClick={() => onSeekTo(0)}
              className="p-1.5 rounded-lg bg-[#0B0F17] hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-slate-300 cursor-pointer"
              title="شروع از ابتدا"
              aria-label="شروع مجدد آهنگ"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={!isSeekable}
              onClick={() => onSeekTo(Math.min(totalDuration, effectiveElapsed + 10))}
              className="px-2.5 py-1.5 rounded-lg bg-[#0B0F17] hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-xs font-mono text-slate-300 cursor-pointer"
              title="۱۰ ثانیه به جلو"
            >
              +10s
            </button>
            {onTogglePlayPause && activeTrack && (
              <button
                type="button"
                onClick={onTogglePlayPause}
                className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                title={isPlaying ? 'توقف موقت' : 'ادامه پخش'}
                aria-label={isPlaying ? 'توقف موقت' : 'ادامه پخش'}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Click-to-Seek Progress Bar */}
      <div className="space-y-2" dir="ltr">
        <div
          ref={barRef}
          role="slider"
          tabIndex={isSeekable ? 0 : -1}
          aria-label="نوار پیشرفت و جابه‌جایی در طول آهنگ"
          aria-valuemin={0}
          aria-valuemax={Math.round(totalDuration)}
          aria-valuenow={Math.round(effectiveElapsed)}
          aria-disabled={!isSeekable}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            if (!isDragging) setHoverRatio(null);
          }}
          onKeyDown={handleKeyDown}
          className={`relative h-6 flex items-center select-none group ${
            isSeekable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
          }`}
        >
          {/* Hover Timestamp Tooltip */}
          {isSeekable && hoverRatio !== null && hoverTargetSec !== null && hoverRemainingSec !== null && (
            <div
              style={{left: `${hoverRatio * 100}%`}}
              className="absolute -top-8 -translate-x-1/2 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[11px] font-mono tabular-nums text-slate-100 whitespace-nowrap pointer-events-none shadow-lg z-20"
            >
              {formatSec(hoverTargetSec)} (-{formatSec(hoverRemainingSec)})
            </div>
          )}

          {/* Track Background */}
          <div className="w-full h-2.5 bg-[#0B0F17] border border-slate-800 rounded-full overflow-hidden relative">
            {/* Hover preview highlight */}
            {isSeekable && hoverRatio !== null && (
              <div
                style={{width: `${hoverRatio * 100}%`}}
                className="absolute inset-y-0 left-0 bg-slate-600/35 pointer-events-none"
              />
            )}

            {/* Live Fill */}
            <div
              style={{width: `${progressPercent}%`}}
              className={`h-full rounded-full transition-[width] ${
                isDragging ? 'duration-0' : 'duration-100'
              } ${
                isMuted
                  ? 'bg-amber-500'
                  : isPlaying
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                    : 'bg-emerald-600/70'
              }`}
            />
          </div>

          {/* Interactive Scrubber Thumb */}
          {isSeekable && (
            <div
              style={{left: `${progressPercent}%`}}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-[#0B0F17] shadow transition-transform ${
                isMuted ? 'bg-amber-400' : 'bg-emerald-400'
              } ${isDragging ? 'scale-125' : 'group-hover:scale-110'}`}
            />
          )}
        </div>

        {/* Bottom Numeric Telemetry */}
        <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-400">
          <span>سپری‌شده: {formatSec(effectiveElapsed)}</span>
          <span className="text-slate-300 font-semibold">{Math.round(progressPercent)}%</span>
          <span>کل آهنگ: {formatSec(totalDuration)}</span>
        </div>
      </div>
    </section>
  );
};
