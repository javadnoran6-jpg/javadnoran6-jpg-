import React, {useState} from 'react';
import {
  AudioWaveform,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  Gauge,
  Radio,
  RotateCcw,
  SlidersHorizontal,
  Wifi,
} from 'lucide-react';
import {
  DEFAULT_AUDIO_SETTINGS,
  RUBIKA_AUDIO_PROFILES,
  detectAudioProfileId,
} from '../hooks/useVoiceAudioEngine';
import {AudioEngineSettings, RubikaAudioProfileId} from '../types/bot';

interface AudioLatencySettingsPanelProps {
  settings: AudioEngineSettings;
  telemetry: {
    actualSampleRate: number;
    baseLatencyMs: number;
    outputLatencyMs: number;
    contextState: AudioContextState | 'uninitialized';
  };
  rubikaConnected?: boolean;
  onChangeSettings: (next: AudioEngineSettings) => void;
}

const SAMPLE_RATE_OPTIONS: Array<{
  value: AudioEngineSettings['sampleRate'];
  label: string;
  hint: string;
}> = [
  {value: 48000, label: '48,000 Hz (48 kHz)', hint: 'استودیویی · پیشنهادی ویسکال و Opus'},
  {value: 44100, label: '44,100 Hz (44.1 kHz)', hint: 'استاندارد پخش موسیقی CD'},
  {value: 32000, label: '32,000 Hz (32 kHz)', hint: 'بهینه برای اینترنت متوسط'},
  {value: 24000, label: '24,000 Hz (24 kHz)', hint: 'کاهش حجم و تأخیر در تماس صوتی'},
  {value: 16000, label: '16,000 Hz (16 kHz)', hint: 'حداقل پهنای باند مکالمه'},
];

const LATENCY_MODE_OPTIONS: Array<{
  value: AudioEngineSettings['latencyHint'];
  bufferSize: AudioEngineSettings['bufferSize'];
  label: string;
  desc: string;
}> = [
  {
    value: 'interactive',
    bufferSize: 512,
    label: 'فوق‌کم‌تأخیر (Interactive)',
    desc: 'کمترین تأخیر ممکن برای پخش زنده و مکالمه همزمان',
  },
  {
    value: 'balanced',
    bufferSize: 1024,
    label: 'متعادل (Balanced)',
    desc: 'تعادل بین تأخیر کم و پایداری بدون پرش صدا',
  },
  {
    value: 'playback',
    bufferSize: 2048,
    label: 'پایدار پخش (Playback)',
    desc: 'بافر بزرگ‌تر برای شبکه‌های ناپایدار و جلوگیری از خش صدا',
  },
];

const BITRATE_OPTIONS: Array<NonNullable<AudioEngineSettings['streamBitrateKbps']>> = [
  32, 64, 96, 128, 192,
];
const BUFFER_SIZES: AudioEngineSettings['bufferSize'][] = [256, 512, 1024, 2048, 4096];
const FFT_SIZES: AudioEngineSettings['fftSize'][] = [64, 128, 256, 512];

const PROFILE_ORDER: Array<Exclude<RubikaAudioProfileId, 'custom'>> = [
  'high_fidelity',
  'balance',
  'data_saver',
];

