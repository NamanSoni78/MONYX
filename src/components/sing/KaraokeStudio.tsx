'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Upload,
  Mic,
  Play,
  Pause,
  Square,
  Scissors,
  Sparkles,
  Loader2,
  Download,
  Settings2,
  Check,
  RefreshCw,
  Volume2,
  Piano as PianoIcon,
  Headphones,
} from 'lucide-react';
import { WaveformPreview } from '@/components/common/WaveformPreview';
import {
  decodeAudioFile,
  DecodedAudio,
  float32ArrayToWavBlob,
  trimAudio,
  toMono,
} from '@/lib/audio/wavUtils';
import {
  separateAudio,
  SeparationResult,
  SeparationProgress,
} from '@/lib/audio/vocalSeparator';
import { ensureDefaultModel } from '@/lib/audio/onnxModelManager';
import { wavToMp3 } from '@/lib/audio/audioConverter';
import {
  playPiano,
  playGuitar,
  playBass,
  playPad,
  playSynth,
  playStrings,
  playKick,
  playSnare,
  playHihat,
  playClap,
  resumeAudioContext as resumeInstrumentCtx,
  setInstrumentVolume,
  getRecordingStream,
} from '@/lib/audio/virtualInstruments';

type Stage = 'upload' | 'trim' | 'extract' | 'ready' | 'countdown' | 'recording' | 'mixing' | 'done';
type InstrumentType = 'piano' | 'guitar' | 'bass' | 'pad' | 'synth' | 'strings';

const INSTRUMENT_LIST: { id: InstrumentType; label: string; play: (note: string, oct: number) => void }[] = [
  { id: 'piano', label: 'Piano', play: (n, o) => playPiano(n, o) },
  { id: 'synth', label: 'Synth', play: (n, o) => playSynth(n, o) },
  { id: 'guitar', label: 'Guitar', play: (n, o) => playGuitar(n, o) },
  { id: 'bass', label: 'Bass', play: (n, o) => playBass(n, o) },
  { id: 'strings', label: 'Strings', play: (n, o) => playStrings(n, o) },
  { id: 'pad', label: 'Pad', play: (n, o) => playPad(n, o) },
];

// ID of the auto-loaded bundled model (matches onnxModelManager.ts).
const BUNDLED_MODEL_ID = 'monyx-model-bundled-mdxnet-kara-2';

