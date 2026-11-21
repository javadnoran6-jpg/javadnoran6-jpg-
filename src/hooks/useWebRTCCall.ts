import {useCallback, useEffect, useRef, useState} from 'react';
import {AudioEngineSettings} from '../types/bot';

export interface CallParticipantInfo {
  peerId: string;
  groupId: string;
  name: string;
  role: string;
  isMuted: boolean;
  joinedAt: string;
}

interface UseWebRTCCallOptions {
  groupId: string;
  userName: string;
  userRole: string;
  callMusicStream: MediaStream | null;
  audioSettings?: AudioEngineSettings;
  playCallTone: (kind: 'ring' | 'connect' | 'hangup') => void;
  primeAudio: () => void;
}

const ICE_SERVERS: RTCIceServer[] = [
  {urls: 'stun:stun.l.google.com:19302'},
  {urls: 'stun:stun1.l.google.com:19302'},
];

export function useWebRTCCall({
  groupId,
  userName,
  userRole,
  callMusicStream,
  audioSettings,
  playCallTone,
  primeAudio,
}: UseWebRTCCallOptions) {
  const [callStatus, setCallStatus] = useState<'idle' | 'ringing' | 'connected'>('idle');
  const [participants, setParticipants] = useState<CallParticipantInfo[]>([]);
  const [micEnabled, setMicEnabled] = useState(true);
  const [micAvailable, setMicAvailable] = useState(true);
  const [selfTestActive, setSelfTestActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [callSeconds, setCallSeconds] = useState(0);
  const [callNotice, setCallNotice] = useState<string | null>(null);
  const [callOutputStream, setCallOutputStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<MediaStream[]>([]);

  const remoteStreamsMapRef = useRef<Map<string, MediaStream>>(new Map());
  const audioSettingsRef = useRef(audioSettings);
  audioSettingsRef.current = audioSettings;

  const peerIdRef = useRef<string>(`peer_${Math.random().toString(36).slice(2, 9)}`);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const mixCtxRef = useRef<AudioContext | null>(null);
  const mixDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const musicSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const callStatusRef = useRef(callStatus);
  callStatusRef.current = callStatus;

  const sendSignal = useCallback(
    async (
      type: 'offer' | 'answer' | 'ice' | 'mic-state' | 'ring',
      payload: unknown,
      toPeerId?: string,
    ) => {
      try {
        await fetch('/api/call/signal', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            groupId,
            fromPeerId: peerIdRef.current,
            toPeerId,
            type,
            payload,
          }),
        });
      } catch {
        // Ignore transient signal errors
      }
    },
    [groupId],
  );

  const cleanupPeerConnection = useCallback((remotePeerId: string) => {
    const pc = pcsRef.current.get(remotePeerId);
    if (pc) {
      pc.close();
      pcsRef.current.delete(remotePeerId);
    }
    const audioEl = remoteAudiosRef.current.get(remotePeerId);
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
      remoteAudiosRef.current.delete(remotePeerId);
    }
    if (remoteStreamsMapRef.current.has(remotePeerId)) {
      remoteStreamsMapRef.current.delete(remotePeerId);
      setRemoteStreams(Array.from(remoteStreamsMapRef.current.values()));
    }
  }, []);

  const createPeerConnection = useCallback(
    (remotePeerId: string): RTCPeerConnection => {
      const existing = pcsRef.current.get(remotePeerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({iceServers: ICE_SERVERS});
      pcsRef.current.set(remotePeerId, pc);

      const outgoingStream = mixDestRef.current?.stream || micStreamRef.current;
      if (outgoingStream) {
        for (const track of outgoingStream.getAudioTracks()) {
          pc.addTrack(track, outgoingStream);
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          void sendSignal('ice', event.candidate, remotePeerId);
        }
      };

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;
        remoteStreamsMapRef.current.set(remotePeerId, stream);
        setRemoteStreams(Array.from(remoteStreamsMapRef.current.values()));
        let audioEl = remoteAudiosRef.current.get(remotePeerId);
        if (!audioEl) {
          audioEl = new Audio();
          audioEl.autoplay = true;
          (audioEl as HTMLAudioElement & {playsInline?: boolean}).playsInline = true;
          remoteAudiosRef.current.set(remotePeerId, audioEl);
        }
        audioEl.srcObject = stream;
        void audioEl.play().catch(() => {
          // Will play on next user interaction if autoplay blocked
        });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          cleanupPeerConnection(remotePeerId);
        }
      };

      return pc;
    },
    [cleanupPeerConnection, sendSignal],
  );

  // Connect or update bot's music stream into outgoing WebRTC mix
  useEffect(() => {
    const ctx = mixCtxRef.current;
    const dest = mixDestRef.current;
    if (!ctx || !dest || callStatus === 'idle') return;

    if (musicSourceRef.current) {
      try {
        musicSourceRef.current.disconnect();
      } catch {
        // ignore
      }
      musicSourceRef.current = null;
    }

    if (callMusicStream && callMusicStream.getAudioTracks().length > 0) {
      try {
        const src = ctx.createMediaStreamSource(callMusicStream);
        src.connect(dest);
        musicSourceRef.current = src;
      } catch {
        // ignore if track already ended
      }
    }
  }, [callMusicStream, callStatus]);

  // Call duration clock
  useEffect(() => {
    if (callStatus !== 'connected') {
      setCallSeconds(0);
      return;
    }
    const id = setInterval(() => {
      setCallSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [callStatus]);

  // Live microphone volume meter
  useEffect(() => {
    if (callStatus === 'idle' || !micAnalyserRef.current || !micEnabled || !micAvailable) {
      setMicLevel(0);
      return;
    }
    let raf = 0;
    const data = new Uint8Array(32);
    const tick = () => {
      if (micAnalyserRef.current) {
        micAnalyserRef.current.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        setMicLevel(Math.min(100, Math.round((avg / 140) * 100)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [callStatus, micEnabled, micAvailable]);

  const leaveCall = useCallback(
    (playTone = true) => {
      if (playTone && callStatusRef.current !== 'idle') {
        playCallTone('hangup');
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      for (const remoteId of Array.from(pcsRef.current.keys())) {
        cleanupPeerConnection(remoteId);
      }
      if (musicSourceRef.current) {
        try {
          musicSourceRef.current.disconnect();
        } catch {
          // ignore
        }
        musicSourceRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      if (mixCtxRef.current) {
        void mixCtxRef.current.close();
        mixCtxRef.current = null;
        mixDestRef.current = null;
      }
      micGainRef.current = null;
      monitorGainRef.current = null;
      micAnalyserRef.current = null;
      remoteStreamsMapRef.current.clear();
      setRemoteStreams([]);
      setCallOutputStream(null);
      setSelfTestActive(false);
      setParticipants([]);
      setCallStatus('idle');
      setCallNotice(null);
    },
    [cleanupPeerConnection, playCallTone],
  );

  const joinCall = useCallback(async () => {
    if (callStatusRef.current !== 'idle') return;
    primeAudio();
    setCallNotice(null);
    setCallStatus('ringing');
    playCallTone('ring');

    // Initialize Web Audio call mixer
    const Ctx =
      window.AudioContext ||
      (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
    const s = audioSettingsRef.current;
    let ctx: AudioContext;
    try {
      ctx = s
        ? new Ctx({sampleRate: s.sampleRate, latencyHint: s.latencyHint})
        : new Ctx();
    } catch {
      ctx = new Ctx();
    }
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => undefined);
    }
    const dest = ctx.createMediaStreamDestination();
    mixCtxRef.current = ctx;
    mixDestRef.current = dest;
    setCallOutputStream(dest.stream);

    // Connect bot music stream if already available
    if (callMusicStream && callMusicStream.getAudioTracks().length > 0) {
      try {
        const musicSrc = ctx.createMediaStreamSource(callMusicStream);
        musicSrc.connect(dest);
        musicSourceRef.current = musicSrc;
      } catch {
        // ignore
      }
    }

    // Attempt real microphone capture
    let hasMic = false;
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: s
          ? {
              sampleRate: s.sampleRate,
              echoCancellation: s.echoCancellation,
              noiseSuppression: s.noiseSuppression,
              autoGainControl: s.autoGainControl,
            }
          : {echoCancellation: true, noiseSuppression: true, autoGainControl: true},
      });
      micStreamRef.current = micStream;
      const micSrc = ctx.createMediaStreamSource(micStream);
      const micGain = ctx.createGain();
      micGain.gain.value = 1;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      const monitorGain = ctx.createGain();
      monitorGain.gain.value = 0; // Off by default to avoid acoustic feedback

      micSrc.connect(micGain);
      micGain.connect(analyser);
      micGain.connect(dest);
      micGain.connect(monitorGain);
      monitorGain.connect(ctx.destination);

      micGainRef.current = micGain;
      monitorGainRef.current = monitorGain;
      micAnalyserRef.current = analyser;
      hasMic = true;
      setMicAvailable(true);
      setMicEnabled(true);
    } catch {
      hasMic = false;
      setMicAvailable(false);
      setMicEnabled(false);
      setCallNotice(
        'میکروفون در دسترس نیست — شما در حالت شنونده به تماس صوتی متصل شدید و صدای آهنگ و دیگران را می‌شنوید.',
      );
    }

    // Open SSE signaling room
    const params = new URLSearchParams({
      groupId,
      peerId: peerIdRef.current,
      name: userName,
      role: userRole,
      isMuted: String(!hasMic),
    });
    const es = new EventSource(`/api/call/events?${params.toString()}`);
    eventSourceRef.current = es;

    es.addEventListener('room-state', (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as {
        participants: CallParticipantInfo[];
      };
      setParticipants(data.participants);
      setCallStatus('connected');
      playCallTone('connect');

      // Initiate WebRTC offers to existing peers with lower peerId
      for (const p of data.participants) {
        if (p.peerId !== peerIdRef.current && peerIdRef.current > p.peerId) {
          void (async () => {
            const pc = createPeerConnection(p.peerId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendSignal('offer', offer, p.peerId);
          })();
        }
      }
    });

    es.addEventListener('peer-joined', (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as {
        participant: CallParticipantInfo;
        participants: CallParticipantInfo[];
      };
      setParticipants(data.participants);
      if (data.participant.peerId !== peerIdRef.current && peerIdRef.current > data.participant.peerId) {
        void (async () => {
          const pc = createPeerConnection(data.participant.peerId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendSignal('offer', offer, data.participant.peerId);
        })();
      }
    });

    es.addEventListener('peer-left', (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as {
        peerId: string;
        participants: CallParticipantInfo[];
      };
      setParticipants(data.participants);
      cleanupPeerConnection(data.peerId);
    });

    es.addEventListener('signal', (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as {
        fromPeerId: string;
        type: 'offer' | 'answer' | 'ice' | 'mic-state' | 'ring';
        payload: unknown;
      };
      void (async () => {
        if (data.type === 'offer') {
          const pc = createPeerConnection(data.fromPeerId);
          await pc.setRemoteDescription(new RTCSessionDescription(data.payload as RTCSessionDescriptionInit));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal('answer', answer, data.fromPeerId);
        } else if (data.type === 'answer') {
          const pc = pcsRef.current.get(data.fromPeerId);
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.payload as RTCSessionDescriptionInit));
          }
        } else if (data.type === 'ice') {
          const pc = pcsRef.current.get(data.fromPeerId);
          if (pc && data.payload) {
            await pc.addIceCandidate(new RTCIceCandidate(data.payload as RTCIceCandidateInit));
          }
        } else if (data.type === 'mic-state') {
          const p = data.payload as {isMuted?: boolean};
          if (typeof p?.isMuted === 'boolean') {
            setParticipants((prev) =>
              prev.map((item) =>
                item.peerId === data.fromPeerId ? {...item, isMuted: Boolean(p.isMuted)} : item,
              ),
            );
          }
        }
      })();
    });

    es.onerror = () => {
      // Keep status resilient; EventSource auto-reconnects unless left manually
    };
  }, [
    callMusicStream,
    cleanupPeerConnection,
    createPeerConnection,
    groupId,
    playCallTone,
    primeAudio,
    sendSignal,
    userName,
    userRole,
  ]);

  const toggleCallMic = useCallback(() => {
    if (!micAvailable || !micGainRef.current || !mixCtxRef.current) {
      setCallNotice('دسترسی میکروفون در مرورگر فعال نیست.');
      return;
    }
    const next = !micEnabled;
    micGainRef.current.gain.setTargetAtTime(next ? 1 : 0, mixCtxRef.current.currentTime, 0.03);
    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = next;
      });
    }
    setMicEnabled(next);
    void sendSignal('mic-state', {isMuted: !next});
  }, [micAvailable, micEnabled, sendSignal]);

  const toggleSelfTest = useCallback(() => {
    if (!monitorGainRef.current || !mixCtxRef.current || !micAvailable) {
      setCallNotice('برای تست صدای میکروفون در تماس، ابتدا اجازه دسترسی میکروفون را بدهید.');
      return;
    }
    const next = !selfTestActive;
    monitorGainRef.current.gain.setTargetAtTime(
      next ? 0.65 : 0,
      mixCtxRef.current.currentTime,
      0.04,
    );
    setSelfTestActive(next);
  }, [selfTestActive, micAvailable]);

  // Leave call cleanly if group changes or component unmounts
  useEffect(() => {
    return () => {
      if (callStatusRef.current !== 'idle') {
        leaveCall(false);
      }
    };
  }, [groupId, leaveCall]);

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?joinCall=${encodeURIComponent(groupId)}`
      : '';

  return {
    peerId: peerIdRef.current,
    callStatus,
    participants,
    micEnabled,
    micAvailable,
    micLevel,
    selfTestActive,
    callSeconds,
    callNotice,
    inviteUrl,
    callOutputStream,
    remoteStreams,
    joinCall,
    leaveCall,
    toggleCallMic,
    toggleSelfTest,
  };
}