export const AudioLatencySettingsPanel: React.FC<AudioLatencySettingsPanelProps> = ({
  settings,
  telemetry,
  rubikaConnected = false,
  onChangeSettings,
}) => {
  const [expanded, setExpanded] = useState(true);

  const activeProfileId = detectAudioProfileId(settings);
  const activeProfileMeta =
    activeProfileId !== 'custom' ? RUBIKA_AUDIO_PROFILES[activeProfileId] : null;
  const activeBitrate = settings.streamBitrateKbps ?? 64;
  const activeChannels = settings.channels ?? 'stereo';
  const theoreticalBufferMs = ((settings.bufferSize / settings.sampleRate) * 1000).toFixed(1);
  const totalMeasuredLatencyMs = Number(
    (telemetry.baseLatencyMs + telemetry.outputLatencyMs).toFixed(2),
  );

  const applyProfile = (profileId: Exclude<RubikaAudioProfileId, 'custom'>) => {
    onChangeSettings({...RUBIKA_AUDIO_PROFILES[profileId].settings});
  };

  const updateCustomSettings = (patch: Partial<AudioEngineSettings>) => {
    const merged: AudioEngineSettings = {...settings, ...patch};
    onChangeSettings({
      ...merged,
      profile: detectAudioProfileId(merged),
    });
  };

  const handleLatencyHintChange = (hint: AudioEngineSettings['latencyHint']) => {
    const preset = LATENCY_MODE_OPTIONS.find((o) => o.value === hint);
    updateCustomSettings({
      latencyHint: hint,
      bufferSize: preset ? preset.bufferSize : settings.bufferSize,
    });
  };

  return (
    <section
      id="vc-advanced-audio-menu"
      aria-label="منوی پیشرفته تنظیمات صوتی و پروفایل استریم روبیکا"
      className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden"
    >
      {/* Header & Instant Profile Segmented Switcher */}
      <div className="p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
            <SlidersHorizontal className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100">
                منوی پیشرفته تنظیمات صوتی و استریم روبیکا
              </h3>
              <span className="text-[11px] font-mono tabular-nums text-emerald-400">
                · {activeProfileMeta ? activeProfileMeta.name : 'Custom'} ·{' '}
                {(settings.sampleRate / 1000).toFixed(1)} kHz · {activeBitrate} kbps ·{' '}
                {activeChannels === 'mono' ? 'Mono' : 'Stereo'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              سوئیچ فوری بین پروفایل‌های پیش‌فرض استریم ویسکال روبیکا و تنظیم دقیق بیت‌ریت، نرخ نمونه‌برداری و بافر
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Quick 1-click Segmented Profile Bar */}
          <div
            role="group"
            aria-label="انتخاب سریع پروفایل صوتی"
            className="flex items-center gap-1 p-1 rounded-lg bg-[#0B0F17] border border-slate-800"
            dir="ltr"
          >
            {PROFILE_ORDER.map((pid) => {
              const meta = RUBIKA_AUDIO_PROFILES[pid];
              const isSelected = activeProfileId === pid;
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => applyProfile(pid)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3" />}
                  <span>{meta.name}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onChangeSettings(DEFAULT_AUDIO_SETTINGS)}
            className="px-3 py-1.5 rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
            <span>پیش‌فرض</span>
          </button>

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>بستن منو</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>تنظیمات دقیق</span>
              </>
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 pt-4 border-t border-slate-800/80 space-y-5">
          {/* Rubika Stream Default Profile Selector Cards */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                <Radio className="w-3.5 h-3.5 text-emerald-400" />
                <span>پروفایل‌های پیش‌فرض استریم صوتی در ویسکال روبیکا</span>
                {activeProfileId === 'custom' && (
                  <span className="text-[11px] text-amber-400">
                    · تنظیمات دستی فعال (Custom)
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400">
                {rubikaConnected
                  ? 'تغییر پروفایل هم‌زمان روی پخش زنده گروه روبیکا اعمال می‌شود'
                  : 'پروفایل انتخابی برای موتور ویسکال مرورگر و استریم روبیکا ذخیره می‌شود'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {PROFILE_ORDER.map((pid) => {
                const meta = RUBIKA_AUDIO_PROFILES[pid];
                const isSelected = activeProfileId === pid;
                const Icon =
                  pid === 'high_fidelity'
                    ? AudioWaveform
                    : pid === 'balance'
                      ? Gauge
                      : Wifi;
                const bufferMs = (
                  (meta.settings.bufferSize / meta.settings.sampleRate) *
                  1000
                ).toFixed(1);

                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => applyProfile(pid)}
                    className={`text-right p-4 rounded-xl border transition-colors cursor-pointer flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500/60'
                        : 'bg-[#0B0F17] border-slate-800 hover:border-slate-700 hover:bg-slate-900/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              dir="ltr"
                              className="text-sm font-bold text-slate-100 whitespace-nowrap"
                            >
                              {meta.name}
                            </span>
                            <span className="text-[11px] text-slate-400 truncate">
                              · {meta.faTitle}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                            {meta.summary}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-[11px] font-medium whitespace-nowrap shrink-0 flex items-center gap-1 ${
                          isSelected ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                      >
                        {isSelected ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>فعال</span>
                          </>
                        ) : (
                          <span>انتخاب</span>
                        )}
                      </span>
                    </div>

                    <div
                      dir="ltr"
                      className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-300"
                    >
                      <span>
                        {(meta.settings.sampleRate / 1000).toFixed(1)} kHz ·{' '}
                        {meta.settings.streamBitrateKbps} kbps ·{' '}
                        {meta.settings.channels === 'mono' ? 'Mono' : 'Stereo'}
                      </span>
                      <span className="text-slate-400">
                        ~{bufferMs} ms · {meta.dataEstimate}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fine-grained Rubika Bitrate, Channel & Engine Controls */}
          <div className="pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* Rubika Stream Bitrate */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                بیت‌ریت کدک Opus استریم روبیکا (kbps)
              </label>
              <div className="grid grid-cols-5 gap-1.5" dir="ltr">
                {BITRATE_OPTIONS.map((kbps) => {
                  const active = activeBitrate === kbps;
                  return (
                    <button
                      key={kbps}
                      type="button"
                      onClick={() => updateCustomSettings({streamBitrateKbps: kbps})}
                      className={`py-2 rounded-lg text-[11px] font-mono tabular-nums border transition-colors cursor-pointer ${
                        active
                          ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300 font-semibold'
                          : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      {kbps}k
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                مصرف تخمینی: ~{Math.round((activeBitrate * 3600) / 8 / 1024)} MB در ساعت
              </p>
            </div>

            {/* Output Channels (Stereo vs Mono) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                کانال خروجی ویسکال (Audio Channels)
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => updateCustomSettings({channels: 'stereo'})}
                  className={`py-2 px-3 rounded-lg text-xs border transition-colors whitespace-nowrap cursor-pointer ${
                    activeChannels === 'stereo'
                      ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300 font-semibold'
                      : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  استریو دوکاناله (Stereo)
                </button>
                <button
                  type="button"
                  onClick={() => updateCustomSettings({channels: 'mono'})}
                  className={`py-2 px-3 rounded-lg text-xs border transition-colors whitespace-nowrap cursor-pointer ${
                    activeChannels === 'mono'
                      ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300 font-semibold'
                      : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  مونو کم‌مصرف (Mono)
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                {activeChannels === 'stereo'
                  ? 'تفکیک چپ و راست واقعی برای پخش حرفه‌ای موزیک'
                  : 'کاهش مصرف پهنای باند و پایداری بیشتر روی اینترنت موبایل'}
              </p>
            </div>

            {/* Sample Rate */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                نرخ نمونه‌برداری (Sample Rate)
              </label>
              <select
                dir="ltr"
                value={settings.sampleRate}
                onChange={(e) =>
                  updateCustomSettings({
                    sampleRate: Number(e.target.value) as AudioEngineSettings['sampleRate'],
                  })
                }
                className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 outline-none"
              >
                {SAMPLE_RATE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400">
                {SAMPLE_RATE_OPTIONS.find((o) => o.value === settings.sampleRate)?.hint}
              </p>
            </div>

            {/* Latency / Buffer Mode */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                حالت بافر و تأخیر پخش (Latency Hint)
              </label>
              <select
                value={settings.latencyHint}
                onChange={(e) =>
                  handleLatencyHintChange(
                    e.target.value as AudioEngineSettings['latencyHint'],
                  )
                }
                className="w-full bg-[#0B0F17] border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none"
              >
                {LATENCY_MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400">
                {LATENCY_MODE_OPTIONS.find((o) => o.value === settings.latencyHint)?.desc}
              </p>
            </div>

            {/* Exact Audio Buffer Size */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                اندازه بافر صوتی (Buffer Frames)
              </label>
              <div className="grid grid-cols-5 gap-1.5" dir="ltr">
                {BUFFER_SIZES.map((sz) => {
                  const active = settings.bufferSize === sz;
                  return (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => {
                        const inferredHint: AudioEngineSettings['latencyHint'] =
                          sz <= 512 ? 'interactive' : sz <= 1024 ? 'balanced' : 'playback';
                        updateCustomSettings({
                          bufferSize: sz,
                          latencyHint: inferredHint,
                        });
                      }}
                      className={`py-2 rounded-lg text-[11px] font-mono tabular-nums border transition-colors cursor-pointer ${
                        active
                          ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300 font-semibold'
                          : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      {sz}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                تأخیر تئوری بافر: ~{theoreticalBufferMs} میلی‌ثانیه
              </p>
            </div>

            {/* FFT Resolution */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                دقت تحلیلگر فرکانس (FFT Size)
              </label>
              <div className="grid grid-cols-4 gap-1.5" dir="ltr">
                {FFT_SIZES.map((sz) => {
                  const active = settings.fftSize === sz;
                  return (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => updateCustomSettings({fftSize: sz})}
                      className={`py-2 rounded-lg text-[11px] font-mono tabular-nums border transition-colors cursor-pointer ${
                        active
                          ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300 font-semibold'
                          : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      {sz}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400">
                {settings.fftSize / 2} باند فرکانسی در موجنمای زنده
              </p>
            </div>
          </div>

          {/* DSP Processing Toggles + Live Hardware Telemetry */}
          <div className="pt-4 border-t border-slate-800/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.volumeNormalization !== false}
                  onChange={(e) =>
                    updateCustomSettings({volumeNormalization: e.target.checked})
                  }
                  className="accent-emerald-500 rounded cursor-pointer"
                />
                <span>نرمال‌سازی خودکار صدا (Loudness Norm)</span>
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.echoCancellation}
                  onChange={(e) =>
                    updateCustomSettings({echoCancellation: e.target.checked})
                  }
                  className="accent-emerald-500 rounded cursor-pointer"
                />
                <span>حذف اکو (Echo Cancellation)</span>
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.noiseSuppression}
                  onChange={(e) =>
                    updateCustomSettings({noiseSuppression: e.target.checked})
                  }
                  className="accent-emerald-500 rounded cursor-pointer"
                />
                <span>کاهش نویز محیط (Noise Suppression)</span>
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.autoGainControl}
                  onChange={(e) =>
                    updateCustomSettings({autoGainControl: e.target.checked})
                  }
                  className="accent-emerald-500 rounded cursor-pointer"
                />
                <span>تنظیم خودکار گین (Auto Gain)</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 rounded-lg bg-[#0B0F17] border border-slate-800 text-[11px] font-mono tabular-nums text-slate-300">
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                <span>نرخ واقعی:</span>
                <span className="text-emerald-300 font-semibold">
                  {telemetry.actualSampleRate.toLocaleString('en-US')} Hz
                </span>
              </div>
              <span className="text-slate-600">·</span>
              <div className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-emerald-400" />
                <span>Opus:</span>
                <span className="text-slate-100 font-semibold">
                  {activeBitrate} kbps {activeChannels === 'mono' ? 'Mono' : 'Stereo'}
                </span>
              </div>
              <span className="text-slate-600">·</span>
              <div className="flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                <span>تأخیر:</span>
                <span className="text-cyan-300 font-semibold">
                  {totalMeasuredLatencyMs > 0 ? `${totalMeasuredLatencyMs} ms` : `~${theoreticalBufferMs} ms`}
                </span>
              </div>
              <span className="text-slate-600">·</span>
              <span>
                وضعیت:{' '}
                <span
                  className={
                    telemetry.contextState === 'running' ? 'text-emerald-400' : 'text-amber-400'
                  }
                >
                  {telemetry.contextState === 'running'
                    ? 'فعال (Running)'
                    : telemetry.contextState === 'suspended'
                      ? 'آماده‌باش'
                      : 'در انتظار پخش'}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