export function KaraokeStudio({ onExit }: { onExit: () => void }) {
  const [stage, setStage] = useState<Stage>('upload');
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [decoded, setDecoded] = useState<DecodedAudio | null>(null);
  const [trimRange, setTrimRange] = useState<[number, number]>([0, 0]);
  const [trimmedAudio, setTrimmedAudio] = useState<DecodedAudio | null>(null);
  const [bgmBlob, setBgmBlob] = useState<Blob | null>(null);
  const [bgmDecoded, setBgmDecoded] = useState<DecodedAudio | null>(null);
  const [vocalsBlob, setVocalsBlob] = useState<Blob | null>(null);
  const [vocalsDecoded, setVocalsDecoded] = useState<DecodedAudio | null>(null);
  const [separationProgress, setSeparationProgress] = useState<SeparationProgress | null>(null);
  const [isSeparating, setIsSeparating] = useState(false);
  const [separationMethod, setSeparationMethod] = useState<string>('');
  const [mixStage, setMixStage] = useState<string>('');
  const [mixProgress, setMixProgress] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [mixedBlob, setMixedBlob] = useState<Blob | null>(null);
  const [mixedIsMp3, setMixedIsMp3] = useState(false);

  // ===== Final mix volumes (what the listener of the final MP3 hears) =====
  // Defaults match the user's spec: BGM 70%, instruments 60%, user vocal 90%.
  const [bgmVolume, setBgmVolume] = useState(0.7);
  const [instrumentVolume, setInstrumentVolumeState] = useState(0.6);
  const [vocalVolume, setVocalVolume] = useState(0.9);

  // ===== MONITOR MIX (what the SINGER hears through the speakers while singing) =====
  // Singers have very different preferences here:
  //   - Some want the original song (vocal + BGM) at full volume to sing along
  //   - Some want only the extracted vocal at low volume (as a guide)
  //   - Some want only the BGM (true karaoke mode)
  //   - Some want a custom blend
  // All three are independent gain knobs (0% = silent, 100% = original level).
  const [monitorOriginalVolume, setMonitorOriginalVolume] = useState(0.8);  // full original song
  const [monitorVocalVolume, setMonitorVocalVolume] = useState(0.0);        // extracted original vocal
  const [monitorBgmVolume, setMonitorBgmVolume] = useState(0.0);            // extracted BGM (instrumental)

  // Total speaker volume (master monitor) — applied on top of the per-source volumes.
  const [monitorMasterVolume, setMonitorMasterVolume] = useState(0.9);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [vocalEnhanceLevel, setVocalEnhanceLevel] = useState(1.0);
  const [bgmBassBoost, setBgmBassBoost] = useState(0.5);
  const [error, setError] = useState<string>('');
  const [playProgress, setPlayProgress] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [isMixing, setIsMixing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showInstruments, setShowInstruments] = useState(true);
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentType>('guitar');
  const [instrumentOctave, setInstrumentOctave] = useState(4);
  const [countdown, setCountdown] = useState<number>(0);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [modelLoadProgress, setModelLoadProgress] = useState(0);

  // Post-mix customization
  const [showCustomizeMix, setShowCustomizeMix] = useState(false);
  const [customBgmVolume, setCustomBgmVolume] = useState(0.7);
  const [customVocalVolume, setCustomVocalVolume] = useState(0.9);
  const [customInstrumentVolume, setCustomInstrumentVolume] = useState(0.6);
  const [isRemixing, setIsRemixing] = useState(false);

  // Store decoded components for re-mixing
  const userVocalRef = useRef<Float32Array | null>(null);
  const bgmMonoRef = useRef<Float32Array | null>(null);
  const instrumentRef = useRef<Float32Array | null>(null);
  const mixSampleRateRef = useRef<number>(44100);

  // Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const fullSongBufferRef = useRef<AudioBuffer | null>(null); // full original song (with vocals)
  const bgmBufferRef = useRef<AudioBuffer | null>(null); // extracted BGM
  const vocalsBufferRef = useRef<AudioBuffer | null>(null); // extracted original vocal
  const songSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bgmSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const vocalsSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const monitorMasterGainRef = useRef<GainNode | null>(null);
  // Per-source monitor gains — these are LIVE-adjustable during recording
  const monitorOriginalGainRef = useRef<GainNode | null>(null);
  const monitorBgmGainRef = useRef<GainNode | null>(null);
  const monitorVocalGainRef = useRef<GainNode | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef(0);
  const rafRef = useRef<number>(0);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const countdownTimerRef = useRef<any>(null);
  // Captured instrument output during recording
  const instrumentRecorderRef = useRef<MediaRecorder | null>(null);
  const instrumentChunksRef = useRef<BlobPart[]>([]);
  // Track the trimmed range so we play from the right offset during recording
  const trimRangeRef = useRef<[number, number]>([0, 0]);

  // Memoize the final mix audio URL so we don't recreate blob URLs on every
  // render (which can leak memory and cause stale-audio playback bugs).
  const mixedAudioUrl = useMemo(() => {
    if (!mixedBlob) return '';
    return URL.createObjectURL(mixedBlob);
  }, [mixedBlob]);

  useEffect(() => {
    return () => {
      if (mixedAudioUrl) URL.revokeObjectURL(mixedAudioUrl);
    };
  }, [mixedAudioUrl]);

  useEffect(() => {
    // Auto-load the bundled model on first mount.
    let cancelled = false;
    (async () => {
      try {
        setModelStatus('loading');
        setModelLoadProgress(0);
        const m = await ensureDefaultModel((p) => {
          if (!cancelled) setModelLoadProgress(p);
        });
        if (cancelled) return;
        if (m) setModelStatus('ready');
        else setModelStatus('error');
      } catch (e) {
        console.warn('Auto-load model failed:', e);
        if (!cancelled) setModelStatus('error');
      }
    })();
    return () => { cancelled = true; cleanupAll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Live monitor volume updates during recording =====
  // When the singer drags a monitor volume slider mid-performance, we want
  // the speaker mix to change IMMEDIATELY (no need to restart). GainNode
  // values can be changed at any time and the change takes effect on the
  // next audio block (~3ms latency).
  useEffect(() => {
    if (monitorOriginalGainRef.current) {
      monitorOriginalGainRef.current.gain.value = monitorOriginalVolume;
    }
  }, [monitorOriginalVolume]);

  useEffect(() => {
    if (monitorBgmGainRef.current) {
      monitorBgmGainRef.current.gain.value = monitorBgmVolume;
    }
  }, [monitorBgmVolume]);

  useEffect(() => {
    if (monitorVocalGainRef.current) {
      monitorVocalGainRef.current.gain.value = monitorVocalVolume;
    }
  }, [monitorVocalVolume]);

  useEffect(() => {
    if (monitorMasterGainRef.current) {
      monitorMasterGainRef.current.gain.value = monitorMasterVolume;
    }
  }, [monitorMasterVolume]);

  const getAudioCtx = (): AudioContext => {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioContextClass();
    }
    return audioCtxRef.current;
  };

  const resumeAudioCtx = async (): Promise<AudioContext> => {
    const ctx = getAudioCtx();
    if (ctx.state !== 'running') {
      await ctx.resume();
    }
    return ctx;
  };

  const cleanupAll = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    stopSongPlayback();
    stopPreviewPlayback();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) { /* ignore */ }
    }
    if (instrumentRecorderRef.current && instrumentRecorderRef.current.state !== 'inactive') {
      try { instrumentRecorderRef.current.stop(); } catch (e) { /* ignore */ }
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  };

  const stopSongPlayback = () => {
    if (songSourceRef.current) {
      try { songSourceRef.current.stop(); } catch (e) { /* ignore */ }
      try { songSourceRef.current.disconnect(); } catch (e) { /* ignore */ }
      songSourceRef.current = null;
    }
    if (bgmSourceRef.current) {
      try { bgmSourceRef.current.stop(); } catch (e) { /* ignore */ }
      try { bgmSourceRef.current.disconnect(); } catch (e) { /* ignore */ }
      bgmSourceRef.current = null;
    }
    if (vocalsSourceRef.current) {
      try { vocalsSourceRef.current.stop(); } catch (e) { /* ignore */ }
      try { vocalsSourceRef.current.disconnect(); } catch (e) { /* ignore */ }
      vocalsSourceRef.current = null;
    }
    [monitorOriginalGainRef, monitorBgmGainRef, monitorVocalGainRef, monitorMasterGainRef].forEach((r) => {
      if (r.current) {
        try { r.current.disconnect(); } catch (e) { /* ignore */ }
        r.current = null;
      }
    });
  };

  const stopPreviewPlayback = () => {
    if (previewSourceRef.current) {
      try { previewSourceRef.current.stop(); } catch (e) { /* ignore */ }
      try { previewSourceRef.current.disconnect(); } catch (e) { /* ignore */ }
      previewSourceRef.current = null;
    }
  };

  // ====== Step 1: Upload ======
  const handleFileUpload = async (file: File) => {
    setError('');
    try {
      setOriginalFile(file);
      const dec = await decodeAudioFile(file);
      setDecoded(dec);
      setTrimRange([0, Math.min(dec.duration, 60)]);
      setStage('trim');
      // Pre-decode into AudioBuffer for preview & playback
      const ctx = getAudioCtx();
      const arr = await file.arrayBuffer();
      fullSongBufferRef.current = await ctx.decodeAudioData(arr.slice(0));
    } catch (e) {
      setError(`Failed to decode audio: ${e}`);
    }
  };

  // ====== Step 2: Trim ======
  const confirmTrim = async () => {
    if (!decoded) return;
    setError('');
    try {
      const [start, end] = trimRange;
      const trimmed = {
        sampleRate: decoded.sampleRate,
        channels: decoded.channels,
        length: Math.floor((end - start) * decoded.sampleRate),
        data: trimAudio(decoded.data, decoded.sampleRate, start, end),
        duration: end - start,
      };
      setTrimmedAudio(trimmed);
      // Save the trim range so we play from the right offset during recording
      trimRangeRef.current = [start, end];
      setStage('extract');
    } catch (e) {
      setError(`Failed to trim: ${e}`);
    }
  };

  // ====== Step 3: Extract BGM AND vocals ======
  // We extract BOTH stems here because the singer's monitor mix might use
  // either (or both) — see the monitor volume sliders in the "ready" stage.
  const extractBgm = async (audio?: DecodedAudio) => {
    const src = audio || trimmedAudio;
    if (!src) return;
    if (modelStatus !== 'ready') {
      setError('AI model is still loading. Please wait a moment.');
      return;
    }
    setError('');
    setIsSeparating(true);
    setSeparationProgress({ stage: 'Separating vocals from BGM...', progress: 0.05 });
    try {
      const result: SeparationResult = await separateAudio(
        src,
        { preferModel: BUNDLED_MODEL_ID, modelKind: 'mdxnet' },
        (p) => setSeparationProgress({ stage: p.stage, progress: 0.05 + p.progress * 0.95 })
      );
      setBgmBlob(result.instrumental);
      setVocalsBlob(result.vocals);
      setSeparationMethod(result.method);

      // Decode BGM into AudioBuffer for monitor playback
      const bgmDec = await decodeAudioFile(result.instrumental);
      setBgmDecoded(bgmDec);
      const ctx = getAudioCtx();
      const bgmArr = await result.instrumental.arrayBuffer();
      bgmBufferRef.current = await ctx.decodeAudioData(bgmArr.slice(0));

      // Decode extracted vocals into AudioBuffer for monitor playback
      const vocDec = await decodeAudioFile(result.vocals);
      setVocalsDecoded(vocDec);
      const vocArr = await result.vocals.arrayBuffer();
      vocalsBufferRef.current = await ctx.decodeAudioData(vocArr.slice(0));

      setStage('ready');
    } catch (e) {
      setError(`Voice separation failed: ${e}`);
    } finally {
      setIsSeparating(false);
      setSeparationProgress(null);
    }
  };

  // ====== Step 4: Countdown then start singing ======
  const startCountdown = async () => {
    setError('');
    try {
      await resumeAudioCtx();
      resumeInstrumentCtx();
      setInstrumentVolume(instrumentVolume);

      setStage('countdown');
      setCountdown(3);

      countdownTimerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
            setTimeout(() => startRecording(), 200);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (e) {
      setError(`Failed to start: ${e}`);
    }
  };

  // ====== Step 5: Start singing ======
  // MONITOR MIX ARCHITECTURE:
  //
  //   ┌── fullSongBuffer (original) ──→ originalGain ──┐
  //   │                                                ├──→ masterGain ──→ speakers
  //   ├── bgmBuffer (instrumental) ───→ bgmGain ───────┤
  //   └── vocalsBuffer (extracted) ───→ vocalGain ─────┘
  //
  // - The singer adjusts the three per-source gains (and the master) in real
  //   time via the UI sliders — changes take effect within ~3ms.
  // - The mic captures the speaker output via AEC, which subtracts the
  //   known signal (the sum of all three monitor sources) from the mic
  //   input. So whatever the singer hears is what gets cancelled from the
  //   mic, leaving only their voice.
  // - We play the TRIMMED segment of each source: start at trimRange[0]
  //   and stop at trimRange[1]. This was the original bug — the code was
  //   calling source.start() with no offset, so the full song always
  //   played from 00:00 regardless of the trim selection.
  const startRecording = async () => {
    setError('');
    cleanupAll();
    try {
      const ctx = getAudioCtx();
      if (ctx.state !== 'running') {
        await ctx.resume();
        await new Promise<void>((resolve) => setTimeout(resolve, 300));
      }

      if (!fullSongBufferRef.current) {
        throw new Error('Song not loaded.');
      }

      // ====== Request mic WITH AEC enabled ======
      // CRITICAL AEC settings:
      //   - echoCancellation: true        → speaker sound is subtracted from mic input
      //   - noiseSuppression: true        → reduce background hiss/hum
      //   - autoGainControl: false        → we want raw voice levels (AGC compresses dynamics)
      //   - channelCount: 1               → mono (AEC works best on mono; stereo AEC is unreliable)
      //   - googEchoCancellation: true    → Chrome-specific flag (extra AEC strength)
      //   - googExperimentalEchoCancellation: true → enable the experimental AEC3 path
      //   - googNoiseSuppression: true    → Chrome-specific NS flag
      // The advanced constraints only take effect in Chromium-based browsers
      // (Chrome, Edge, Brave, Opera). Firefox/Safari ignore them silently.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1,
          // Chromium-specific advanced constraints
          ...(typeof chrome !== 'undefined' ? {
            googEchoCancellation: true,
            googExperimentalEchoCancellation: true,
            googNoiseSuppression: true,
            googAutoGainControl: false,
          } : {}),
        } as any,
      });
      micStreamRef.current = stream;

      // ====== Build the 3-source monitor mix ======
      const [trimStart, trimEnd] = trimRangeRef.current;
      const trimmedDuration = trimEnd - trimStart;
      const now = ctx.currentTime + 0.05;  // small delay so sources start in sync

      // Master monitor gain → speakers
      const monitorMasterGain = ctx.createGain();
      monitorMasterGain.gain.value = monitorMasterVolume;
      monitorMasterGain.connect(ctx.destination);
      monitorMasterGainRef.current = monitorMasterGain;

      // Source 1: ORIGINAL SONG (full mix, with vocals)
      const originalGain = ctx.createGain();
      originalGain.gain.value = monitorOriginalVolume;
      originalGain.connect(monitorMasterGain);
      monitorOriginalGainRef.current = originalGain;

      const originalSource = ctx.createBufferSource();
      originalSource.buffer = fullSongBufferRef.current;
      originalSource.connect(originalGain);
      songSourceRef.current = originalSource;
      // source.start(when, offset, duration) — offset is the trim start in seconds
      originalSource.start(now, trimStart, trimmedDuration);

      // Source 2: BGM (instrumental only) — optional, true karaoke mode
      if (bgmBufferRef.current) {
        const bgmGain = ctx.createGain();
        bgmGain.gain.value = monitorBgmVolume;
        bgmGain.connect(monitorMasterGain);
        monitorBgmGainRef.current = bgmGain;

        const bgmSource = ctx.createBufferSource();
        bgmSource.buffer = bgmBufferRef.current;
        bgmSource.connect(bgmGain);
        bgmSourceRef.current = bgmSource;
        bgmSource.start(now, 0, Math.min(trimmedDuration, bgmBufferRef.current.duration));
      }

      // Source 3: EXTRACTED ORIGINAL VOCAL — for singers who want a guide vocal
      if (vocalsBufferRef.current) {
        const vocalGain = ctx.createGain();
        vocalGain.gain.value = monitorVocalVolume;
        vocalGain.connect(monitorMasterGain);
        monitorVocalGainRef.current = vocalGain;

        const vocalsSource = ctx.createBufferSource();
        vocalsSource.buffer = vocalsBufferRef.current;
        vocalsSource.connect(vocalGain);
        vocalsSourceRef.current = vocalsSource;
        vocalsSource.start(now, 0, Math.min(trimmedDuration, vocalsBufferRef.current.duration));
      }

      // ====== Record mic (user's voice, AEC-cleaned) ======
      const micMime = getRecordingMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: micMime, audioBitsPerSecond: 192000 });
      } catch (e) {
        recorder = new MediaRecorder(stream);
      }
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const instBlob = instrumentChunksRef.current.length > 0
          ? new Blob(instrumentChunksRef.current, { type: 'audio/webm' })
          : null;
        mixAndExport(blob, instBlob);
      };
      recorder.start(100);
      mediaRecorderRef.current = recorder;

      // ====== Also record the instrument output (for adding back in mixing) ======
      try {
        const instStream = getRecordingStream();
        const instRec = new MediaRecorder(instStream, { mimeType: micMime, audioBitsPerSecond: 192000 });
        instrumentChunksRef.current = [];
        instRec.ondataavailable = (e) => {
          if (e.data.size > 0) instrumentChunksRef.current.push(e.data);
        };
        instRec.start(100);
        instrumentRecorderRef.current = instRec;
      } catch (e) {
        console.warn('Instrument recording failed:', e);
      }

      startTimeRef.current = performance.now() / 1000;
      setIsRecording(true);
      setStage('recording');
      setPlayProgress(0);
      setRecordingTime(0);

      setInstrumentVolume(instrumentVolume);
      resumeInstrumentCtx();

      // ====== Timer loop ======
      const updateProgress = () => {
        const elapsed = performance.now() / 1000 - startTimeRef.current;
        // Use the trimmed duration, not the full song duration
        const p = Math.min(1, elapsed / trimmedDuration);
        setPlayProgress(p);
        setRecordingTime(elapsed);
        if (p >= 1) {
          stopRecording();
          return;
        }
        rafRef.current = requestAnimationFrame(updateProgress);
      };
      rafRef.current = requestAnimationFrame(updateProgress);
    } catch (e) {
      setError(`Failed to start recording: ${e}`);
      cleanupAll();
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    stopSongPlayback();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) { /* ignore */ }
    }
    if (instrumentRecorderRef.current && instrumentRecorderRef.current.state !== 'inactive') {
      try { instrumentRecorderRef.current.stop(); } catch (e) { /* ignore */ }
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    setIsRecording(false);
  };

  // ====== Step 6: Mix ======
  // Final = user vocal (AEC-cleaned, 90%) + BGM (70%) + instruments (60%)
  const mixAndExport = async (recBlob?: Blob, instBlob?: Blob | null) => {
    const blob = recBlob || recordingBlob;
    if (!blob || !bgmDecoded) {
      setError('Missing recording or BGM data.');
      return;
    }
    setError('');
    setStage('mixing');
    setIsMixing(true);
    setMixProgress(0);
    setMixStage('Decoding your voice...');
    try {
      // 1. Decode user vocal (AEC-cleaned)
      const userVocalDecoded = await decodeAudioFile(blob);
      const userVocalMono = toMono(userVocalDecoded.data);

      // 2. Decode BGM
      const bgmMono = toMono(bgmDecoded.data);

      // 3. Decode instrument recording (if any)
      let instrumentMono: Float32Array | null = null;
      if (instBlob && instBlob.size > 0) {
        setMixStage('Decoding instruments...');
        try {
          const instDecoded = await decodeAudioFile(instBlob);
          instrumentMono = toMono(instDecoded.data);
        } catch (e) {
          console.warn('Failed to decode instruments:', e);
        }
      }

      // 4. Align lengths — use the longest
      const targetLen = Math.max(
        userVocalMono.length,
        bgmMono.length,
        instrumentMono?.length || 0
      );

      const vocalPad = new Float32Array(targetLen);
      vocalPad.set(userVocalMono);
      const bgmPad = new Float32Array(targetLen);
      bgmPad.set(bgmMono);
      const instPad = new Float32Array(targetLen);
      if (instrumentMono) instPad.set(instrumentMono);

      // 5. Light vocal enhancement (compression + soft saturation)
      setMixStage('Enhancing your voice...');
      setMixProgress(0.3);
      const enhanced = await enhanceVocalLight(vocalPad, userVocalDecoded.sampleRate);

      // Store components for re-mixing later
      userVocalRef.current = enhanced;
      bgmMonoRef.current = bgmPad;
      instrumentRef.current = instPad;
      mixSampleRateRef.current = userVocalDecoded.sampleRate;
      setCustomBgmVolume(bgmVolume);
      setCustomVocalVolume(vocalVolume);
      setCustomInstrumentVolume(instrumentVolume);

      // 6. Mix: vocal + BGM + instruments with tanh soft limiter
      setMixStage('Mixing all tracks...');
      setMixProgress(0.6);
      const mixed = new Float32Array(targetLen);
      for (let i = 0; i < targetLen; i++) {
        const v = (enhanced[i] || 0) * vocalVolume;
        const b = (bgmPad[i] || 0) * bgmVolume;
        const ins = (instPad[i] || 0) * instrumentVolume;
        const sum = v + b + ins;
        mixed[i] = 0.95 * Math.tanh(sum / 0.95);
        if (i % 16384 === 0) {
          setMixProgress(0.6 + (i / targetLen) * 0.3);
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      // 7. Convert to MP3
      setMixStage('Converting to MP3...');
      setMixProgress(0.95);
      const wavBlob = float32ArrayToWavBlob([mixed, mixed], userVocalDecoded.sampleRate);
      const mp3Blob = await wavToMp3(wavBlob, 192);
      setMixedBlob(mp3Blob);
      setMixedIsMp3(true);
      setRecordingBlob(blob);
      setStage('done');
    } catch (e) {
      setError(`Mixing failed: ${e}`);
      setStage('ready');
    } finally {
      setIsMixing(false);
      setMixProgress(0);
      setMixStage('');
    }
  };

  // Re-mix with custom volumes (no need to re-decode or re-enhance)
  const remixWithVolumes = async () => {
    const vocal = userVocalRef.current;
    const bgm = bgmMonoRef.current;
    const inst = instrumentRef.current;
    if (!vocal || !bgm) {
      setError('No mix data available. Please record again.');
      return;
    }
    setError('');
    setIsRemixing(true);
    try {
      const targetLen = Math.max(vocal.length, bgm.length, inst?.length || 0);
      const mixed = new Float32Array(targetLen);
      for (let i = 0; i < targetLen; i++) {
        const v = (vocal[i] || 0) * customVocalVolume;
        const b = (bgm[i] || 0) * customBgmVolume;
        const ins = (inst?.[i] || 0) * customInstrumentVolume;
        const sum = v + b + ins;
        mixed[i] = 0.95 * Math.tanh(sum / 0.95);
        if (i % 32768 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      const wavBlob = float32ArrayToWavBlob([mixed, mixed], mixSampleRateRef.current);
      const mp3Blob = await wavToMp3(wavBlob, 192);
      setMixedBlob(mp3Blob);
      setShowCustomizeMix(false);
    } catch (e) {
      setError(`Re-mix failed: ${e}`);
    } finally {
      setIsRemixing(false);
    }
  };

  const reset = () => {
    cleanupAll();
    setStage('upload');
    setOriginalFile(null);
    setDecoded(null);
    setTrimRange([0, 0]);
    trimRangeRef.current = [0, 0];
    setTrimmedAudio(null);
    setBgmBlob(null);
    setBgmDecoded(null);
    setVocalsBlob(null);
    setVocalsDecoded(null);
    setRecordingBlob(null);
    setMixedBlob(null);
    setPlayProgress(0);
    setRecordingTime(0);
    setError('');
    fullSongBufferRef.current = null;
    bgmBufferRef.current = null;
    vocalsBufferRef.current = null;
  };

  const download = (blob: Blob, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  };

  const getRecordingMimeType = (): string => {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) return c;
    }
    return 'audio/webm';
  };

  // Preview play/pause for trim step
  const togglePreview = async () => {
    if (!decoded || !fullSongBufferRef.current) return;
    setError('');
    try {
      const ctx = await resumeAudioCtx();
      await new Promise((r) => setTimeout(r, 50));

      if (isPreviewPlaying) {
        stopPreviewPlayback();
        setIsPreviewPlaying(false);
        setPlayProgress(0);
        return;
      }
      const source = ctx.createBufferSource();
      source.buffer = fullSongBufferRef.current;
      source.connect(ctx.destination);
      previewSourceRef.current = source;
      const [start, end] = trimRange;
      // Play from trim start for the trim duration
      source.start(0, start, end - start);
      setIsPreviewPlaying(true);
      startTimeRef.current = performance.now() / 1000;
      setPlayProgress(0);

      const updateProgress = () => {
        if (!previewSourceRef.current) return;
        const elapsed = performance.now() / 1000 - startTimeRef.current;
        const dur = end - start;
        const p = Math.min(1, elapsed / dur);
        setPlayProgress(p);
        if (p >= 1) {
          stopPreviewPlayback();
          setIsPreviewPlaying(false);
          setPlayProgress(0);
          return;
        }
        rafRef.current = requestAnimationFrame(updateProgress);
      };
      rafRef.current = requestAnimationFrame(updateProgress);
    } catch (e) {
      setError(`Preview failed: ${e}`);
    }
  };

  const setTrimStart = (val: number) => {
    if (!decoded) return;
    const clamped = Math.max(0, Math.min(val, trimRange[1] - 0.1));
    setTrimRange([clamped, trimRange[1]]);
  };
  const setTrimEnd = (val: number) => {
    if (!decoded) return;
    const clamped = Math.max(val, trimRange[0] + 0.1);
    const finalEnd = Math.min(clamped, decoded.duration);
    setTrimRange([trimRange[0], finalEnd]);
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  };

  // Quick instrument trigger
  const triggerInstrument = (note: string) => {
    resumeInstrumentCtx();
    setInstrumentVolume(instrumentVolume);
    const inst = INSTRUMENT_LIST.find((i) => i.id === selectedInstrument);
    if (inst) inst.play(note, instrumentOctave);
  };

  const triggerDrum = (type: 'kick' | 'snare' | 'hihat' | 'clap') => {
    resumeInstrumentCtx();
    setInstrumentVolume(instrumentVolume);
    switch (type) {
      case 'kick': playKick(); break;
      case 'snare': playSnare(); break;
      case 'hihat': playHihat(false); break;
      case 'clap': playClap(); break;
    }
  };

  const handleInstrumentVolumeChange = (vol: number) => {
    setInstrumentVolumeState(vol);
    setInstrumentVolume(vol);
  };

  // ============ UI ============
  return (
    <main className="min-h-screen bg-[#0d0718] text-[#f0e9ff]">
      <div className="mx-auto max-w-md px-4 py-4 pb-16">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => { cleanupAll(); onExit(); }}
            className="w-9 h-9 rounded-full bg-[#1a0f2e] hover:bg-[#2e1d52] flex items-center justify-center"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Karaoke Studio</h1>
            <p className="text-[10px] text-[#bca9dd]">
              Sing along — AI cancels the song, keeps your voice.
            </p>
          </div>
          {modelStatus === 'ready' && (
            <div className="text-[9px] text-[#2bc7da] flex items-center gap-1">
              <Check size={10} /> Model ready
            </div>
          )}
          {modelStatus === 'loading' && (
            <div className="text-[9px] text-[#fbbf24] flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> {Math.round(modelLoadProgress * 100)}%
            </div>
          )}
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1 mb-2 mt-4">
          {(['upload', 'trim', 'extract', 'ready', 'countdown', 'recording', 'mixing', 'done'] as Stage[]).map((s, i, arr) => {
            const currentIdx = arr.indexOf(stage);
            const isDone = i < currentIdx;
            const isActive = i === currentIdx;
            return (
              <div
                key={s}
                className={`flex-1 h-1.5 rounded-full transition-colors ${isDone ? 'bg-[#2bc7da]' : isActive ? 'bg-[#7b3fe4]' : 'bg-[#2e1d52]'}`}
              />
            );
          })}
        </div>
        <div className="text-[10px] text-[#bca9dd] mb-4 capitalize">
          Step: <span className="text-white font-semibold">{stage}</span>
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-200 text-xs p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Stage: Upload */}
        {stage === 'upload' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <label className="block w-full rounded-2xl bg-[#1a0f2e] border-2 border-dashed border-[#2e1d52] hover:border-[#7b3fe4] p-8 text-center cursor-pointer transition-colors">
              <input
                type="file"
                accept="audio/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                }}
              />
              <Upload className="w-10 h-10 mx-auto mb-3 text-[#7b3fe4]" />
              <div className="font-medium text-sm">Upload your song</div>
              <div className="text-xs text-[#bca9dd] mt-1">MP3, WAV, M4A — any audio format</div>
            </label>

            <div className="bg-[#1a0f2e] rounded-xl p-4 text-xs text-[#bca9dd] space-y-2">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#ca4af1]" /> How it works
              </div>
              <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                <li>Upload song → trim the part you want to sing</li>
                <li>AI extracts the BGM and the original vocal (separately)</li>
                <li>Pick what you hear while singing: original song, BGM only, or just the guide vocal</li>
                <li>3-2-1 countdown, then sing! Browser AEC cancels the speaker sound from your mic</li>
                <li>Final mix = your voice (90%) + BGM (70%) + instruments (60%)</li>
                <li>Get a clean MP3 ready to share</li>
              </ol>
              <div className="mt-2 text-[10px] text-[#2bc7da] bg-[#0d0718] p-2 rounded">
                💡 Use headphones for best results (no echo). If using speakers, AEC will cancel the song bleed automatically.
              </div>
            </div>
          </motion.div>
        )}

        {/* Stage: Trim */}
        {stage === 'trim' && decoded && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="bg-[#1a0f2e] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs text-[#bca9dd]">Source</div>
                  <div className="font-medium text-sm truncate max-w-[200px]">{originalFile?.name}</div>
                </div>
                <div className="text-right text-xs text-[#bca9dd]">
                  <div>{decoded.duration.toFixed(1)}s total</div>
                  <div>{decoded.sampleRate / 1000}kHz • {decoded.channels}ch</div>
                </div>
              </div>
              <WaveformPreview
                audioBuffer={fullSongBufferRef.current}
                height={100}
                trimRange={trimRange}
                onTrimChange={(r) => setTrimRange(r)}
                trimmable
                progress={isPreviewPlaying ? (trimRange[0] + playProgress * (trimRange[1] - trimRange[0])) / decoded.duration : undefined}
              />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-[#bca9dd] block mb-1">Start (sec)</label>
                  <input
                    type="number"
                    min={0}
                    max={decoded.duration}
                    step={0.1}
                    value={trimRange[0].toFixed(2)}
                    onChange={(e) => setTrimStart(Number(e.target.value))}
                    className="w-full bg-[#0d0718] border border-[#2e1d52] rounded-lg p-2 text-xs font-mono text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#bca9dd] block mb-1">End (sec)</label>
                  <input
                    type="number"
                    min={0}
                    max={decoded.duration}
                    step={0.1}
                    value={trimRange[1].toFixed(2)}
                    onChange={(e) => setTrimEnd(Number(e.target.value))}
                    className="w-full bg-[#0d0718] border border-[#2e1d52] rounded-lg p-2 text-xs font-mono text-white"
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-[#bca9dd]">
                <div>
                  Selection: <span className="text-white font-mono">{(trimRange[1] - trimRange[0]).toFixed(2)}s</span>
                </div>
                <button
                  onClick={togglePreview}
                  className="px-4 py-2 rounded-lg bg-[#7b3fe4] hover:bg-[#6a35c9] text-white text-xs font-medium flex items-center gap-1.5"
                >
                  {isPreviewPlaying ? <Pause size={12} /> : <Play size={12} />}
                  {isPreviewPlaying ? 'Stop' : 'Preview'}
                </button>
              </div>
            </div>

            <button
              onClick={confirmTrim}
              disabled={trimRange[1] - trimRange[0] < 0.5}
              className="w-full bg-[#7b3fe4] hover:bg-[#6a35c9] disabled:bg-[#2e1d52] disabled:text-[#5f4b86] py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2"
            >
              <Scissors size={16} /> Trim & Continue
            </button>
          </motion.div>
        )}

        {/* Stage: Extract BGM */}
        {stage === 'extract' && !isSeparating && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="bg-[#1a0f2e] rounded-xl p-4">
              <div className="text-xs text-[#bca9dd] mb-1">Trimmed selection</div>
              <div className="text-lg font-semibold">{trimmedAudio?.duration.toFixed(1)}s</div>
              {modelStatus === 'ready' ? (
                <div className="mt-3 text-xs text-[#2bc7da] flex items-center gap-1.5">
                  <Check size={12} /> AI model ready (UVR MDX-Net KARA 2)
                </div>
              ) : modelStatus === 'loading' ? (
                <div className="mt-3 text-xs text-[#fbbf24] flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Loading AI model... {Math.round(modelLoadProgress * 100)}%
                </div>
              ) : (
                <div className="mt-3 text-xs text-red-400">
                  Model failed to load. Refresh the page.
                </div>
              )}
            </div>
            <button
              onClick={() => extractBgm()}
              disabled={modelStatus !== 'ready'}
              className="w-full bg-[#7b3fe4] hover:bg-[#6a35c9] disabled:bg-[#2e1d52] disabled:text-[#5f4b86] py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2"
            >
              <Sparkles size={16} /> Extract BGM with AI
            </button>
          </motion.div>
        )}

        {stage === 'extract' && isSeparating && separationProgress && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="bg-[#1a0f2e] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Loader2 className="w-5 h-5 animate-spin text-[#7b3fe4]" />
                <span className="text-sm font-medium">{separationProgress.stage}</span>
              </div>
              <div className="w-full bg-[#2e1d52] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-[#7b3fe4] to-[#2bc7da] h-full transition-all duration-200"
                  style={{ width: `${separationProgress.progress * 100}%` }}
                />
              </div>
              <div className="text-xs text-[#bca9dd] mt-2 text-right">
                {Math.round(separationProgress.progress * 100)}%
              </div>
            </div>
          </motion.div>
        )}

        {/* Stage: Ready to sing */}
        {stage === 'ready' && bgmBufferRef.current && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="bg-gradient-to-br from-[#1a0f2e] to-[#2a1847] rounded-xl p-5 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-[#2bc7da] to-[#59d98e] mb-3">
                <Check className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-lg font-bold">Ready to sing!</h3>
              <p className="text-xs text-[#bca9dd] mt-1">
                BGM extracted using <span className="text-white font-semibold">{separationMethod}</span>
              </p>
              <p className="text-[10px] text-[#5f4b86] mt-2">
                Choose what you hear through your speakers below. AEC will cancel all of it from your mic.
              </p>
            </div>

            {/* ===== Monitor Mix (what the singer hears through speakers) ===== */}
            <div className="bg-[#1a0f2e] rounded-xl p-4 space-y-3">
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Headphones className="w-3.5 h-3.5 text-[#2bc7da]" /> What you hear while singing
              </div>
              <p className="text-[10px] text-[#5f4b86] leading-relaxed -mt-1">
                Adjust live while you sing. AEC cancels ALL of this from your mic, so your voice stays clean.
              </p>

              {/* Original song */}
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-[#bca9dd]">Original song (vocal + BGM)</span>
                  <span className="font-mono text-white">{Math.round(monitorOriginalVolume * 100)}%</span>
                </div>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={monitorOriginalVolume}
                  onChange={(e) => setMonitorOriginalVolume(Number(e.target.value))}
                  className="w-full accent-[#7b3fe4]"
                />
              </div>

              {/* Extracted BGM */}
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-[#bca9dd]">Extracted BGM (karaoke mode)</span>
                  <span className="font-mono text-white">{Math.round(monitorBgmVolume * 100)}%</span>
                </div>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={monitorBgmVolume}
                  onChange={(e) => setMonitorBgmVolume(Number(e.target.value))}
                  className="w-full accent-[#ca4af1]"
                />
              </div>

              {/* Extracted original vocal */}
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-[#bca9dd]">Extracted guide vocal</span>
                  <span className="font-mono text-white">{Math.round(monitorVocalVolume * 100)}%</span>
                </div>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={monitorVocalVolume}
                  onChange={(e) => setMonitorVocalVolume(Number(e.target.value))}
                  className="w-full accent-[#59d98e]"
                />
              </div>

              {/* Master speaker volume */}
              <div className="pt-2 border-t border-[#2e1d52]">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-[#bca9dd]">Speaker master volume</span>
                  <span className="font-mono text-white">{Math.round(monitorMasterVolume * 100)}%</span>
                </div>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={monitorMasterVolume}
                  onChange={(e) => setMonitorMasterVolume(Number(e.target.value))}
                  className="w-full accent-[#fbbf24]"
                />
              </div>

              {/* Quick presets */}
              <div className="pt-2 grid grid-cols-3 gap-1">
                <button
                  onClick={() => {
                    setMonitorOriginalVolume(0.8);
                    setMonitorBgmVolume(0);
                    setMonitorVocalVolume(0);
                  }}
                  className="text-[9px] py-1.5 rounded bg-[#2e1d52] hover:bg-[#3f2a66] text-[#bca9dd]"
                >Original</button>
                <button
                  onClick={() => {
                    setMonitorOriginalVolume(0);
                    setMonitorBgmVolume(0.8);
                    setMonitorVocalVolume(0);
                  }}
                  className="text-[9px] py-1.5 rounded bg-[#2e1d52] hover:bg-[#3f2a66] text-[#bca9dd]"
                >Karaoke</button>
                <button
                  onClick={() => {
                    setMonitorOriginalVolume(0);
                    setMonitorBgmVolume(0);
                    setMonitorVocalVolume(0.3);
                  }}
                  className="text-[9px] py-1.5 rounded bg-[#2e1d52] hover:bg-[#3f2a66] text-[#bca9dd]"
                >Guide vocal</button>
              </div>
            </div>

            {/* ===== Final Mix Volumes (what the listener of the final MP3 hears) ===== */}
            <div className="bg-[#1a0f2e] rounded-xl p-4 space-y-3">
              <div className="text-xs font-semibold text-[#bca9dd] flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5" /> Final Mix Volumes (your MP3)
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-[#bca9dd] mb-1">
                  <span>BGM (instrumental)</span>
                  <span className="font-mono text-white">{Math.round(bgmVolume * 100)}%</span>
                </div>
                <input
                  type="range" min={0} max={1.5} step={0.05}
                  value={bgmVolume}
                  onChange={(e) => setBgmVolume(Number(e.target.value))}
                  className="w-full accent-[#7b3fe4]"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-[#bca9dd] mb-1">
                  <span>Your voice</span>
                  <span className="font-mono text-white">{Math.round(vocalVolume * 100)}%</span>
                </div>
                <input
                  type="range" min={0} max={1.5} step={0.05}
                  value={vocalVolume}
                  onChange={(e) => setVocalVolume(Number(e.target.value))}
                  className="w-full accent-[#2bc7da]"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-[#bca9dd] mb-1">
                  <span>Instruments</span>
                  <span className="font-mono text-white">{Math.round(instrumentVolume * 100)}%</span>
                </div>
                <input
                  type="range" min={0} max={1.5} step={0.05}
                  value={instrumentVolume}
                  onChange={(e) => handleInstrumentVolumeChange(Number(e.target.value))}
                  className="w-full accent-[#fbbf24]"
                />
              </div>
            </div>

            <div className="bg-[#1a0f2e] rounded-xl p-4">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between text-xs"
              >
                <span className="flex items-center gap-2 text-[#bca9dd]">
                  <Settings2 className="w-3.5 h-3.5" /> Advanced settings
                </span>
                <span className="text-[#7b3fe4]">{showAdvanced ? 'Hide' : 'Show'}</span>
              </button>
              {showAdvanced && (
                <div className="mt-3 space-y-3 text-xs">
                  <div>
                    <div className="flex justify-between text-[#bca9dd] mb-1">
                      <span>Vocal enhancement level</span>
                      <span className="font-mono text-white">{Math.round(vocalEnhanceLevel * 100)}%</span>
                    </div>
                    <input
                      type="range" min={0} max={2} step={0.1}
                      value={vocalEnhanceLevel}
                      onChange={(e) => setVocalEnhanceLevel(Number(e.target.value))}
                      className="w-full accent-[#7b3fe4]"
                    />
                    <div className="text-[10px] text-[#5f4b86] mt-0.5">Compression + saturation applied to your voice</div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[#bca9dd] mb-1">
                      <span>BGM bass boost</span>
                      <span className="font-mono text-white">{Math.round(bgmBassBoost * 100)}%</span>
                    </div>
                    <input
                      type="range" min={0} max={2} step={0.1}
                      value={bgmBassBoost}
                      onChange={(e) => setBgmBassBoost(Number(e.target.value))}
                      className="w-full accent-[#7b3fe4]"
                    />
                    <div className="text-[10px] text-[#5f4b86] mt-0.5">Boosts low frequencies in the BGM for fuller sound</div>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={startCountdown}
              className="w-full bg-gradient-to-r from-[#2bc7da] to-[#59d98e] hover:opacity-90 py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white shadow-[0_0_25px_rgba(43,199,218,0.4)]"
            >
              <Mic size={18} /> Start Singing
            </button>
          </motion.div>
        )}

        {/* Stage: Countdown */}
        {stage === 'countdown' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="text-[#bca9dd] text-sm mb-4">Get ready to sing!</div>
            <motion.div
              key={countdown}
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="text-8xl font-bold bg-gradient-to-br from-[#2bc7da] to-[#59d98e] bg-clip-text text-transparent"
            >
              {countdown || 'Go!'}
            </motion.div>
            <div className="mt-6 text-xs text-[#5f4b86]">Trimmed section will start playing</div>
          </motion.div>
        )}

        {/* Stage: Recording */}
        {stage === 'recording' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="bg-gradient-to-br from-[#1a0f2e] to-[#3a1a1a] rounded-xl p-6 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/20 mb-3 relative">
                <div className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" />
                <Mic className="w-10 h-10 text-red-400 relative" />
              </div>
              <h3 className="text-lg font-bold">Recording your voice...</h3>
              <p className="text-xs text-[#bca9dd] mt-1">Sing along! Tap stop when you're done.</p>
              <div className="mt-4 text-3xl font-mono font-bold text-[#2bc7da]">
                {formatTime(recordingTime)}
              </div>
              <div className="mt-2 w-full bg-[#2e1d52] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-[#2bc7da] to-[#59d98e] h-full transition-all"
                  style={{ width: `${playProgress * 100}%` }}
                />
              </div>
            </div>

            {/* Live monitor mix controls during recording */}
            <div className="bg-[#1a0f2e] rounded-xl p-3 space-y-2">
              <div className="text-[10px] text-[#bca9dd] flex items-center gap-1.5">
                <Headphones className="w-3 h-3 text-[#2bc7da]" /> Live monitor mix
              </div>
              <div className="grid grid-cols-3 gap-2 text-[9px]">
                <div>
                  <div className="text-[#bca9dd] mb-0.5">Original</div>
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={monitorOriginalVolume}
                    onChange={(e) => setMonitorOriginalVolume(Number(e.target.value))}
                    className="w-full accent-[#7b3fe4]"
                    style={{ writingMode: 'horizontal-tb' }}
                  />
                  <div className="font-mono text-white text-center">{Math.round(monitorOriginalVolume * 100)}%</div>
                </div>
                <div>
                  <div className="text-[#bca9dd] mb-0.5">BGM</div>
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={monitorBgmVolume}
                    onChange={(e) => setMonitorBgmVolume(Number(e.target.value))}
                    className="w-full accent-[#ca4af1]"
                  />
                  <div className="font-mono text-white text-center">{Math.round(monitorBgmVolume * 100)}%</div>
                </div>
                <div>
                  <div className="text-[#bca9dd] mb-0.5">Guide vocal</div>
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={monitorVocalVolume}
                    onChange={(e) => setMonitorVocalVolume(Number(e.target.value))}
                    className="w-full accent-[#59d98e]"
                  />
                  <div className="font-mono text-white text-center">{Math.round(monitorVocalVolume * 100)}%</div>
                </div>
              </div>
            </div>

            {/* Instruments during recording */}
            <div className="bg-[#1a0f2e] rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#bca9dd] flex items-center gap-1.5">
                  <PianoIcon className="w-3.5 h-3.5" /> Play instruments
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setInstrumentOctave(Math.max(2, instrumentOctave - 1))}
                    className="w-6 h-6 rounded bg-[#2e1d52] text-xs"
                  >-</button>
                  <span className="text-[10px] text-white font-mono w-8 text-center">Oct {instrumentOctave}</span>
                  <button
                    onClick={() => setInstrumentOctave(Math.min(6, instrumentOctave + 1))}
                    className="w-6 h-6 rounded bg-[#2e1d52] text-xs"
                  >+</button>
                </div>
              </div>

              <div className="grid grid-cols-6 gap-1 mb-2">
                {INSTRUMENT_LIST.map((inst) => (
                  <button
                    key={inst.id}
                    onClick={() => setSelectedInstrument(inst.id)}
                    className={`py-1.5 rounded text-[9px] font-medium ${selectedInstrument === inst.id ? 'bg-[#2bc7da] text-black' : 'bg-[#2e1d52] text-[#bca9dd]'}`}
                  >
                    {inst.label}
                  </button>
                ))}
              </div>

              <div className="relative h-32 select-none">
                <div className="relative h-full flex">
                  {['C', 'D', 'E', 'F', 'G', 'A', 'B'].map((note) => (
                    <button
                      key={note}
                      onPointerDown={(e) => { e.preventDefault(); triggerInstrument(note); }}
                      className="flex-1 bg-gradient-to-b from-white to-gray-200 active:from-[#7b3fe4] active:to-[#5a2eb8] active:text-white text-black rounded-b-lg flex items-end justify-center pb-2 text-[10px] font-semibold border-r border-gray-400"
                    >
                      {note}
                    </button>
                  ))}
                </div>
                <div className="absolute top-0 left-0 right-0 h-20 pointer-events-none">
                  {['C#', 'D#', 'F#', 'G#', 'A#'].map((note) => {
                    const positions: Record<string, string> = {
                      'C#': '14.28%', 'D#': '28.57%', 'F#': '57.14%', 'G#': '71.43%', 'A#': '85.71%',
                    };
                    return (
                      <button
                        key={note}
                        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); triggerInstrument(note); }}
                        className="absolute top-0 w-5 h-full bg-gradient-to-b from-gray-900 to-black active:from-[#ca4af1] active:to-[#9333ea] rounded-b-lg text-white text-[7px] flex items-end justify-center pb-1 pointer-events-auto"
                        style={{ left: `calc(${positions[note]} - 10px)` }}
                      >
                        {note}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1 mt-2">
                <button
                  onPointerDown={(e) => { e.preventDefault(); triggerDrum('kick'); }}
                  className="py-2 rounded bg-red-600 text-white text-[9px] font-bold"
                >Kick</button>
                <button
                  onPointerDown={(e) => { e.preventDefault(); triggerDrum('snare'); }}
                  className="py-2 rounded bg-orange-600 text-white text-[9px] font-bold"
                >Snare</button>
                <button
                  onPointerDown={(e) => { e.preventDefault(); triggerDrum('hihat'); }}
                  className="py-2 rounded bg-yellow-600 text-white text-[9px] font-bold"
                >Hi-Hat</button>
                <button
                  onPointerDown={(e) => { e.preventDefault(); triggerDrum('clap'); }}
                  className="py-2 rounded bg-green-600 text-white text-[9px] font-bold"
                >Clap</button>
              </div>
            </div>

            <button
              onClick={stopRecording}
              className="w-full bg-red-600 hover:bg-red-700 py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
            >
              <Square size={16} fill="currentColor" /> Stop & Mix
            </button>
          </motion.div>
        )}

        {/* Stage: Mixing */}
        {stage === 'mixing' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="bg-[#1a0f2e] rounded-xl p-6 text-center">
              <Loader2 className="w-10 h-10 animate-spin text-[#7b3fe4] mx-auto mb-3" />
              <h3 className="text-lg font-bold">{mixStage || 'Processing...'}</h3>
              <p className="text-xs text-[#bca9dd] mt-1">This may take a few seconds</p>
              <div className="mt-4 w-full bg-[#2e1d52] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-[#7b3fe4] to-[#2bc7da] h-full transition-all duration-200"
                  style={{ width: `${mixProgress * 100}%` }}
                />
              </div>
              <div className="text-xs text-[#bca9dd] mt-1 text-right">
                {Math.round(mixProgress * 100)}%
              </div>
            </div>
          </motion.div>
        )}

        {/* Stage: Done */}
        {stage === 'done' && mixedBlob && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="bg-gradient-to-br from-[#1a0f2e] to-[#2a1847] rounded-xl p-6 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-[#2bc7da] to-[#59d98e] mb-3">
                <Check className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-lg font-bold">Your song is ready!</h3>
              <p className="text-xs text-[#bca9dd] mt-1">Your voice + BGM + instruments (MP3)</p>
              <audio src={mixedAudioUrl} controls className="w-full mt-4" />
            </div>

            {/* Customize Mix Panel */}
            {showCustomizeMix && (
              <div className="bg-[#1a0f2e] rounded-xl p-4 space-y-3">
                <div className="text-xs font-semibold text-[#bca9dd] flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5" /> Adjust Mix Volumes
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-[#bca9dd] mb-1">
                    <span>BGM (instrumental)</span>
                    <span className="font-mono text-white">{Math.round(customBgmVolume * 100)}%</span>
                  </div>
                  <input
                    type="range" min={0} max={1.5} step={0.05}
                    value={customBgmVolume}
                    onChange={(e) => setCustomBgmVolume(Number(e.target.value))}
                    className="w-full accent-[#7b3fe4]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-[#bca9dd] mb-1">
                    <span>Your voice</span>
                    <span className="font-mono text-white">{Math.round(customVocalVolume * 100)}%</span>
                  </div>
                  <input
                    type="range" min={0} max={1.5} step={0.05}
                    value={customVocalVolume}
                    onChange={(e) => setCustomVocalVolume(Number(e.target.value))}
                    className="w-full accent-[#2bc7da]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-[#bca9dd] mb-1">
                    <span>Instruments</span>
                    <span className="font-mono text-white">{Math.round(customInstrumentVolume * 100)}%</span>
                  </div>
                  <input
                    type="range" min={0} max={1.5} step={0.05}
                    value={customInstrumentVolume}
                    onChange={(e) => setCustomInstrumentVolume(Number(e.target.value))}
                    className="w-full accent-[#fbbf24]"
                  />
                </div>
                <button
                  onClick={remixWithVolumes}
                  disabled={isRemixing}
                  className="w-full bg-[#7b3fe4] hover:bg-[#6a35c9] disabled:opacity-50 py-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
                >
                  {isRemixing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles size={14} />}
                  Re-mix with these volumes
                </button>
                <button
                  onClick={() => setShowCustomizeMix(false)}
                  className="w-full text-[10px] text-[#bca9dd] py-1"
                >
                  Cancel
                </button>
              </div>
            )}

            <div className="space-y-2">
              <button
                onClick={() => download(mixedBlob, `karaoke-${Date.now()}.${mixedIsMp3 ? 'mp3' : 'wav'}`)}
                className="w-full bg-[#7b3fe4] hover:bg-[#6a35c9] py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2"
              >
                <Download size={16} /> Download Final Mix (MP3)
              </button>
              <button
                onClick={() => setShowCustomizeMix(!showCustomizeMix)}
                disabled={isRemixing}
                className="w-full bg-[#2bc7da]/20 hover:bg-[#2bc7da]/30 border border-[#2bc7da]/40 text-[#2bc7da] py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2"
              >
                <Settings2 size={16} /> Customize Mix Volumes
              </button>
              {bgmBlob && (
                <button
                  onClick={async () => {
                    const mp3 = await wavToMp3(bgmBlob, 192);
                    download(mp3, `bgm-${Date.now()}.mp3`);
                  }}
                  className="w-full bg-[#2e1d52] hover:bg-[#3f2a66] py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2"
                >
                  <Download size={16} /> Download BGM (MP3)
                </button>
              )}
              <button
                onClick={reset}
                className="w-full bg-[#2e1d52] hover:bg-[#3f2a66] py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 text-[#bca9dd]"
              >
                <RefreshCw size={16} /> Start New Song
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </main>
  );
}

// Light vocal enhancement — compression + soft saturation (no aggressive processing)
async function enhanceVocalLight(input: Float32Array, sampleRate: number): Promise<Float32Array> {
  const threshold = 0.1;
  const ratio = 3;
  const comp = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const abs = Math.abs(x);
    if (abs > threshold) {
      const sign = x < 0 ? -1 : 1;
      const excess = abs - threshold;
      comp[i] = sign * (threshold + excess / ratio);
    } else {
      comp[i] = x;
    }
    if (i % 32768 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  const out = new Float32Array(comp.length);
  for (let i = 0; i < comp.length; i++) {
    out[i] = Math.tanh(comp[i] * 1.3) * 0.9;
    if (i % 32768 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}
