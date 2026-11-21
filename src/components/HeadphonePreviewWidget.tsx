import React from 'react';
import {Headphones, Pause, Play, Radio, Square, Volume2} from 'lucide-react';
import {AudioOutputDeviceOption} from '../hooks/useHeadphonePreview';
import {Track} from '../types/bot';

interface HeadphonePreviewWidgetProps {
  queue: Track[];
  currentTrack: Track | null;
  pausedTrack: Track | null;
  isBusy: boolean;
  previewState: {
    previewTrack: Track | null;
    isPlaying: boolean;
    isBuffering: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    error: string | null;
    outputDevices: AudioOutputDeviceOption[];
    selectedSinkId: string;
    supportsSinkSelect: boolean;
    previewCueTrack: (track: Track, autoPlay?: boolean) => void;
    togglePlayPause: () => void;
    stopPreview: () => void;
    seekTo: (sec: number) => void;
    setVolume: (vol: number) => void;
    changeOutputDevice: (sinkId: string) => Promise<void>;
  };
  onBroadcastToCall: (track: Track) => Promise<void>;
}

function formatSec(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '00:00';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const HeadphonePreviewWidget: React.FC<HeadphonePreviewWidgetProps> = ({
  queue,
  currentTrack,
  pausedTrack,
  isBusy,
  previewState,
  onBroadcastToCall,
}) => {
  // Build selectable cue candidates prioritizing queued tracks, then current/paused
  const candidateTracks: Array<{track: Track; label: string}> = [];
  const seenIds = new Set<string>();

  queue.forEach((t, idx) => {
    if (!seenIds.has(t.id)) {
      seenIds.add(t.id);
      candidateTracks.push({
        track: t,
        label: `صف #${idx + 1}: ${t.title} — ${t.artist}`,
      });
    }
  });

  if (currentTrack && !seenIds.has(currentTrack.id)) {
    seenIds.add(currentTrack.id);
    candidateTracks.push({
      track: currentTrack,
      label: `در حال پخش: ${currentTrack.title} — ${currentTrack.artist}`,
    });
  }

  if (pausedTrack && !seenIds.has(pausedTrack.id)) {
    seenIds.add(pausedTrack.id);
    candidateTracks.push({
      track: pausedTrack,
      label: `متوقف‌شده: ${pausedTrack.title} — ${pausedTrack.artist}`,
    });
  }

  const activeCueTrack = previewState.previewTrack || candidateTracks[0]?.track || null;
  const isLoadedCue = Boolean(
    activeCueTrack && previewState.previewTrack?.id === activeCueTrack.id,
  );
  const effectiveDuration = Math.max(
    1,
    isLoadedCue ? previewState.duration || activeCueTrack?.durationSec || 30 : activeCueTrack?.durationSec || 30,
  );
  const effectiveCurrent = isLoadedCue ? Math.min(previewState.currentTime, effectiveDuration) : 0;

  return (
    <section
      aria-label="پیشنمایش صوتی محلی در هدفون مدیر"
      className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Title & Isolation Scope */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
              previewState.isPlaying
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                : 'bg-slate-800/80 border-slate-700 text-slate-300'
            }`}
          >
            <Headphones className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100">
                پیشنمایش خصوصی در هدفون مدیر
              </h3>
              <span className="text-xs text-slate-400">
                · فقط روی دستگاه شما پخش می‌شود (بدون ارسال به ویسکال گروه)
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate mt-0.5">
              {activeCueTrack
                ? `${activeCueTrack.title} — ${activeCueTrack.artist}`
                : 'آهنگی در صف یا پخش انتخاب نشده است'}
            </p>
          </div>
        </div>

        {/* Queue / Candidate Selector & Output Device */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {candidateTracks.length > 0 && (
            <select
              aria-label="انتخاب آهنگ برای پیشنمایش هدفون"
              value={activeCueTrack?.id || ''}
              onChange={(e) => {
                const match = candidateTracks.find((c) => c.track.id === e.target.value);
                if (match) {
                  previewState.previewCueTrack(match.track, previewState.isPlaying);
                }
              }}
              className="max-w-[240px] bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none cursor-pointer"
            >
              {previewState.previewTrack && !seenIds.has(previewState.previewTrack.id) && (
                <option value={previewState.previewTrack.id}>
                  انتخابی: {previewState.previewTrack.title}
                </option>
              )}
              {candidateTracks.map((c) => (
                <option key={c.track.id} value={c.track.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}

          {previewState.supportsSinkSelect && previewState.outputDevices.length > 1 && (
            <select
              aria-label="انتخاب خروجی هدفون"
              value={previewState.selectedSinkId}
              onChange={(e) => void previewState.changeOutputDevice(e.target.value)}
              className="max-w-[190px] bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none cursor-pointer"
            >
              {previewState.outputDevices.map((dev) => (
                <option key={dev.deviceId} value={dev.deviceId}>
                  {dev.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Compact Control Deck */}
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/80">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={!activeCueTrack}
            onClick={() => {
              if (!activeCueTrack) return;
              if (isLoadedCue) {
                previewState.togglePlayPause();
              } else {
                previewState.previewCueTrack(activeCueTrack, true);
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 transition-colors ${
              previewState.isPlaying
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {previewState.isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>توقف پیشنمایش</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>{previewState.isBuffering ? 'در حال اتصال...' : 'شنیدن در هدفون'}</span>
              </>
            )}
          </button>

          {isLoadedCue && (previewState.isPlaying || effectiveCurrent > 0) && (
            <button
              type="button"
              onClick={previewState.stopPreview}
              aria-label="توقف کامل پیشنمایش"
              title="توقف کامل پیشنمایش"
              className="p-1.5 rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Scrubber & Time */}
        <div className="flex-1 min-w-[180px] flex items-center gap-2.5" dir="ltr">
          <span className="font-mono tabular-nums text-[11px] text-slate-400 shrink-0">
            {formatSec(effectiveCurrent)}
          </span>
          <input
            type="range"
            min={0}
            max={effectiveDuration}
            value={effectiveCurrent}
            disabled={!isLoadedCue}
            onChange={(e) => previewState.seekTo(Number(e.target.value))}
            aria-label="موقعیت پیشنمایش هدفون"
            className="w-full accent-emerald-500 h-1.5 bg-[#0B0F17] rounded-lg cursor-pointer disabled:opacity-40"
          />
          <span className="font-mono tabular-nums text-[11px] text-slate-400 shrink-0">
            {formatSec(effectiveDuration)}
          </span>
        </div>

        {/* Independent Headphone Volume */}
        <div className="flex items-center gap-2 shrink-0">
          <Volume2 className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="range"
            min={0}
            max={100}
            value={previewState.volume}
            onChange={(e) => previewState.setVolume(Number(e.target.value))}
            aria-label="ولوم هدفون پیشنمایش"
            className="w-20 accent-emerald-500 h-1.5 bg-[#0B0F17] rounded-lg cursor-pointer"
          />
          <span className="font-mono tabular-nums text-[11px] text-slate-300 w-8 text-left">
            {previewState.volume}%
          </span>
        </div>

        {/* Approve & Send to Group Voice Call */}
        {activeCueTrack && activeCueTrack.id !== currentTrack?.id && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              previewState.stopPreview();
              void onBroadcastToCall(activeCueTrack);
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white border border-slate-700 hover:border-emerald-500 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 transition-colors"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>تأیید و ارسال به ویسکال گروه</span>
          </button>
        )}
      </div>

      {previewState.error && (
        <p className="text-xs text-amber-400">{previewState.error}</p>
      )}
    </section>
  );
};
