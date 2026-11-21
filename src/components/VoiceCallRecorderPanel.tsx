import React from 'react';
import {Disc, Download, Mic, Radio, Square, Trash2} from 'lucide-react';
import {GroupState} from '../types/bot';

interface VoiceCallRecorderPanelProps {
  group: GroupState;
  isBusy: boolean;
  recorderState: {
    isRecording: boolean;
    isSaving: boolean;
    recordingSeconds: number;
    recordedBytes: number;
    recorderError: string | null;
    lastLocalDownloadUrl: {url: string; filename: string; durationSec: number} | null;
    startRecording: () => void;
    stopRecording: () => void;
  };
  onToggleAutoRecord: (enabled: boolean) => Promise<void>;
  onDeleteRecording: (recordingId: string) => Promise<void>;
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const VoiceCallRecorderPanel: React.FC<VoiceCallRecorderPanelProps> = ({
  group,
  isBusy,
  recorderState,
  onToggleAutoRecord,
  onDeleteRecording,
}) => {
  const autoRecordEnabled = group.autoRecordVoiceCall !== false;
  const recordings = group.callRecordings || [];

  return (
    <section
      aria-label="ضبط خودکار صدای ویسکال و دانلود جلسات"
      className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5"
    >
      {/* Header & Auto-Record Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
              recorderState.isRecording
                ? 'bg-red-500/15 border-red-500/40 text-red-400'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
            }`}
          >
            {recorderState.isRecording ? (
              <Radio className="w-4 h-4 animate-pulse" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100">
                ضبط خودکار صدای ویسکال و لینک دانلود جلسه
              </h3>
              {recorderState.isRecording && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-[11px] font-medium text-red-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
                  <span>در حال ضبط</span>
                  <span className="font-mono tabular-nums" dir="ltr">
                    {formatDuration(recorderState.recordingSeconds)}
                  </span>
                  <span className="font-mono tabular-nums text-red-200/80" dir="ltr">
                    ({formatBytes(recorderState.recordedBytes)})
                  </span>
                </span>
              )}
              {recorderState.isSaving && (
                <span className="text-xs text-amber-400">در حال ذخیره‌سازی فایل ضبط...</span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              با فعال بودن این گزینه، صدای کامل ویس‌چت (آهنگ‌های در حال پخش + میکروفون و حاضران) به صورت خودکار ضبط و پس از پایان جلسه به شکل لینک دانلود نمایش داده می‌شود.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <label className="flex items-center gap-2 text-xs text-slate-200 bg-[#0B0F17] border border-slate-800 px-3 py-2 rounded-lg cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRecordEnabled}
              disabled={isBusy}
              onChange={(e) => void onToggleAutoRecord(e.target.checked)}
              className="accent-emerald-500 rounded cursor-pointer"
            />
            <span>ضبط خودکار هنگام ویسکال</span>
          </label>

          {recorderState.isRecording ? (
            <button
              type="button"
              onClick={recorderState.stopRecording}
              className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              <span>پایان ضبط و ساخت لینک</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={recorderState.startRecording}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Disc className="w-3.5 h-3.5 text-red-400" />
              <span>شروع ضبط دستی</span>
            </button>
          )}
        </div>
      </div>

      {recorderState.recorderError && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex flex-wrap items-center justify-between gap-3">
          <span>{recorderState.recorderError}</span>
          {recorderState.lastLocalDownloadUrl && (
            <a
              href={recorderState.lastLocalDownloadUrl.url}
              download={recorderState.lastLocalDownloadUrl.filename}
              className="px-3 py-1.5 rounded bg-amber-500 text-slate-950 font-semibold text-xs flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>دانلود نسخه موقت</span>
            </a>
          )}
        </div>
      )}

      {/* Recorded Session Download Links */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>فایل‌های ضبط‌شده جلسات ویسکال ({recordings.length})</span>
          {recordings.length > 0 && (
            <span>آخرین ضبط آماده دانلود است</span>
          )}
        </div>

        {recordings.length === 0 ? (
          <div className="py-6 text-center border border-dashed border-slate-800 rounded-lg text-xs text-slate-400">
            هنوز جلسه ضبط‌شده‌ای ثبت نشده است. با شروع و پایان تماس صوتی (ساخت کال / قطع ویسکال) فایل ضبط به صورت خودکار این‌جا نمایش داده می‌شود.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80 bg-[#0B0F17] border border-slate-800 rounded-xl px-4">
            {recordings.map((rec) => {
              const absoluteLink =
                typeof window !== 'undefined'
                  ? `${window.location.origin}${rec.downloadUrl}?download=1`
                  : `${rec.downloadUrl}?download=1`;

              return (
                <div
                  key={rec.id}
                  className="py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-100">
                        ضبط جلسه ویسکال · {new Date(rec.endedAt).toLocaleTimeString('fa-IR')}
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-emerald-400">
                        {formatDuration(rec.durationSec)} · {formatBytes(rec.sizeBytes)}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(rec.endedAt).toLocaleDateString('fa-IR')}
                      </span>
                    </div>

                    {rec.tracksLabel && (
                      <p className="text-xs text-slate-400 truncate">
                        آهنگ‌های پخش‌شده: {rec.tracksLabel}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                      <span>لینک فایل:</span>
                      <a
                        href={`${rec.downloadUrl}?download=1`}
                        download={rec.filename}
                        dir="ltr"
                        className="text-emerald-400 hover:underline truncate max-w-[360px]"
                      >
                        {absoluteLink}
                      </a>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <audio
                      controls
                      preload="metadata"
                      src={rec.downloadUrl}
                      className="h-8 max-w-[230px]"
                    />

                    <a
                      href={`${rec.downloadUrl}?download=1`}
                      download={rec.filename}
                      className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>دانلود فایل صوتی</span>
                    </a>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void onDeleteRecording(rec.id)}
                      className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer"
                      aria-label="حذف فایل ضبط"
                      title="حذف فایل ضبط"
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
    </section>
  );
};
