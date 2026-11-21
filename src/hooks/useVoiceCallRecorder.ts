import {useCallback, useEffect, useRef, useState} from 'react';
import {BotConfigState, Track} from '../types/bot';

interface UseVoiceCallRecorderOptions {
  groupId: string;
  sessionActive: boolean;
  autoRecordEnabled: boolean;
  currentTrack: Track | null;
  callMusicStream: MediaStream | null;
  callOutputStream: MediaStream | null;
  remoteStreams: MediaStream[];
  onRecordingSaved: (state: BotConfigState, filename: string) => void;
}

function pickSupportedRecorderMime(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read audio blob'));
    reader.readAsDataURL(blob);
  });
}

export function useVoiceCallRecorder({
  groupId,
  sessionActive,
  autoRecordEnabled,
  currentTrack,
  callMusicStream,
  callOutputStream,
  remoteStreams,
  onRecordingSaved,
}: UseVoiceCallRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedBytes, setRecordedBytes] = useState(0);
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const [lastLocalDownloadUrl, setLastLocalDownloadUrl] = useState<{
    url: string;
    filename: string;
    durationSec: number;
  } | null>(null);

  const recCtxRef = useRef<AudioContext | null>(null);
  const recDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const keepaliveOscRef = useRef<OscillatorNode | null>(null);
  const primarySourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const remoteSourceRefs = useRef<MediaStreamAudioSourceNode[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<string | null>(null);
  const startMsRef = useRef<number>(0);
  const tracksSeenRef = useRef<Set<string>>(new Set());
  const isRecordingRef = useRef(false);
  isRecordingRef.current = isRecording;

  const prevSessionActiveRef = useRef(sessionActive);
  const groupIdRef = useRef(groupId);
  groupIdRef.current = groupId;
  const onSavedRef = useRef(onRecordingSaved);
  onSavedRef.current = onRecordingSaved;

  // Track songs played during an active recording
  useEffect(() => {
    if (isRecording && currentTrack?.title) {
      tracksSeenRef.current.add(currentTrack.title);
    }
  }, [isRecording, currentTrack]);

  // Update live mix sources whenever music/call/remote streams change while recording
  const syncMixInputs = useCallback(() => {
    const ctx = recCtxRef.current;
    const dest = recDestRef.current;
    if (!ctx || !dest) return;

    if (primarySourceRef.current) {
      try {
        primarySourceRef.current.disconnect();
      } catch {
        // ignore
      }
      primarySourceRef.current = null;
    }

    const activePrimary =
      callOutputStream && callOutputStream.getAudioTracks().length > 0
        ? callOutputStream
        : callMusicStream && callMusicStream.getAudioTracks().length > 0
          ? callMusicStream
          : null;

    if (activePrimary) {
      try {
        const src = ctx.createMediaStreamSource(activePrimary);
        src.connect(dest);
        primarySourceRef.current = src;
      } catch {
        // ignore
      }
    }

    for (const rSrc of remoteSourceRefs.current) {
      try {
        rSrc.disconnect();
      } catch {
        // ignore
      }
    }
    remoteSourceRefs.current = [];

    for (const rStream of remoteStreams) {
      if (rStream.getAudioTracks().length === 0) continue;
      try {
        const src = ctx.createMediaStreamSource(rStream);
        src.connect(dest);
        remoteSourceRefs.current.push(src);
      } catch {
        // ignore
      }
    }
  }, [callMusicStream, callOutputStream, remoteStreams]);

  useEffect(() => {
    if (isRecording) {
      syncMixInputs();
    }
  }, [isRecording, syncMixInputs]);

  // Elapsed recording timer
  useEffect(() => {
    if (!isRecording) {
      setRecordingSeconds(0);
      return;
    }
    const id = setInterval(() => {
      setRecordingSeconds(Math.max(0, Math.floor((Date.now() - startMsRef.current) / 1000)));
    }, 500);
    return () => clearInterval(id);
  }, [isRecording]);

  const cleanupGraph = useCallback(() => {
    if (primarySourceRef.current) {
      try {
        primarySourceRef.current.disconnect();
      } catch {
        // ignore
      }
      primarySourceRef.current = null;
    }
    for (const rSrc of remoteSourceRefs.current) {
      try {
        rSrc.disconnect();
      } catch {
        // ignore
      }
    }
    remoteSourceRefs.current = [];

    if (keepaliveOscRef.current) {
      try {
        keepaliveOscRef.current.stop();
        keepaliveOscRef.current.disconnect();
      } catch {
        // ignore
      }
      keepaliveOscRef.current = null;
    }

    if (recCtxRef.current) {
      void recCtxRef.current.close().catch(() => undefined);
      recCtxRef.current = null;
      recDestRef.current = null;
    }
  }, []);

  const startRecording = useCallback(() => {
    if (isRecordingRef.current) return;
    if (typeof MediaRecorder === 'undefined') {
      setRecorderError('مرورگر شما از MediaRecorder برای ضبط صوتی پشتیبانی نمی‌کند.');
      return;
    }

    try {
      setRecorderError(null);
      const Ctx =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
      const ctx = new Ctx();
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => undefined);
      }
      const dest = ctx.createMediaStreamDestination();

      // Silent keepalive oscillator so MediaRecorder keeps continuous timestamps even during track switches
      const osc = ctx.createOscillator();
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      osc.connect(silentGain);
      silentGain.connect(dest);
      osc.start();

      recCtxRef.current = ctx;
      recDestRef.current = dest;
      keepaliveOscRef.current = osc;

      syncMixInputs();

      const mimeType = pickSupportedRecorderMime();
      const recorder = mimeType
        ? new MediaRecorder(dest.stream, {mimeType, audioBitsPerSecond: 128000})
        : new MediaRecorder(dest.stream);

      chunksRef.current = [];
      setRecordedBytes(0);
      tracksSeenRef.current = new Set();
      if (currentTrack?.title) {
        tracksSeenRef.current.add(currentTrack.title);
      }

      const startIso = new Date().toISOString();
      startedAtRef.current = startIso;
      startMsRef.current = Date.now();

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
          setRecordedBytes((prev) => prev + ev.data.size);
        }
      };

      recorder.onstop = () => {
        const endedIso = new Date().toISOString();
        const durationSec = Math.max(1, Math.round((Date.now() - startMsRef.current) / 1000));
        const finalMime = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, {type: finalMime});
        const tracksLabel = Array.from(tracksSeenRef.current).slice(0, 4).join('، ');
        const targetGroupId = groupIdRef.current;

        cleanupGraph();
        isRecordingRef.current = false;
        setIsRecording(false);

        if (blob.size < 256) {
          return;
        }

        const ext = finalMime.includes('mp4')
          ? 'm4a'
          : finalMime.includes('ogg')
            ? 'ogg'
            : 'webm';
        const localUrl = URL.createObjectURL(blob);
        setLastLocalDownloadUrl((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return {
            url: localUrl,
            filename: `voice_call_${Date.now()}.${ext}`,
            durationSec,
          };
        });

        setIsSaving(true);
        void (async () => {
          try {
            const base64 = await blobToBase64(blob);
            const res = await fetch('/api/call/recordings', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({
                groupId: targetGroupId,
                mimeType: finalMime,
                audioBase64: base64,
                durationSec,
                startedAt: startIso,
                endedAt: endedIso,
                tracksLabel: tracksLabel || undefined,
              }),
            });
            const data = (await res.json()) as {
              state?: BotConfigState;
              filename?: string;
              error?: string;
            };
            if (res.ok && data.state) {
              onSavedRef.current(data.state, data.filename || `voice_call.${ext}`);
            } else if (data.error) {
              setRecorderError(data.error);
            }
          } catch {
            setRecorderError('خطا در ذخیره فایل ضبط‌شده روی سرور (لینک موقت دانلود آماده است).');
          } finally {
            setIsSaving(false);
          }
        })();
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      isRecordingRef.current = true;
      setIsRecording(true);
    } catch {
      cleanupGraph();
      setRecorderError('راه‌اندازی ضبط خودکار صدای ویسکال با خطا مواجه شد.');
    }
  }, [cleanupGraph, currentTrack, syncMixInputs]);

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        cleanupGraph();
        setIsRecording(false);
      }
    } else {
      cleanupGraph();
      setIsRecording(false);
    }
  }, [cleanupGraph]);

  // Auto-start when voice call session begins, auto-stop & persist when voice call session ends
  useEffect(() => {
    const wasActive = prevSessionActiveRef.current;
    prevSessionActiveRef.current = sessionActive;

    if (!wasActive && sessionActive && autoRecordEnabled && !isRecordingRef.current) {
      startRecording();
    } else if (wasActive && !sessionActive && isRecordingRef.current) {
      stopRecording();
    }
  }, [sessionActive, autoRecordEnabled, startRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      cleanupGraph();
    };
  }, [cleanupGraph]);

  return {
    isRecording,
    isSaving,
    recordingSeconds,
    recordedBytes,
    recorderError,
    lastLocalDownloadUrl,
    startRecording,
    stopRecording,
  };
}
