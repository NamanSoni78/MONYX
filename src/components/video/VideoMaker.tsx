'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Upload,
  Image as ImageIcon,
  Video as VideoIcon,
  Music,
  Trash2,
  Play,
  Pause,
  Download,
  Plus,
  Type,
  Settings,
  Loader2,
  Check,
  Film,
} from 'lucide-react';
import {
  renderVideo,
  VideoClip,
  VideoProject,
  RenderProgress,
  isMp4Supported,
} from '@/lib/audio/videoExporter';

interface MediaItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  file: File;
  name: string;
  duration: number; // for video
}

export function VideoMaker({ onExit }: { onExit: () => void }) {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [audioDuration, setAudioDuration] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState<RenderProgress | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const [resolution, setResolution] = useState<{ width: number; height: number }>({ width: 1280, height: 720 });
  const [fps, setFps] = useState(24);
  const [bgColor, setBgColor] = useState('#000000');

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      mediaItems.forEach((m) => URL.revokeObjectURL(m.url));
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addMedia = async (files: FileList) => {
    const newItems: MediaItem[] = [];
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file);
      let duration = 5;
      if (file.type.startsWith('video/')) {
        const v = document.createElement('video');
        v.src = url;
        await new Promise<void>((resolve) => {
          v.onloadedmetadata = () => {
            duration = v.duration;
            resolve();
          };
          setTimeout(resolve, 2000); // fallback
        });
      }
      newItems.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: file.type.startsWith('video/') ? 'video' : 'image',
        url,
        file,
        name: file.name,
        duration,
      });
    }
    setMediaItems((prev) => [...prev, ...newItems]);
  };

  const addClip = (media: MediaItem) => {
    const start = clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);
    const duration = media.type === 'video' ? Math.min(media.duration, 10) : 5;
    const clip: VideoClip = {
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: media.type,
      url: media.url,
      start,
      duration,
      fadeIn: 0.5,
      fadeOut: 0.5,
    };
    setClips((prev) => [...prev, clip]);
  };

  const removeClip = (id: string) => {
    setClips((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      // Re-timeline
      let cursor = 0;
      return filtered.map((c) => {
        const newClip = { ...c, start: cursor };
        cursor += c.duration;
        return newClip;
      });
    });
    if (selectedClipId === id) setSelectedClipId(null);
  };

  const updateClip = (id: string, patch: Partial<VideoClip>) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const moveClip = (id: string, dir: 'left' | 'right') => {
    setClips((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx < 0) return prev;
      const newIdx = dir === 'left' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      let cursor = 0;
      return copy.map((c) => {
        const newClip = { ...c, start: cursor };
        cursor += c.duration;
        return newClip;
      });
    });
  };

  const handleAudioUpload = async (file: File) => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const url = URL.createObjectURL(file);
    setAudioFile(file);
    setAudioUrl(url);
    // Get duration
    const a = new Audio();
    a.src = url;
    await new Promise<void>((resolve) => {
      a.onloadedmetadata = () => {
        setAudioDuration(a.duration);
        resolve();
      };
      setTimeout(resolve, 3000);
    });
  };

  const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);
  const finalDuration = Math.max(totalDuration, audioDuration);

  const selectedClip = clips.find((c) => c.id === selectedClipId);

  const doRender = async () => {
    if (clips.length === 0) {
      setError('Add at least one image or video clip');
      return;
    }
    if (!audioUrl) {
      setError('Add an audio track');
      return;
    }
    setError('');
    setIsRendering(true);
    setRenderProgress({ stage: 'Starting', progress: 0 });
    setResultBlob(null);
    try {
      const project: VideoProject = {
        width: resolution.width,
        height: resolution.height,
        fps,
        clips,
        audio: { url: audioUrl, start: 0, volume: 1 },
        backgroundColor: bgColor,
        totalDuration: finalDuration,
      };
      const blob = await renderVideo(project, (p) => setRenderProgress(p));
      setResultBlob(blob);
    } catch (e) {
      setError(`Render failed: ${e}`);
    } finally {
      setIsRendering(false);
      setRenderProgress(null);
    }
  };

  const download = (blob: Blob, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
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
            <h1 className="text-lg font-semibold">Video Maker</h1>
            <p className="text-[10px] text-[#bca9dd]">
              Combine images/videos with your audio → MP4 video.
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-200 text-xs p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Media library */}
        <div className="bg-[#1a0f2e] rounded-xl p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-[#bca9dd] flex items-center gap-1.5">
              <ImageIcon size={12} /> Media Library
            </div>
            <label className="text-[10px] text-[#7b3fe4] cursor-pointer flex items-center gap-1">
              <Plus size={10} /> Add
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) addMedia(e.target.files);
                }}
              />
            </label>
          </div>
          {mediaItems.length === 0 ? (
            <label className="block w-full py-6 border-2 border-dashed border-[#2e1d52] rounded-lg text-center cursor-pointer hover:border-[#7b3fe4]">
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) addMedia(e.target.files);
                }}
              />
              <Upload className="w-6 h-6 mx-auto mb-1 text-[#5f4b86]" />
              <div className="text-[10px] text-[#bca9dd]">Tap to upload images or videos</div>
            </label>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {mediaItems.map((m) => (
                <div
                  key={m.id}
                  className="relative aspect-square bg-[#0d0718] rounded-lg overflow-hidden cursor-pointer group"
                  onClick={() => addClip(m)}
                >
                  {m.type === 'image' ? (
                    <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <video src={m.url} className="w-full h-full object-cover" muted />
                      <div className="absolute top-1 right-1 bg-black/70 px-1 rounded text-[8px] text-white flex items-center gap-0.5">
                        <VideoIcon size={8} /> {m.duration.toFixed(1)}s
                      </div>
                    </>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Plus className="w-5 h-5 text-white" />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 text-[10px] text-[#5f4b86]">Tap a thumbnail to add it to the timeline</div>
        </div>

        {/* Timeline */}
        <div className="bg-[#1a0f2e] rounded-xl p-3 mb-4">
          <div className="text-xs font-medium text-[#bca9dd] mb-2 flex items-center gap-1.5">
            <Film size={12} /> Timeline ({clips.length} clips)
          </div>
          {clips.length === 0 ? (
            <div className="text-[10px] text-[#5f4b86] py-4 text-center">
              No clips yet. Add some from the media library above.
            </div>
          ) : (
            <div className="space-y-1">
              {clips.map((c, idx) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedClipId(c.id)}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer ${selectedClipId === c.id ? 'bg-[#251642] border border-[#7b3fe4]' : 'bg-[#0d0718]'}`}
                >
                  <div className="text-[10px] text-[#5f4b86] w-4">{idx + 1}</div>
                  <div className="w-10 h-10 bg-black rounded overflow-hidden shrink-0">
                    {c.type === 'image' ? (
                      <img src={c.url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <video src={c.url} className="w-full h-full object-cover" muted />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-medium truncate">{c.type.toUpperCase()}</div>
                    <div className="text-[9px] text-[#bca9dd]">{c.duration.toFixed(1)}s</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); moveClip(c.id, 'left'); }}
                    className="w-6 h-6 rounded bg-[#2e1d52] hover:bg-[#3f2a66] text-[10px]"
                    disabled={idx === 0}
                  >
                    ←
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); moveClip(c.id, 'right'); }}
                    className="w-6 h-6 rounded bg-[#2e1d52] hover:bg-[#3f2a66] text-[10px]"
                    disabled={idx === clips.length - 1}
                  >
                    →
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeClip(c.id); }}
                    className="w-6 h-6 rounded bg-red-900/50 hover:bg-red-700 text-red-300"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
              <div className="text-[10px] text-[#bca9dd] text-center pt-1">
                Total: <span className="font-mono text-white">{totalDuration.toFixed(1)}s</span>
              </div>
            </div>
          )}
        </div>

        {/* Selected clip editor */}
        {selectedClip && (
          <div className="bg-[#1a0f2e] rounded-xl p-3 mb-4 space-y-2">
            <div className="text-xs font-medium text-[#bca9dd] flex items-center gap-1.5">
              <Settings size={12} /> Edit selected clip
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-[#bca9dd] mb-1">
                <span>Duration</span>
                <span className="font-mono text-white">{selectedClip.duration.toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min={1}
                max={300}
                step={0.5}
                value={selectedClip.duration}
                onChange={(e) => {
                  const newDur = Number(e.target.value);
                  setClips((prev) => {
                    const idx = prev.findIndex((c) => c.id === selectedClip.id);
                    if (idx < 0) return prev;
                    const copy = [...prev];
                    copy[idx] = { ...copy[idx], duration: newDur };
                    let cursor = 0;
                    return copy.map((c) => {
                      const newClip = { ...c, start: cursor };
                      cursor += c.duration;
                      return newClip;
                    });
                  });
                }}
                className="w-full accent-[#7b3fe4]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex justify-between text-[10px] text-[#bca9dd] mb-1">
                  <span>Fade In</span>
                  <span className="font-mono text-white">{(selectedClip.fadeIn || 0).toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={selectedClip.fadeIn || 0}
                  onChange={(e) => updateClip(selectedClip.id, { fadeIn: Number(e.target.value) })}
                  className="w-full accent-[#7b3fe4]"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-[#bca9dd] mb-1">
                  <span>Fade Out</span>
                  <span className="font-mono text-white">{(selectedClip.fadeOut || 0).toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={selectedClip.fadeOut || 0}
                  onChange={(e) => updateClip(selectedClip.id, { fadeOut: Number(e.target.value) })}
                  className="w-full accent-[#7b3fe4]"
                />
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#bca9dd] mb-1 flex items-center gap-1">
                <Type size={10} /> Text overlay
              </div>
              <input
                type="text"
                value={selectedClip.text || ''}
                onChange={(e) => updateClip(selectedClip.id, { text: e.target.value })}
                placeholder="Add text..."
                className="w-full bg-[#0d0718] border border-[#2e1d52] rounded-lg p-2 text-xs"
              />
            </div>
          </div>
        )}

        {/* Audio track */}
        <div className="bg-[#1a0f2e] rounded-xl p-3 mb-4">
          <div className="text-xs font-medium text-[#bca9dd] mb-2 flex items-center gap-1.5">
            <Music size={12} /> Audio Track
          </div>
          {!audioUrl ? (
            <label className="block w-full py-4 border-2 border-dashed border-[#2e1d52] rounded-lg text-center cursor-pointer hover:border-[#7b3fe4]">
              <input
                type="file"
                accept="audio/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleAudioUpload(f);
                }}
              />
              <Upload className="w-5 h-5 mx-auto mb-1 text-[#5f4b86]" />
              <div className="text-[10px] text-[#bca9dd]">Upload audio track</div>
            </label>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <audio ref={audioRef} src={audioUrl} controls className="flex-1 h-8" />
                <button
                  onClick={() => {
                    if (audioUrl) URL.revokeObjectURL(audioUrl);
                    setAudioFile(null);
                    setAudioUrl('');
                    setAudioDuration(0);
                  }}
                  className="w-7 h-7 rounded bg-red-900/50 hover:bg-red-700 text-red-300 flex items-center justify-center"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="text-[10px] text-[#bca9dd] mt-1">{audioDuration.toFixed(1)}s</div>
            </div>
          )}
        </div>

        {/* Settings */}
        <div className="bg-[#1a0f2e] rounded-xl p-3 mb-4 space-y-2">
          <div className="text-xs font-medium text-[#bca9dd] flex items-center gap-1.5">
            <Settings size={12} /> Output Settings
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { w: 1280, h: 720, label: '720p' },
              { w: 1920, h: 1080, label: '1080p' },
              { w: 720, h: 1280, label: '9:16' },
            ] as const).map((r) => (
              <button
                key={r.label}
                onClick={() => setResolution({ width: r.w, height: r.h })}
                className={`py-2 rounded-lg text-[10px] font-medium ${resolution.width === r.w && resolution.height === r.h ? 'bg-[#7b3fe4] text-white' : 'bg-[#0d0718] text-[#bca9dd]'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#bca9dd]">FPS:</span>
            <select
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              className="bg-[#0d0718] border border-[#2e1d52] rounded p-1 text-[10px]"
            >
              <option value={24}>24</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
            <div className="ml-auto text-[10px] text-[#bca9dd]">
              Output: <span className="text-white">MP4 (H.264)</span>
            </div>
          </div>
        </div>

        {/* Render button */}
        {isRendering ? (
          <div className="bg-[#1a0f2e] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#7b3fe4]" />
              <span className="text-xs">{renderProgress?.stage}</span>
            </div>
            <div className="w-full bg-[#2e1d52] h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-[#7b3fe4] to-[#2bc7da] h-full transition-all duration-200"
                style={{ width: `${(renderProgress?.progress || 0) * 100}%` }}
              />
            </div>
            <div className="text-[10px] text-[#bca9dd] mt-1 text-right">
              {Math.round((renderProgress?.progress || 0) * 100)}%
            </div>
          </div>
        ) : (
          <button
            onClick={doRender}
            disabled={clips.length === 0 || !audioUrl}
            className="w-full bg-[#7b3fe4] hover:bg-[#6a35c9] disabled:bg-[#2e1d52] disabled:text-[#5f4b86] py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2"
          >
            <Film size={16} /> Render Video
          </button>
        )}

        {/* Result */}
        {resultBlob && !isRendering && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-4 bg-[#1a0f2e] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Check className="w-5 h-5 text-[#2bc7da]" />
              <h3 className="font-bold text-sm">Video rendered!</h3>
            </div>
            <video src={URL.createObjectURL(resultBlob)} controls className="w-full rounded-lg" />
            <button
              onClick={() => download(resultBlob, `video-${Date.now()}.${resultBlob.type.includes('mp4') ? 'mp4' : 'webm'}`)}
              className="w-full mt-3 bg-[#7b3fe4] hover:bg-[#6a35c9] py-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
            >
              <Download size={14} /> Download Video
            </button>
          </motion.div>
        )}
      </div>
    </main>
  );
}
