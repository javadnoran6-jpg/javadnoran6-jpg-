import {useCallback, useEffect, useRef, useState} from 'react';
import {Track} from '../types/bot';

export interface AudioOutputDeviceOption {
  deviceId: string;
  label: string;
}

type AudioWithSinkId = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
  sinkId?: string;
};

function resolveProxyUrl(streamUrl: string): string {
  return streamUrl.startsWith('/api/')
    ? streamUrl
    : `/api/music/stream?url=${encodeURIComponent(streamUrl)}`;
}

export function useHeadphonePreview() {
  const audioRef = useRef<AudioWithSinkId | null>(null);
  const loadedTrackIdRef = useRef<string | null>(null);

  const [previewTrack, setPreviewTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(80);
  const [error, setError] = useState<string | null>(null);
  const [outputDevices, setOutputDevices] = useState<AudioOutputDeviceOption[]>([]);
  const [selectedSinkId, setSelectedSinkId] = useState<string>('');
  const [supportsSinkSelect, setSupportsSinkSelect] = useState(false);

  const refreshOutputDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices
        .filter((d) => d.kind === 'audiooutput' && d.deviceId)
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || (d.deviceId === 'default' ? 'خروجی پیش‌فرض سیستم / هدفون' : `خروجی صوتی ${idx + 1}`),
        }));
      setOutputDevices(outputs);
    } catch {
      // Ignore permission restriction
    }
  }, []);

  useEffect(() => {
    const audio = new Audio() as AudioWithSinkId;
    audio.crossOrigin = 'anonymous';
    audio.preload = 'metadata';
    audio.volume = 0.8;
    audioRef.current = audio;

    setSupportsSinkSelect(typeof audio.setSinkId === 'function');
    void refreshOutputDevices();

    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const onLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setIsBuffering(false);
      setError(null);
    };
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => {
      setIsBuffering(false);
      setError(null);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onError = () => {
      if (!audio.src) return;
      setIsBuffering(false);
      setIsPlaying(false);
      setError('خطا در بارگذاری پیش‌نمایش صوتی این آهنگ.');
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    const handleDeviceChange = () => void refreshOutputDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [refreshOutputDevices]);

  const setVolume = useCallback((nextVol: number) => {
    const clamped = Math.max(0, Math.min(100, nextVol));
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped / 100;
    }
  }, []);

  const changeOutputDevice = useCallback(async (sinkId: string) => {
    const audio = audioRef.current;
    if (!audio?.setSinkId) return;
    try {
      await audio.setSinkId(sinkId);
      setSelectedSinkId(sinkId);
      setError(null);
    } catch {
      setError('تغییر دستگاه خروجی هدفون توسط مرورگر پشتیبانی یا مجاز نشد.');
    }
  }, []);

  const previewCueTrack = useCallback((track: Track, autoPlay = true) => {
    const audio = audioRef.current;
    if (!audio) return;

    const isSameTrack = loadedTrackIdRef.current === track.id && Boolean(audio.src);
    if (isSameTrack) {
      if (autoPlay) {
        if (audio.paused) {
          setError(null);
          void audio.play().catch(() => {
            setError('پخش پیش‌نمایش در مرورگر مسدود شد؛ دوباره کلیک کنید.');
          });
        } else {
          audio.pause();
        }
      }
      return;
    }

    loadedTrackIdRef.current = track.id;
    setPreviewTrack(track);
    setError(null);
    setCurrentTime(0);
    setDuration(track.durationSec || 0);
    setIsBuffering(autoPlay);

    audio.pause();
    audio.src = resolveProxyUrl(track.streamUrl);
    audio.load();

    if (autoPlay) {
      void audio.play().catch(() => {
        setIsBuffering(false);
        setIsPlaying(false);
        setError('برای شنیدن پیش‌نمایش روی دکمه پخش کلیک کنید.');
      });
    } else {
      setIsPlaying(false);
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !previewTrack) return;

    if (loadedTrackIdRef.current !== previewTrack.id || !audio.src) {
      previewCueTrack(previewTrack, true);
      return;
    }

    if (audio.paused) {
      setError(null);
      void audio.play().catch(() => {
        setError('پخش پیش‌نمایش ناموفق بود.');
      });
    } else {
      audio.pause();
    }
  }, [previewTrack, previewCueTrack]);

  const stopPreview = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // Ignore if unready
    }
    setCurrentTime(0);
    setIsPlaying(false);
  }, []);

  const seekTo = useCallback((sec: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(sec)) return;
    const maxDur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : sec;
    const clamped = Math.max(0, Math.min(maxDur, sec));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  }, []);

  return {
    previewTrack,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    volume,
    error,
    outputDevices,
    selectedSinkId,
    supportsSinkSelect,
    previewCueTrack,
    togglePlayPause,
    stopPreview,
    seekTo,
    setVolume,
    changeOutputDevice,
  };
}
