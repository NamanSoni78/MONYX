'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Upload,
  Loader2,
  Download,
  Sparkles,
  Music,
  Mic2,
  Check,
  Cpu,
} from 'lucide-react';
import { WaveformPreview } from '@/components/common/WaveformPreview';
import { decodeAudioFile, DecodedAudio } from '@/lib/audio/wavUtils';
import {
  separateAudio,
  SeparationResult,
  SeparationProgress,
} from '@/lib/audio/vocalSeparator';
import {
  ensureDefaultModel,
  isWebGPUEnabled,
} from '@/lib/audio/onnxModelManager';
import { wavToMp3 } from '@/lib/audio/audioConverter';

type Stage = 'idle' | 'processing' | 'done';

const BUNDLED_MODEL_ID = 'monyx-model-bundled-mdxnet-kara-2';

export function VocalRemover({ onExit }: { onExit: () => void }) {
  const [stage, setStage] = useState<Stage>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [decoded, setDecoded] = useState<DecodedAudio | null>(null);
  const [progress, setProgress] = useState<SeparationProgress | null>(null);
  const [result, setResult] = useState<SeparationResult | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'vocals' | 'instrumental'>('vocals');
  const [convertingMp3, setConvertingMp3] = useState(false);
  const [webgpuEnabled, setWebgpuEnabled] = useState(false);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [modelLoadProgress, setModelLoadProgress] = useState(0);

  // Memoize the audio URL so we don't create a new blob URL on every render.
  const activeAudioUrl = useMemo(() => {
    if (!result) return '';
    const blob = activeTab === 'vocals' ? result.vocals : result.instrumental;
    return URL.createObjectURL(blob);
  }, [result, activeTab]);

  useEffect(() => {
    return () => {
      if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
    };
  }, [activeAudioUrl]);

  // Auto-load the bundled model on first visit. The model is served from
  // /public/UVR_MDXNET_KARA_2.onnx (~25MB) and cached in IndexedDB.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setModelStatus('loading');
        setModelLoadProgress(0);
        const m = await ensureDefaultModel((p) => {
          if (!cancelled) setModelLoadProgress(p);
        });
        if (cancelled) return;
        if (m) {
          setModelStatus('ready');
        } else {
          setModelStatus('error');
        }
      } catch (e) {
        console.warn('Auto-load model failed:', e);
        if (!cancelled) setModelStatus('error');
      }
    })();
    setWebgpuEnabled(isWebGPUEnabled());
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = async (f: File) => {
    setError('');
    try {
      setFile(f);
      const d = await decodeAudioFile(f);
      setDecoded(d);
      setStage('idle');
      setResult(null);
    } catch (e) {
      setError(`Failed to decode: ${e}`);
    }
  };

  const run = async () => {
    if (!decoded) return;
    if (modelStatus !== 'ready') {
      setError('AI model is still loading. Please wait a moment.');
      return;
    }
    setError('');
    setStage('processing');
    setProgress({ stage: 'Starting', progress: 0 });
    try {
      const r = await separateAudio(
        decoded,
        { preferModel: BUNDLED_MODEL_ID, modelKind: 'mdxnet' },
        (p) => setProgress(p)
      );
      setResult(r);
      setStage('done');
    } catch (e) {
      setError(`Separation failed: ${e}`);
      setStage('idle');
    } finally {
      setProgress(null);
    }
  };

  const downloadMp3 = async (blob: Blob, name: string) => {
    setConvertingMp3(true);
    try {
      const mp3 = await wavToMp3(blob, 192);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(mp3);
      a.download = name.replace('.wav', '.mp3');
      a.click();
    } finally {
      setConvertingMp3(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0d0718] text-[#f0e9ff]">
      <div className="mx-auto max-w-md px-4 py-4 pb-16">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={onExit}
            className="w-9 h-9 rounded-full bg-[#1a0f2e] hover:bg-[#2e1d52] flex items-center justify-center"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Vocal Remover (AI)</h1>
            <p className="text-[10px] text-[#bca9dd]">
              Separate vocals from instrumental using AI.
            </p>
          </div>
          <div className={`text-[9px] flex items-center gap-1 ${webgpuEnabled ? 'text-[#2bc7da]' : 'text-[#5f4b86]'}`}>
            <Cpu size={10} /> {webgpuEnabled ? 'WebGPU' : 'WASM'}
          </div>
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-200 text-xs p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Model status banner — replaces the old model manager */}
        <div className="bg-[#1a0f2e] rounded-xl p-3 mb-4 flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${modelStatus === 'ready' ? 'bg-[#59d98e]' : modelStatus === 'loading' ? 'bg-[#fbbf24] animate-pulse' : 'bg-red-500'}`} />
          <div className="flex-1">
            <div className="text-xs font-medium">
              {modelStatus === 'ready' && 'AI Model ready — UVR MDX-Net KARA 2'}
              {modelStatus === 'loading' && `Loading AI model... ${Math.round(modelLoadProgress * 100)}%`}
              {modelStatus === 'error' && 'Model failed to load. Refresh the page.'}
            </div>
            <div className="text-[10px] text-[#bca9dd]">
              {modelStatus === 'ready' && 'Cached in your browser. No internet needed.'}
              {modelStatus === 'loading' && 'Bundled model (~25MB, one-time download).'}
              {modelStatus === 'error' && 'Check your connection and reload.'}
            </div>
          </div>
        </div>

        {!file && (
          <label className="block w-full rounded-2xl bg-[#1a0f2e] border-2 border-dashed border-[#2e1d52] hover:border-[#7b3fe4] p-8 text-center cursor-pointer transition-colors">
            <input
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Upload className="w-10 h-10 mx-auto mb-3 text-[#7b3fe4]" />
            <div className="font-medium text-sm">Upload a song</div>
            <div className="text-xs text-[#bca9dd] mt-1">MP3, WAV, M4A — any audio format</div>
          </label>
        )}

        {file && decoded && (
          <div className="bg-[#1a0f2e] rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-[#bca9dd]">Source</div>
                <div className="font-medium text-sm truncate">{file.name}</div>
              </div>
              <button
                onClick={() => {
                  setFile(null);
                  setDecoded(null);
                  setResult(null);
                  setStage('idle');
                }}
                className="text-xs text-[#bca9dd] hover:text-white px-2 py-1"
              >
                Change
              </button>
            </div>
            <WaveformPreview audioBuffer={audioBufferFromDecoded(decoded)} height={60} />
            <div className="text-xs text-[#bca9dd] mt-2 flex items-center gap-3">
              <span>{decoded.duration.toFixed(1)}s</span>
              <span>{decoded.sampleRate / 1000}kHz</span>
              <span>{decoded.channels === 2 ? 'Stereo' : 'Mono'}</span>
            </div>
          </div>
        )}

        {file && stage === 'idle' && (
          <button
            onClick={run}
            disabled={!decoded || modelStatus !== 'ready'}
            className="w-full bg-[#7b3fe4] hover:bg-[#6a35c9] disabled:bg-[#2e1d52] disabled:text-[#5f4b86] py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2"
          >
            <Sparkles size={16} /> Separate Vocals & BGM
          </button>
        )}

        {stage === 'processing' && progress && (
          <div className="bg-[#1a0f2e] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <Loader2 className="w-5 h-5 animate-spin text-[#7b3fe4]" />
              <span className="text-sm font-medium">{progress.stage}</span>
            </div>
            <div className="w-full bg-[#2e1d52] h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-[#7b3fe4] to-[#2bc7da] h-full transition-all duration-200"
                style={{ width: `${progress.progress * 100}%` }}
              />
            </div>
            <div className="text-xs text-[#bca9dd] mt-2 text-right">
              {Math.round(progress.progress * 100)}%
            </div>
          </div>
        )}

        {stage === 'done' && result && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="bg-gradient-to-br from-[#1a0f2e] to-[#2a1847] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Check className="w-5 h-5 text-[#2bc7da]" />
                <h3 className="font-bold">Separation complete!</h3>
              </div>
              <p className="text-xs text-[#bca9dd]">Method: <span className="text-white">{result.method}</span></p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('vocals')}
                className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 ${activeTab === 'vocals' ? 'bg-[#7b3fe4] text-white' : 'bg-[#2e1d52] text-[#bca9dd]'}`}
              >
                <Mic2 size={14} /> Vocals
              </button>
              <button
                onClick={() => setActiveTab('instrumental')}
                className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 ${activeTab === 'instrumental' ? 'bg-[#7b3fe4] text-white' : 'bg-[#2e1d52] text-[#bca9dd]'}`}
              >
                <Music size={14} /> Instrumental
              </button>
            </div>

            <div className="bg-[#1a0f2e] rounded-xl p-4">
              <audio src={activeAudioUrl} controls className="w-full" />
              <button
                onClick={() => downloadMp3(
                  activeTab === 'vocals' ? result.vocals : result.instrumental,
                  `${activeTab}-${Date.now()}.mp3`
                )}
                disabled={convertingMp3}
                className="w-full mt-3 bg-[#7b3fe4] hover:bg-[#6a35c9] disabled:opacity-50 py-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
              >
                {convertingMp3 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download size={14} />}
                Download {activeTab === 'vocals' ? 'Vocals' : 'Instrumental'} (MP3)
              </button>
            </div>

            <button
              onClick={() => {
                setStage('idle');
                setResult(null);
              }}
              className="w-full bg-[#2e1d52] hover:bg-[#3f2a66] py-3 rounded-xl font-medium text-sm"
            >
              Try Again
            </button>
          </motion.div>
        )}
      </div>
    </main>
  );
}

function audioBufferFromDecoded(decoded: DecodedAudio): AudioBuffer {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextClass();
  const buf = ctx.createBuffer(decoded.channels, decoded.length, decoded.sampleRate);
  for (let c = 0; c < decoded.channels; c++) {
    buf.copyToChannel(decoded.data[c], c);
  }
  return buf;
}
