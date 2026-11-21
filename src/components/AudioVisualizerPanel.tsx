import React, {useEffect, useRef, useState} from 'react';
import {Activity, AudioWaveform, BarChart2, Sliders} from 'lucide-react';
import {AudioVisualizerFrame} from '../hooks/useVoiceAudioEngine';

interface AudioVisualizerPanelProps {
  isPlaying: boolean;
  isMuted: boolean;
  micActive: boolean;
  trackTitle?: string;
  actualSampleRate: number;
  baseLatencyMs: number;
  getVisualizerFrame: () => AudioVisualizerFrame;
}

type VisualizerMode = 'hybrid' | 'waveform' | 'spectrum';

export const AudioVisualizerPanel: React.FC<AudioVisualizerPanelProps> = ({
  isPlaying,
  isMuted,
  micActive,
  trackTitle,
  actualSampleRate,
  baseLatencyMs,
  getVisualizerFrame,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<VisualizerMode>('hybrid');
  const modeRef = useRef<VisualizerMode>(mode);
  modeRef.current = mode;

  const peaksRef = useRef<Float32Array>(new Float32Array(64));
  const smoothBarsRef = useRef<Float32Array>(new Float32Array(64));
  const bassBarRef = useRef<HTMLDivElement | null>(null);
  const midBarRef = useRef<HTMLDivElement | null>(null);
  const trebleBarRef = useRef<HTMLDivElement | null>(null);
  const peakTextRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let phase = 0;

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const w = Math.floor(rect.width * dpr);
        const h = Math.floor(rect.height * dpr);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
      }
    };

    resizeCanvas();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resizeCanvas) : null;
    ro?.observe(canvas);

    const draw = () => {
      resizeCanvas();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      const frame = getVisualizerFrame();
      const freq = frame.frequencyData;
      const wave = frame.timeDomainData;
      const active = frame.isActive;
      const mutedOnly = frame.isMuted && !micActive;
      const currentMode = modeRef.current;

      ctx.clearRect(0, 0, w, h);

      // Subtle studio grid lines
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = Math.max(1, dpr);
      for (let g = 1; g <= 3; g++) {
        const gy = (h / 4) * g;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      // Compute Bass / Mid / Treble levels
      const len = freq.length || 1;
      const bassEnd = Math.max(1, Math.floor(len * 0.16));
      const midEnd = Math.max(bassEnd + 1, Math.floor(len * 0.52));

      let bassSum = 0;
      let midSum = 0;
      let trebleSum = 0;
      let maxVal = 0;

      for (let i = 0; i < len; i++) {
        const v = freq[i] || 0;
        if (v > maxVal) maxVal = v;
        if (i < bassEnd) bassSum += v;
        else if (i < midEnd) midSum += v;
        else trebleSum += v;
      }

      const bassPct = active ? Math.round((bassSum / (bassEnd * 255)) * 100) : 0;
      const midPct = active ? Math.round((midSum / (Math.max(1, midEnd - bassEnd) * 255)) * 100) : 0;
      const treblePct = active ? Math.round((trebleSum / (Math.max(1, len - midEnd) * 255)) * 100) : 0;

      if (bassBarRef.current) bassBarRef.current.style.width = `${Math.min(100, bassPct)}%`;
      if (midBarRef.current) midBarRef.current.style.width = `${Math.min(100, midPct)}%`;
      if (trebleBarRef.current) trebleBarRef.current.style.width = `${Math.min(100, treblePct)}%`;
      if (peakTextRef.current) {
        const db = maxVal > 0 ? Math.round(20 * Math.log10(maxVal / 255)) : -60;
        peakTextRef.current.textContent = `${Math.max(-60, db)} dBFS`;
      }

      // Draw Spectrum Bars (for 'spectrum' and 'hybrid')
      if (currentMode === 'spectrum' || currentMode === 'hybrid') {
        const barCount = 56;
        const gap = Math.max(2 * dpr, w * 0.004);
        const barW = Math.max(2 * dpr, (w - gap * (barCount - 1)) / barCount);
        const maxBarH = currentMode === 'hybrid' ? h * 0.72 : h * 0.88;

        for (let i = 0; i < barCount; i++) {
          const binIdx = Math.min(len - 1, Math.floor((i / barCount) * len * 0.85));
          const rawVal = active ? (freq[binIdx] || 0) / 255 : 0;
          const scaledVal = mutedOnly ? rawVal * 0.3 : rawVal;

          // Smooth attack/decay
          const prev = smoothBarsRef.current[i] || 0;
          const next = scaledVal > prev ? prev + (scaledVal - prev) * 0.55 : prev * 0.86;
          smoothBarsRef.current[i] = next;

          // Peak hold cap
          if (next >= (peaksRef.current[i] || 0)) {
            peaksRef.current[i] = next;
          } else {
            peaksRef.current[i] = Math.max(0, (peaksRef.current[i] || 0) - 0.009);
          }

          const x = i * (barW + gap);
          const barH = Math.max(3 * dpr, next * maxBarH);
          const y = h - barH;

          const grad = ctx.createLinearGradient(0, h, 0, y);
          if (mutedOnly) {
            grad.addColorStop(0, 'rgba(245, 158, 11, 0.28)');
            grad.addColorStop(1, 'rgba(251, 191, 36, 0.82)');
          } else if (active) {
            grad.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
            grad.addColorStop(0.55, 'rgba(16, 185, 129, 0.85)');
            grad.addColorStop(1, 'rgba(52, 211, 153, 1)');
          } else {
            grad.addColorStop(0, 'rgba(51, 65, 85, 0.35)');
            grad.addColorStop(1, 'rgba(71, 85, 105, 0.6)');
          }

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x, y, barW, barH, [3 * dpr, 3 * dpr, 0, 0]);
          ctx.fill();

          // Peak cap dot
          if (peaksRef.current[i] > 0.04) {
            const capY = Math.max(2 * dpr, h - peaksRef.current[i] * maxBarH - 3 * dpr);
            ctx.fillStyle = mutedOnly ? 'rgba(251, 191, 36, 0.9)' : 'rgba(167, 243, 208, 0.95)';
            ctx.fillRect(x, capY, barW, Math.max(2 * dpr, 2));
          }
        }
      }

      // Draw Live Waveform Ribbon (for 'waveform' and 'hybrid')
      if (currentMode === 'waveform' || currentMode === 'hybrid') {
        phase += active ? 0.06 : 0.02;
        const waveLen = wave.length || 128;
        const centerY = currentMode === 'hybrid' ? h * 0.34 : h * 0.5;
        const ampScale = currentMode === 'hybrid' ? h * 0.28 : h * 0.44;

        ctx.save();
        ctx.lineWidth = (currentMode === 'waveform' ? 2.6 : 2) * dpr;
        ctx.strokeStyle = mutedOnly
          ? 'rgba(251, 191, 36, 0.85)'
          : active
            ? '#34d399'
            : 'rgba(100, 116, 139, 0.5)';
        ctx.shadowColor = active && !mutedOnly ? 'rgba(16, 185, 129, 0.55)' : 'transparent';
        ctx.shadowBlur = active ? 10 * dpr : 0;

        ctx.beginPath();
        const step = Math.max(1, Math.floor(waveLen / 160));
        let pointIdx = 0;
        const totalPts = Math.ceil(waveLen / step);

        for (let i = 0; i < waveLen; i += step) {
          const x = (pointIdx / Math.max(1, totalPts - 1)) * w;
          let normalized = ((wave[i] ?? 128) - 128) / 128;
          if (!active) {
            // Gentle idle breathing sine curve
            normalized = Math.sin(phase + pointIdx * 0.14) * 0.05;
          } else if (mutedOnly) {
            normalized *= 0.35;
          }
          const y = centerY + normalized * ampScale;
          if (pointIdx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          pointIdx++;
        }
        ctx.stroke();
        ctx.restore();
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
    };
  }, [getVisualizerFrame, micActive]);

  return (
    <section
      aria-label="ویژوالایزر صوتی و موجنمای زنده"
      className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
              isPlaying || micActive
                ? isMuted && !micActive
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-800/80 border-slate-700 text-slate-400'
            }`}
          >
            <AudioWaveform className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100">
                ویژوالایزر صوتی زنده (موجنما و طیف فرکانس)
              </h3>
              {(isPlaying || micActive) && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>پویا</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 truncate mt-0.5">
              {trackTitle
                ? `تحلیل بلادرنگ فرکانس‌ها: ${trackTitle}`
                : micActive
                  ? 'نمایش زنده طیف صدای میکروفون در ویسکال'
                  : 'با پخش آهنگ، طیف فرکانس و موجنمای صدا به صورت زنده نمایش داده می‌شود'}
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center gap-1.5 bg-[#0B0F17] p-1 rounded-lg border border-slate-800">
          {[
            {id: 'hybrid' as const, label: 'ترکیبی', icon: Sliders},
            {id: 'waveform' as const, label: 'موجنما', icon: Activity},
            {id: 'spectrum' as const, label: 'طیف فرکانس', icon: BarChart2},
          ].map((item) => {
            const Icon = item.icon;
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* High-FPS Canvas Surface */}
      <div className="relative rounded-xl bg-[#0B0F17] border border-slate-800/90 overflow-hidden p-3">
        <canvas ref={canvasRef} className="w-full h-36 sm:h-40 block" />
        <div className="mt-2 pt-2 border-t border-slate-800/70 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-slate-400">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span>BASS</span>
              <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  ref={bassBarRef}
                  style={{width: '0%'}}
                  className="h-full bg-emerald-500 transition-[width] duration-75"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span>MID</span>
              <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  ref={midBarRef}
                  style={{width: '0%'}}
                  className="h-full bg-cyan-400 transition-[width] duration-75"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span>HIGH</span>
              <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  ref={trebleBarRef}
                  style={{width: '0%'}}
                  className="h-full bg-amber-400 transition-[width] duration-75"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 tabular-nums" dir="ltr">
            <span>
              PEAK:{' '}
              <span ref={peakTextRef} className="text-slate-200">
                -60 dBFS
              </span>
            </span>
            <span>·</span>
            <span className="text-emerald-400">{(actualSampleRate / 1000).toFixed(1)} kHz</span>
            {baseLatencyMs > 0 && (
              <>
                <span>·</span>
                <span className="text-slate-300">{baseLatencyMs} ms</span>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
