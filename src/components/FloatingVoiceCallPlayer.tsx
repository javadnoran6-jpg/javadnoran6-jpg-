import React, {useEffect, useState} from 'react';
import {
  ChevronDown,
  ChevronUp,
  Disc3,
  Pause,
  Play,
  SkipBack,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {GroupState} from '../types/bot';

interface FloatingVoiceCallPlayerProps {
  group: GroupState;
  isBusy: boolean;
  currentTime: number;
  duration: number;
  activeTab: string;
  onNavigateToVoice: () => void;
  onRunCommand: (text: string) => Promise<void>;
  onPrimeAndUnlockAudio: () => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const FloatingVoiceCallPlayer: React.FC<FloatingVoiceCallPlayerProps> = ({
  group,
  isBusy,
  currentTime,
  duration,
  activeTab,
  onNavigateToVoice,
  onRunCommand,
  onPrimeAndUnlockAudio,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [imgError, setImgError] = useState(false);

  const activeTrack = group.currentTrack || group.pausedTrack;

  useEffect(() => {
    setImgError(false);
  }, [activeTrack?.artworkUrl]);
  const totalSec = duration || activeTrack?.durationSec || 0;
  const progressPct =
    totalSec > 0 ? Math.min(100, Math.max(0, (currentTime / totalSec) * 100)) : 0;

  const handleTogglePlayPause = () => {
    onPrimeAndUnlockAudio();
    if (group.isPlaying) {
      void onRunCommand('توقف آهنگ');
    } else if (group.pausedTrack) {
      void onRunCommand('ادامه آهنگ');
    } else if (group.currentTrack) {
      void onRunCommand('ادامه آهنگ');
    } else {
      void onRunCommand('پخش آهنگ');
    }
  };

  if (collapsed) {
    return (
      <div className="fixed bottom-4 left-4 z-40">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="h-11 px-3.5 rounded-xl bg-[#111827]/95 backdrop-blur-md border border-slate-700/80 shadow-lg text-slate-100 hover:border-emerald-500/60 transition-colors flex items-center gap-2.5 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
          aria-label="باز کردن کنترلر شناور ویسکال"
        >
          <Disc3
            className={`w-4 h-4 text-emerald-400 shrink-0 ${
              group.isPlaying ? 'animate-spin' : ''
            }`}
          />
          <span className="truncate max-w-[140px]">
            {activeTrack ? activeTrack.title : 'کنترلر ویسکال'}
          </span>
          <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </button>
      </div>
    );
  }

  return (
    <aside
      aria-label="کنترلر شناور پخش ویسکال"
      className="fixed bottom-3 left-3 right-3 lg:right-[284px] lg:left-6 z-40 max-w-[920px] mx-auto"
    >
      <div className="relative overflow-hidden rounded-xl bg-[#111827]/95 backdrop-blur-md border border-slate-700/80 shadow-xl">
        {/* Hairline live progress track */}
        <div className="h-[2px] w-full bg-slate-800">
          <div
            style={{width: `${progressPct}%`}}
            className={`h-full transition-[width] duration-150 ${
              group.isMuted ? 'bg-amber-400' : 'bg-emerald-500'
            }`}
          />
        </div>

        <div className="px-3 py-2 sm:px-4 flex items-center justify-between gap-3">
          {/* Track Artwork & Clean Metadata */}
          <button
            type="button"
            onClick={() => {
              if (activeTab !== 'voice') onNavigateToVoice();
            }}
            className={`flex items-center gap-3 min-w-0 flex-1 text-right ${
              activeTab !== 'voice' ? 'cursor-pointer hover:opacity-90' : 'cursor-default'
            }`}
            title={activeTab !== 'voice' ? 'مشاهده کنترلر کامل ویسکال' : undefined}
          >
            {activeTrack?.artworkUrl && !imgError ? (
              <img
                src={activeTrack.artworkUrl}
                alt={activeTrack.title}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-9 h-9 rounded-lg object-cover border border-slate-700/80 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-[#0B0F17] border border-slate-800 flex items-center justify-center shrink-0">
                <Disc3
                  className={`w-4 h-4 ${
                    group.isPlaying ? 'text-emerald-400 animate-spin' : 'text-slate-400'
                  }`}
                />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
                {activeTrack ? activeTrack.title : 'آماده پخش در ویسکال گروه'}
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                <span className="truncate">
                  {activeTrack ? activeTrack.artist : group.title}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums shrink-0">
                  {formatTime(currentTime)} / {formatTime(totalSec)}
                </span>
                {group.queue.length > 0 && (
                  <>
                    <span aria-hidden="true" className="hidden sm:inline">
                      ·
                    </span>
                    <span className="hidden sm:inline font-mono tabular-nums shrink-0 text-slate-300">
                      {group.queue.length} در صف
                    </span>
                  </>
                )}
              </div>
            </div>
          </button>

          {/* Primary Playback Controls: Play/Pause, Next, Mute, Collapse */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={isBusy}
              onClick={handleTogglePlayPause}
              className="h-9 px-3 sm:px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              aria-label={group.isPlaying ? 'توقف پخش ویسکال' : 'پخش یا ادامه آهنگ در ویسکال'}
              title={group.isPlaying ? 'توقف' : 'پخش'}
            >
              {group.isPlaying ? (
                <Pause className="w-4 h-4 shrink-0" />
              ) : (
                <Play className="w-4 h-4 shrink-0" />
              )}
              <span className="hidden sm:inline">
                {group.isPlaying ? 'توقف' : group.pausedTrack ? 'ادامه' : 'پخش'}
              </span>
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                onPrimeAndUnlockAudio();
                void onRunCommand('بعدی');
              }}
              className="h-9 px-2.5 sm:px-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700/80 text-slate-100 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              aria-label="آهنگ بعدی"
              title="آهنگ بعدی"
            >
              <SkipBack className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">بعدی</span>
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => void onRunCommand(group.isMuted ? 'باصدا' : 'بیصدا')}
              className={`h-9 w-9 rounded-lg border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                group.isMuted
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-[#0B0F17] hover:bg-slate-800 border-slate-800 text-slate-300'
              }`}
              aria-label={group.isMuted ? 'باصدا کردن ویسکال' : 'بیصدا کردن ویسکال'}
              title={group.isMuted ? 'باصدا' : 'بیصدا'}
            >
              {group.isMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="h-9 w-8 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
              aria-label="جمع کردن کنترلر شناور"
              title="کوچک کردن"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
