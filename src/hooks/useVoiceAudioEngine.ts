import {useCallback, useEffect, useRef, useState} from 'react';
import {AudioEngineSettings, RubikaAudioProfileId, Track} from '../types/bot';

export interface RubikaAudioProfileMeta {
  id: Exclude<RubikaAudioProfileId, 'custom'>;
  name: string;
  faTitle: string;
  summary: string;
  dataEstimate: string;
  settings: AudioEngineSettings;
}

export const RUBIKA_AUDIO_PROFILES: Record<
  Exclude<RubikaAudioProfileId, 'custom'>,
  RubikaAudioProfileMeta
> = {
  high_fidelity: {
    id: 'high_fidelity',
    name: 'High-Fidelity',
    faTitle: 'کیفیت استودیویی',
    summary: 'استریو 48 kHz با بیت‌ریت 128 kbps و حداکثر جزئیات فرکانسی موسیقی در ویسکال',
    dataEstimate: '~57 MB/h',
    settings: {
      profile: 'high_fidelity',
      streamBitrateKbps: 128,
      channels: 'stereo',
      volumeNormalization: true,
      sampleRate: 48000,
      latencyHint: 'interactive',
      bufferSize: 512,
      fftSize: 512,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    },
  },
  balance: {
    id: 'balance',
    name: 'Balance',
    faTitle: 'متعادل و پایدار',
    summary: 'تعادل هوشمند کیفیت موسیقی 44.1 kHz (64 kbps استریو) و پایداری روی اینترنت عادی',
    dataEstimate: '~28 MB/h',
    settings: {
      profile: 'balance',
      streamBitrateKbps: 64,
      channels: 'stereo',
      volumeNormalization: true,
      sampleRate: 44100,
      latencyHint: 'balanced',
      bufferSize: 1024,
      fftSize: 256,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  },
  data_saver: {
    id: 'data_saver',
    name: 'Data-Saver',
    faTitle: 'مصرف بهینه دیتا',
    summary: 'استریم مونو 24 kHz با بیت‌ریت 32 kbps و بافر ضدقطع مناسب اینترنت ضعیف (کاهش ~75٪ مصرف)',
    dataEstimate: '~14 MB/h',
    settings: {
      profile: 'data_saver',
      streamBitrateKbps: 32,
      channels: 'mono',
      volumeNormalization: false,
      sampleRate: 24000,
      latencyHint: 'playback',
      bufferSize: 2048,
      fftSize: 128,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  },
};

export function detectAudioProfileId(settings: AudioEngineSettings): RubikaAudioProfileId {
  for (const preset of Object.values(RUBIKA_AUDIO_PROFILES)) {
    const p = preset.settings;
    if (
      p.sampleRate === settings.sampleRate &&
      p.latencyHint === settings.latencyHint &&
      p.bufferSize === settings.bufferSize &&
      p.fftSize === settings.fftSize &&
      (p.streamBitrateKbps ?? 64) === (settings.streamBitrateKbps ?? 64) &&
      (p.channels ?? 'stereo') === (settings.channels ?? 'stereo') &&
      Boolean(p.volumeNormalization) === Boolean(settings.volumeNormalization ?? true) &&
      p.echoCancellation === settings.echoCancellation &&
      p.noiseSuppression === settings.noiseSuppression &&
      p.autoGainControl === settings.autoGainControl
    ) {
      return preset.id;
    }
  }
  return 'custom';
}

export const DEFAULT_AUDIO_SETTINGS: AudioEngineSettings = RUBIKA_AUDIO_PROFILES.balance.settings;

interface UseVoiceAudioEngineOptions {
  currentTrack: Track | null;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  voiceCallActive: boolean;
  audioSettings?: AudioEngineSettings;
  onTrackEnded: () => void;
}

const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export interface AudioVisualizerFrame {
  frequencyData: Uint8Array;
  timeDomainData: Uint8Array;
  isActive: boolean;
  isMuted: boolean;
  sampleRate: number;
}

export function useVoiceAudioEngine({
  currentTrack,
  isPlaying,
  isMuted,
  volume,
  voiceCallActive,
  audioSettings = DEFAULT_AUDIO_SETTINGS,
  onTrackEnded,
}: UseVoiceAudioEngineOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const compressorNodeRef = useRef<DynamicsCompressorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const callBroadcastDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const freqScratchRef = useRef<Uint8Array<ArrayBuffer>>(
    new Uint8Array(audioSettings.fftSize / 2),
  );
  const waveScratchRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(audioSettings.fftSize));

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [frequencyBars, setFrequencyBars] = useState<number[]>(() => Array(20).fill(6));
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [callMusicStream, setCallMusicStream] = useState<MediaStream | null>(null);
  const [engineTelemetry, setEngineTelemetry] = useState<{
    actualSampleRate: number;
    baseLatencyMs: number;
    outputLatencyMs: number;
    contextState: AudioContextState | 'uninitialized';
  }>({
    actualSampleRate: audioSettings.sampleRate,
    baseLatencyMs: 0,
    outputLatencyMs: 0,
    contextState: 'uninitialized',
  });

  const lastLoadedTrackIdRef = useRef<string | null>(null);
  const elementUnlockedRef = useRef(false);
  const settingsRef = useRef(audioSettings);
  settingsRef.current = audioSettings;
  const activeEngineKeyRef = useRef<string>(
    `${audioSettings.sampleRate}:${audioSettings.latencyHint}`,
  );
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const micActiveRef = useRef(micActive);
  micActiveRef.current = micActive;
  const onEndedRef = useRef(onTrackEnded);
  onEndedRef.current = onTrackEnded;

  const syncTelemetry = useCallback((ctx: AudioContext | null) => {
    if (!ctx) return;
    const extCtx = ctx as AudioContext & {outputLatency?: number};
    setEngineTelemetry({
      actualSampleRate: ctx.sampleRate || settingsRef.current.sampleRate,
      baseLatencyMs: Number(((ctx.baseLatency || 0) * 1000).toFixed(2)),
      outputLatencyMs: Number(((extCtx.outputLatency || 0) * 1000).toFixed(2)),
      contextState: ctx.state,
    });
  }, []);

  const attachAudioListeners = useCallback((audio: HTMLAudioElement) => {
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const handleLoadedMetadata = () => {
      if (audio.src.startsWith('data:')) return;
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setIsBuffering(false);
      setAudioError(null);
    };
    const handleWaiting = () => {
      if (!audio.src.startsWith('data:')) setIsBuffering(true);
    };
    const handleCanPlay = () => {
      setIsBuffering(false);
      setAudioError(null);
    };
    const handleEnded = () => {
      if (!audio.src || audio.src.startsWith('data:')) return;
      onEndedRef.current();
    };
    const handleError = () => {
      if (!audio.src || audio.src.startsWith('data:')) return;
      setIsBuffering(false);
      setAudioError('خطا در بارگذاری جریان صوتی این لینک. لینک دیگری امتحان کنید.');
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, []);

  const cleanupListenersRef = useRef<(() => void) | null>(null);

  const ensureAudioGraph = useCallback(() => {
    if (!audioRef.current) return;
    if (!audioCtxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
      const s = settingsRef.current;
      let ctx: AudioContext;
      try {
        ctx = new Ctx({
          sampleRate: s.sampleRate,
          latencyHint: s.latencyHint,
        });
      } catch {
        ctx = new Ctx({latencyHint: s.latencyHint});
      }
      const gain = ctx.createGain();
      gain.gain.value = isMutedRef.current ? 0 : Math.max(0, Math.min(1, volumeRef.current / 100));

      const compressor = ctx.createDynamicsCompressor();
      const normEnabled = s.volumeNormalization !== false;
      compressor.threshold.setValueAtTime(normEnabled ? -18 : 0, ctx.currentTime);
      compressor.knee.setValueAtTime(normEnabled ? 24 : 0, ctx.currentTime);
      compressor.ratio.setValueAtTime(normEnabled ? 4 : 1, ctx.currentTime);
      compressor.attack.setValueAtTime(0.005, ctx.currentTime);
      compressor.release.setValueAtTime(0.2, ctx.currentTime);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = s.fftSize;
      analyser.smoothingTimeConstant = 0.78;

      const callDest = ctx.createMediaStreamDestination();
      const targetChannels = s.channels === 'mono' ? 1 : 2;
      try {
        callDest.channelCount = targetChannels;
        callDest.channelCountMode = 'explicit';
        gain.channelCount = targetChannels;
        gain.channelCountMode = 'explicit';
      } catch {
        // ignore if browser restricts channelCount
      }

      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(compressor);
      compressor.connect(gain);
      gain.connect(analyser);
      analyser.connect(ctx.destination);
      gain.connect(callDest);

      if (micStreamRef.current) {
        try {
          const micSrc = ctx.createMediaStreamSource(micStreamRef.current);
          micSrc.connect(analyser);
          micSourceRef.current = micSrc;
        } catch {
          // ignore
        }
      }

      audioCtxRef.current = ctx;
      gainNodeRef.current = gain;
      compressorNodeRef.current = compressor;
      analyserRef.current = analyser;
      sourceNodeRef.current = source;
      callBroadcastDestRef.current = callDest;
      activeEngineKeyRef.current = `${s.sampleRate}:${s.latencyHint}`;
      setCallMusicStream(callDest.stream);
      syncTelemetry(ctx);
    }
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume().then(() => syncTelemetry(audioCtxRef.current));
    } else {
      syncTelemetry(audioCtxRef.current);
    }
  }, [syncTelemetry]);

  // Must be called synchronously inside user click/submit so async audio.play() is never blocked
  const primeAudio = useCallback(() => {
    ensureAudioGraph();
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume().catch(() => undefined);
    }
    const audio = audioRef.current;
    if (!audio || elementUnlockedRef.current) return;
    if (!audio.src && !lastLoadedTrackIdRef.current) {
      elementUnlockedRef.current = true;
      audio.src = SILENT_WAV_DATA_URI;
      void audio
        .play()
        .then(() => {
          // Only clear if a real track hasn't already replaced audio.src
          if (audio.src === SILENT_WAV_DATA_URI && !lastLoadedTrackIdRef.current) {
            audio.pause();
            audio.removeAttribute('src');
          }
        })
        .catch(() => {
          elementUnlockedRef.current = false;
        });
    } else {
      elementUnlockedRef.current = true;
    }
  }, [ensureAudioGraph]);

  // Real synthesized telephone / VoIP call tone via Web Audio API
  const playCallTone = useCallback(
    (kind: 'ring' | 'connect' | 'hangup') => {
      ensureAudioGraph();
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      const now = ctx.currentTime;
      const playBeep = (freq: number, startOffset: number, dur: number, vol = 0.08) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + startOffset);
        g.gain.setValueAtTime(0.0001, now + startOffset);
        g.gain.exponentialRampToValueAtTime(vol, now + startOffset + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + dur);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + startOffset);
        osc.stop(now + startOffset + dur + 0.02);
      };

      if (kind === 'ring') {
        playBeep(425, 0.0, 0.38, 0.07);
        playBeep(425, 0.52, 0.38, 0.07);
      } else if (kind === 'connect') {
        playBeep(523.25, 0.0, 0.14, 0.09);
        playBeep(659.25, 0.12, 0.22, 0.09);
      } else {
        playBeep(480, 0.0, 0.16, 0.08);
        playBeep(340, 0.17, 0.24, 0.08);
      }
    },
    [ensureAudioGraph],
  );

  // Create persistent audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    audioRef.current = audio;
    cleanupListenersRef.current = attachAudioListeners(audio);

    return () => {
      audio.pause();
      cleanupListenersRef.current?.();
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioCtxRef.current) {
        void audioCtxRef.current.close();
      }
    };
  }, [attachAudioListeners]);

  // Dynamically update analyser FFT size without resetting AudioContext
  useEffect(() => {
    if (analyserRef.current && analyserRef.current.fftSize !== audioSettings.fftSize) {
      analyserRef.current.fftSize = audioSettings.fftSize;
    }
    freqScratchRef.current = new Uint8Array(audioSettings.fftSize / 2);
    waveScratchRef.current = new Uint8Array(audioSettings.fftSize);
  }, [audioSettings.fftSize]);

  // Dynamically update loudness normalization and mono/stereo channels
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (compressorNodeRef.current) {
      const norm = audioSettings.volumeNormalization !== false;
      compressorNodeRef.current.threshold.setValueAtTime(norm ? -18 : 0, ctx.currentTime);
      compressorNodeRef.current.knee.setValueAtTime(norm ? 24 : 0, ctx.currentTime);
      compressorNodeRef.current.ratio.setValueAtTime(norm ? 4 : 1, ctx.currentTime);
    }
    const targetChannels = audioSettings.channels === 'mono' ? 1 : 2;
    try {
      if (callBroadcastDestRef.current) {
        callBroadcastDestRef.current.channelCount = targetChannels;
      }
      if (gainNodeRef.current) {
        gainNodeRef.current.channelCount = targetChannels;
      }
    } catch {
      // ignore if browser restricts channelCount
    }
  }, [audioSettings.volumeNormalization, audioSettings.channels]);

  // Dynamically reconfigure AudioContext when sampleRate or latencyHint changes
  useEffect(() => {
    const nextKey = `${audioSettings.sampleRate}:${audioSettings.latencyHint}`;
    if (!audioCtxRef.current || activeEngineKeyRef.current === nextKey) return;

    const oldAudio = audioRef.current;
    const prevSrc = oldAudio?.src && !oldAudio.src.startsWith('data:') ? oldAudio.src : '';
    const prevTime = oldAudio && Number.isFinite(oldAudio.currentTime) ? oldAudio.currentTime : 0;
    const shouldResume = Boolean(isPlayingRef.current && prevSrc);

    if (oldAudio) {
      oldAudio.pause();
      cleanupListenersRef.current?.();
    }
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      sourceNodeRef.current = null;
    }
    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch {
        // ignore
      }
      micSourceRef.current = null;
    }
    void audioCtxRef.current.close().catch(() => undefined);
    audioCtxRef.current = null;
    gainNodeRef.current = null;
    compressorNodeRef.current = null;
    analyserRef.current = null;
    callBroadcastDestRef.current = null;

    const freshAudio = new Audio();
    freshAudio.crossOrigin = 'anonymous';
    freshAudio.preload = 'auto';
    audioRef.current = freshAudio;
    cleanupListenersRef.current = attachAudioListeners(freshAudio);

    ensureAudioGraph();

    if (prevSrc) {
      freshAudio.src = prevSrc;
      freshAudio.load();
      const restorePos = () => {
        if (prevTime > 0 && Number.isFinite(freshAudio.duration)) {
          freshAudio.currentTime = Math.min(prevTime, freshAudio.duration);
        }
        freshAudio.removeEventListener('loadedmetadata', restorePos);
      };
      freshAudio.addEventListener('loadedmetadata', restorePos);
      if (shouldResume) {
        void freshAudio.play().catch(() => undefined);
      }
    }
  }, [audioSettings.sampleRate, audioSettings.latencyHint, attachAudioListeners, ensureAudioGraph]);

  // Sync GainNode volume and mute (بیصدا keeps track playing with gain=0)
  useEffect(() => {
    const targetGain = isMuted ? 0 : Math.max(0, Math.min(1, volume / 100));
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(targetGain, audioCtxRef.current.currentTime, 0.04);
    }
    if (audioRef.current) {
      if (!sourceNodeRef.current) {
        audioRef.current.muted = isMuted;
        audioRef.current.volume = Math.max(0, Math.min(1, volume / 100));
      } else {
        audioRef.current.muted = false;
        audioRef.current.volume = 1;
      }
    }
  }, [isMuted, volume]);

  // Load track and control play/pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack) {
      audio.pause();
      audio.removeAttribute('src');
      lastLoadedTrackIdRef.current = null;
      setCurrentTime(0);
      setDuration(0);
      setAudioError(null);
      setIsBuffering(false);
      return;
    }

    const resolvedUrl = currentTrack.streamUrl.startsWith('/api/')
      ? currentTrack.streamUrl
      : `/api/music/stream?url=${encodeURIComponent(currentTrack.streamUrl)}`;

    if (lastLoadedTrackIdRef.current !== currentTrack.id) {
      lastLoadedTrackIdRef.current = currentTrack.id;
      setAudioError(null);
      setIsBuffering(true);
      audio.src = resolvedUrl;
      audio.load();
    }

    if (isPlaying) {
      ensureAudioGraph();
      audio
        .play()
        .then(() => {
          elementUnlockedRef.current = true;
          setAudioError(null);
        })
        .catch(() => {
          setIsBuffering(false);
          setAudioError('برای شنیدن صدای آهنگ در مرورگر روی دکمه «پخش صدا» کلیک کنید.');
        });
    } else {
      audio.pause();
    }
  }, [currentTrack, isPlaying, ensureAudioGraph]);

  // Smooth live progress ticker (~10Hz) so countdown & progress bar update smoothly
  useEffect(() => {
    if (!currentTrack || !isPlaying) return;
    const id = setInterval(() => {
      const audio = audioRef.current;
      if (audio && !audio.paused && Number.isFinite(audio.currentTime)) {
        setCurrentTime(audio.currentTime);
      }
    }, 100);
    return () => clearInterval(id);
  }, [currentTrack, isPlaying]);

  // Real-time FFT Spectrum Visualizer loop (for simple 20-bar array)
  useEffect(() => {
    let rafId = 0;

    const updateBars = () => {
      const analyser = analyserRef.current;
      if (analyser && (isPlaying || micActive)) {
        const binCount = analyser.frequencyBinCount;
        if (freqScratchRef.current.length !== binCount) {
          freqScratchRef.current = new Uint8Array(binCount);
        }
        analyser.getByteFrequencyData(freqScratchRef.current);
        const bars: number[] = [];
        const step = Math.max(1, Math.floor(binCount / 20));
        for (let i = 0; i < 20; i++) {
          const val = freqScratchRef.current[Math.min(binCount - 1, i * step)] || 0;
          const pct = Math.max(8, Math.round((val / 255) * 100));
          bars.push(isMuted && !micActive ? Math.min(22, Math.round(pct * 0.35)) : pct);
        }
        setFrequencyBars(bars);
      } else {
        setFrequencyBars((prev) => prev.map((v) => Math.max(6, Math.round(v * 0.85))));
      }
      rafId = requestAnimationFrame(updateBars);
    };

    rafId = requestAnimationFrame(updateBars);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, isMuted, micActive]);

  // Zero-rerender frame reader for high-FPS Canvas Audio Visualizer
  const getVisualizerFrame = useCallback((): AudioVisualizerFrame => {
    const analyser = analyserRef.current;
    const active = Boolean(analyser && (isPlayingRef.current || micActiveRef.current));
    if (analyser && active) {
      const binCount = analyser.frequencyBinCount;
      const fftLen = analyser.fftSize;
      if (freqScratchRef.current.length !== binCount) {
        freqScratchRef.current = new Uint8Array(binCount);
      }
      if (waveScratchRef.current.length !== fftLen) {
        waveScratchRef.current = new Uint8Array(fftLen);
      }
      analyser.getByteFrequencyData(freqScratchRef.current);
      analyser.getByteTimeDomainData(waveScratchRef.current);
    } else {
      freqScratchRef.current.fill(0);
      waveScratchRef.current.fill(128);
    }
    return {
      frequencyData: freqScratchRef.current,
      timeDomainData: waveScratchRef.current,
      isActive: active,
      isMuted: isMutedRef.current,
      sampleRate: audioCtxRef.current?.sampleRate || settingsRef.current.sampleRate,
    };
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    const maxDur =
      Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : seconds;
    const clamped = Math.max(0, Math.min(maxDur, seconds));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  }, []);

  const toggleMic = useCallback(async () => {
    setMicError(null);
    if (micActive) {
      if (micSourceRef.current) {
        micSourceRef.current.disconnect();
        micSourceRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      setMicActive(false);
      return;
    }

    try {
      ensureAudioGraph();
      const s = settingsRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: s.sampleRate,
          echoCancellation: s.echoCancellation,
          noiseSuppression: s.noiseSuppression,
          autoGainControl: s.autoGainControl,
        },
      });
      micStreamRef.current = stream;
      if (audioCtxRef.current && analyserRef.current) {
        const micSrc = audioCtxRef.current.createMediaStreamSource(stream);
        micSrc.connect(analyserRef.current);
        micSourceRef.current = micSrc;
      }
      setMicActive(true);
    } catch {
      setMicError('دسترسی میکروفون توسط مرورگر مسدود شده یا دستگاه صوتی یافت نشد.');
      setMicActive(false);
    }
  }, [micActive, ensureAudioGraph]);

  // Turn off standalone mic automatically if voice call ends
  useEffect(() => {
    if (!voiceCallActive && micActive) {
      if (micSourceRef.current) {
        micSourceRef.current.disconnect();
        micSourceRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      setMicActive(false);
    }
  }, [voiceCallActive, micActive]);

  const unlockAudioAndPlay = useCallback(() => {
    primeAudio();
    ensureAudioGraph();
    if (audioRef.current && audioRef.current.src && !audioRef.current.src.startsWith('data:')) {
      setAudioError(null);
      void audioRef.current.play().catch(() => {
        setAudioError('پخش صوتی با خطا مواجه شد.');
      });
    }
  }, [ensureAudioGraph, primeAudio]);

  return {
    currentTime,
    duration,
    frequencyBars,
    audioError,
    isBuffering,
    micActive,
    micError,
    callMusicStream,
    engineTelemetry,
    getVisualizerFrame,
    seekTo,
    toggleMic,
    unlockAudioAndPlay,
    primeAudio,
    playCallTone,
  };
}
