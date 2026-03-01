'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AudioEngine, exportProjectWav } from '@/lib/audioEngine';
import { exportProjectMp3 } from '@/lib/mp3Exporter';
import { exportMonyxProject, loadProject, upsertProject } from '@/lib/projectManager';
import { useEditorStore } from '@/lib/store';
import { Clip } from '@/lib/types';
import { generateId } from '@/lib/utils';
import { Timeline } from '@/components/Timeline';
import { TrackHeader } from '@/components/TrackHeader';
import { TrackContent } from '@/components/TrackContent';
import { EffectRack } from '@/components/EffectRack';
import { ClipActionBar } from '@/components/ClipActionBar';
import { PlayheadOverlay } from '@/components/PlayheadOverlay';
import { Play, Pause, Plus, Minus, Music, Sliders, Volume2, Save, Loader2, Trash2 } from 'lucide-react';

const tabs = [
  { id: 'Edit', icon: Music, label: 'Edit' },
  { id: 'FX', icon: Sliders, label: 'FX' },
  { id: 'Tracks', icon: Volume2, label: 'Mixer' },
  { id: 'Export', icon: Save, label: 'Export' },
];

export default function EditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const engineRef = useRef<AudioEngine>();
  const [activeTab, setActiveTab] = useState('Edit');
  const [selectedTrackId, setSelectedTrackId] = useState<string>('');
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Scroll Synchronization
  const headerContainerRef = useRef<HTMLDivElement>(null);
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);

  // Gestures
  const editContainerRef = useRef<HTMLDivElement>(null);

  const {
    project, setProject, update, updateTransient, undo, redo,
    addTrack, deleteTrack,
    addClip, splitClip, duplicateClip,
    deleteClip, reverseClip,
    moveClip, trimClip,
    addEffect, removeEffect, updateEffectParam
  } = useEditorStore();

  useEffect(() => {
    engineRef.current = new AudioEngine();
    return () => {
        engineRef.current?.stop();
    };
  }, []);

  // Note: Playhead loop is now handled by PlayheadOverlay component
  // to avoid re-rendering the whole tree 60fps

  // Topology monitoring for auto-restart
  const projectRef = useRef(project);
  projectRef.current = project;

  const topologyHash = useMemo(() => {
      if (!project) return '';
      return JSON.stringify(project.tracks.map(t => ({
          id: t.id,
          mute: t.mute,
          solo: t.solo,
          clips: t.clips,
          effects: t.effects.map(e => ({ id: e.id, enabled: e.enabled, type: e.type }))
      })));
  }, [project]);

  useEffect(() => {
      if (engineRef.current?.isPlaying && projectRef.current) {
          engineRef.current.restart(projectRef.current);
      }
  }, [topologyHash]);

  useEffect(() => {
    (async () => {
      if (!params.id) return;
      const found = await loadProject(params.id);
      if (!found) return router.push('/');

      // Calculate initial zoom to fit the entire project in the viewport ("Fit All")
      const duration = Math.max(30, ...found.tracks.flatMap((t) => t.clips.map((c) => c.start + c.duration)));
      const screenWidth = window.innerWidth;

      // Fit duration into screen width with slight margin (1.1x duration visible)
      // width = duration * zoom
      // screenWidth = duration * zoom
      // zoom = screenWidth / duration
      const initialZoom = Math.min(500, Math.max(0.5, screenWidth / (duration * 1.1)));

      found.timeline.zoom = initialZoom;

      setProject(found);
      if (found.tracks.length > 0) setSelectedTrackId(found.tracks[0].id);
    })();
  }, [params.id, router, setProject]);

  useEffect(() => {
    if (!project) return;
    const id = setInterval(() => upsertProject(project), 5000);
    return () => clearInterval(id);
  }, [project]);

  // Sync Scrolling Logic
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      if (headerContainerRef.current) {
          headerContainerRef.current.scrollTop = target.scrollTop;
      }
      if (timelineContainerRef.current) {
          timelineContainerRef.current.scrollLeft = target.scrollLeft;
      }
  };

  // Zoom & Pan Gesture Handler
  useEffect(() => {
      const el = contentContainerRef.current; // Target main content area for zoom
      if (!el) return;

      let initialDist = 0;
      let initialZoom = 100;
      let initialCenter = { x: 0, y: 0 };
      let initialScroll = { left: 0, top: 0 };

      const onTouchStart = (e: TouchEvent) => {
          if (e.touches.length === 2) {
              const t1 = e.touches[0];
              const t2 = e.touches[1];

              const dx = t1.clientX - t2.clientX;
              const dy = t1.clientY - t2.clientY;
              initialDist = Math.hypot(dx, dy);

              initialCenter = {
                  x: (t1.clientX + t2.clientX) / 2,
                  y: (t1.clientY + t2.clientY) / 2
              };

              initialScroll = {
                  left: el.scrollLeft,
                  top: el.scrollTop
              };

              if (project) initialZoom = project.timeline.zoom;
          }
      };

      const onTouchMove = (e: TouchEvent) => {
          if (e.touches.length === 2 && initialDist > 0) {
              const t1 = e.touches[0];
              const t2 = e.touches[1];

              // 1. Calculate Zoom
              const dx = t1.clientX - t2.clientX;
              const dy = t1.clientY - t2.clientY;
              const dist = Math.hypot(dx, dy);

              const ratio = dist / initialDist;
              // Moderate sensitivity with new pan support
              const power = 4.0;
              const scale = Math.pow(ratio, power);

              // 2. Calculate Pan
              const currentCenter = {
                  x: (t1.clientX + t2.clientX) / 2,
                  y: (t1.clientY + t2.clientY) / 2
              };

              const deltaX = initialCenter.x - currentCenter.x;
              const deltaY = initialCenter.y - currentCenter.y;

              if (project) {
                  const newZoom = Math.min(500, Math.max(0.5, initialZoom * scale));
                  updateTransient(p => { p.timeline.zoom = newZoom; return p; });

                  // Apply Pan
                  el.scrollLeft = initialScroll.left + deltaX;
                  el.scrollTop = initialScroll.top + deltaY;
              }

              e.preventDefault(); // Prevent native page zoom/scroll
          }
      };

      el.addEventListener('touchstart', onTouchStart, { passive: false });
      el.addEventListener('touchmove', onTouchMove, { passive: false });

      return () => {
          el.removeEventListener('touchstart', onTouchStart);
          el.removeEventListener('touchmove', onTouchMove);
      };
  }, [project, update]);

  const selectedTrack = useMemo(() => project?.tracks.find((t) => t.id === selectedTrackId), [project, selectedTrackId]);

  const projectDuration = useMemo(() => {
      if (!project) return 30;
      const maxClipEnd = Math.max(
          0,
          ...project.tracks.flatMap((t) => t.clips.map((c) => c.start + c.duration))
      );
      return Math.max(30, maxClipEnd + 5);
  }, [project]);

  const contentWidth = useMemo(() => {
      if (!project) return 0;
      return Math.ceil(projectDuration * project.timeline.zoom);
  }, [project, projectDuration]);

  if (!project) return <main className="p-4 text-white">Loading...</main>;

  const download = (blob: Blob, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  };

  const exportMp3 = async (bitrate: number) => {
      setIsExporting(true);
      setExportProgress(0);
      try {
        const wav = await exportProjectWav(project);
        const mp3 = await exportProjectMp3(wav, bitrate, (progress) => {
            setExportProgress(progress);
        });
        download(mp3, `${project.name}_${bitrate}k.mp3`);
      } catch (e) {
          alert(`MP3 Export Failed: ${e}`);
      } finally {
          setIsExporting(false);
      }
  };

  const importAudio = async (file: File, targetTrackId?: string) => {
    const bufferId = generateId();
    const trackId = targetTrackId || selectedTrackId || project.tracks[0]?.id;
    if (!trackId) return;

    try {
        let audioBuffer: AudioBuffer;
        if (engineRef.current) {
            audioBuffer = await engineRef.current.decodeBlob(file);
        } else {
             const ctx = new AudioContext();
             const arr = await file.arrayBuffer();
             audioBuffer = await ctx.decodeAudioData(arr);
             ctx.close();
        }

        const duration = audioBuffer.duration;

        const clip: Clip = {
          id: generateId(),
          name: file.name,
          bufferId,
          start: project.timeline.playhead,
          offset: 0,
          duration: duration,
          fadeIn: 0,
          fadeOut: 0,
          gain: 1,
        };

        update((next) => {
          next.buffers.push({
            id: bufferId,
            name: file.name,
            sampleRate: audioBuffer.sampleRate,
            channels: audioBuffer.numberOfChannels,
            duration: duration,
            blob: file,
          });
          return next;
        });
        addClip(trackId, clip);
    } catch (e) {
        console.error("Failed to import audio", e);
        alert("Failed to import audio file. Format might not be supported.");
    }
  };

  const triggerImport = (trackId: string) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';
      input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) importAudio(file, trackId);
      };
      input.click();
  }

  const handleParamUpdate = (trackId: string, effectId: string, params: Record<string, number>, wet?: number) => {
      updateEffectParam(trackId, effectId, params, wet);
      engineRef.current?.setEffectParam(trackId, effectId, params);
  };

  const handleVolumeChange = (trackId: string, val: number) => {
      update(p => {
          const t = p.tracks.find(t => t.id === trackId);
          if (t) t.volume = val;
          return p;
      });
      engineRef.current?.setTrackVolume(trackId, val);
  };

  const handlePanChange = (trackId: string, val: number) => {
      update(p => {
          const t = p.tracks.find(t => t.id === trackId);
          if (t) t.pan = val;
          return p;
      });
      engineRef.current?.setTrackPan(trackId, val);
  };

  const togglePlay = async () => {
      if (isPlaying) {
          engineRef.current?.stop();
          setIsPlaying(false);
      } else {
          if (engineRef.current) {
              await engineRef.current.resume();
              await engineRef.current.play(project, project.timeline.playhead);
              setIsPlaying(true);
          }
      }
  };

  return (
    <main className="fixed inset-0 bg-[#0d0718] text-[#f0e9ff] flex flex-col select-none touch-manipulation overflow-hidden">
        {/* Export Progress Modal */}
        {isExporting && (
            <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
                <div className="bg-[#1a0f2e] p-6 rounded-xl border border-[#2e1d52] w-full max-w-xs text-center">
                    <Loader2 className="animate-spin mx-auto mb-4 text-[#7b3fe4]" size={32} />
                    <h3 className="text-lg font-bold mb-2">Exporting MP3...</h3>
                    <div className="w-full bg-[#2e1d52] h-2 rounded-full overflow-hidden">
                        <div className="bg-[#7b3fe4] h-full transition-all duration-300" style={{ width: `${exportProgress * 100}%` }} />
                    </div>
                    <p className="text-xs text-[#bca9dd] mt-2">{Math.round(exportProgress * 100)}%</p>
                </div>
            </div>
        )}

        {/* Header */}
        <header className="flex-none bg-[#1a0f2e] p-3 shadow-lg shadow-purple-900/10 z-40 border-b border-[#2e1d52] flex items-center justify-between">
            <div className="flex items-center gap-3">
                <button
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isPlaying ? 'bg-[#7b3fe4] shadow-[0_0_15px_rgba(123,63,228,0.5)]' : 'bg-[#2e1d52] hover:bg-[#3f2a66]'}`}
                    onClick={togglePlay}
                >
                    {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                </button>
                <div>
                    <h1 className="font-semibold text-sm leading-tight truncate max-w-[120px]">{project.name}</h1>
                    <div className="text-[10px] text-[#bca9dd] flex items-center gap-1">
                        {/* Display simplified time if not playing, else handled by overlay ref/context */}
                        {!isPlaying && (
                            <>
                                {Math.floor(project.timeline.playhead / 60)}:
                                {String(Math.floor(project.timeline.playhead % 60)).padStart(2, '0')}.
                                {String(Math.floor((project.timeline.playhead % 1) * 10)).padStart(1, '0')}
                            </>
                        )}
                        {isPlaying && <span className="text-[#7b3fe4] animate-pulse">Playing</span>}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button className="p-2 rounded bg-[#2e1d52] hover:bg-[#3f2a66]" onClick={undo}>
                    <span className="text-xs font-medium">Undo</span>
                </button>
                <button className="p-2 rounded bg-[#2e1d52] hover:bg-[#3f2a66]" onClick={redo}>
                    <span className="text-xs font-medium">Redo</span>
                </button>
                <div className="h-6 w-px bg-[#3f2a66] mx-1" />
                <button
                    className="p-2 rounded bg-[#3a2860] active:bg-[#7b3fe4]"
                    onClick={() => update(p => { p.timeline.zoom = Math.max(0.5, p.timeline.zoom * 0.5); return p; })}
                >
                    <Minus size={14} />
                </button>
                <button
                    className="p-2 rounded bg-[#3a2860] active:bg-[#7b3fe4]"
                    onClick={() => update(p => { p.timeline.zoom = Math.min(500, p.timeline.zoom * 1.5); return p; })}
                >
                    <Plus size={14} />
                </button>
            </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden relative bg-[#0d0718]" ref={editContainerRef}>
            {activeTab === 'Edit' && (
                <div className="flex flex-col h-full">
                    {/* Top Right: Timeline (Sticky) */}
                    <div className="flex flex-none h-8 border-b border-[#2e1d52]">
                         {/* Empty Top-Left Corner */}
                         <div className="w-32 flex-none bg-[#1a0f2e] border-r border-[#2e1d52] z-30 shadow-md"></div>

                         {/* Timeline Scroll Area */}
                         <div
                            ref={timelineContainerRef}
                            className="flex-1 overflow-hidden bg-[#130b22] relative"
                         >
                             <Timeline
                                project={project}
                                duration={projectDuration}
                                playbackTime={undefined} // handled by overlay
                                width={contentWidth}
                                onSeek={(time) => {
                                    update((next) => { next.timeline.playhead = time; return next; });
                                    if (isPlaying && engineRef.current && projectRef.current) {
                                        engineRef.current.play(projectRef.current, time);
                                    }
                                }}
                            />
                            <PlayheadOverlay timelineZoom={project.timeline.zoom} engineRef={engineRef} />
                         </div>
                    </div>

                    {/* Main Workspace (Scrollable) */}
                    <div className="flex flex-1 overflow-hidden">
                        {/* Left: Track Headers (Scrollable Vertical Only) */}
                        <div
                            ref={headerContainerRef}
                            className="w-32 flex-none overflow-hidden bg-[#1a0f2e] border-r border-[#2e1d52] z-20"
                        >
                             <div className="pb-20"> {/* Padding for add track button space */}
                                {project.tracks.map((track) => (
                                    <div
                                        key={track.id}
                                        onClick={() => setSelectedTrackId(track.id)}
                                        className={`transition-colors ${selectedTrackId === track.id ? 'bg-[#251642]' : ''}`}
                                    >
                                        <TrackHeader
                                            track={track}
                                            onToggleMute={() => update(n => { n.tracks.find(t => t.id === track.id)!.mute = !track.mute; return n; })}
                                            onToggleSolo={() => update(n => { n.tracks.find(t => t.id === track.id)!.solo = !track.solo; return n; })}
                                            onVolume={(v) => handleVolumeChange(track.id, v)}
                                            onPan={(v) => handlePanChange(track.id, v)}
                                            onDelete={() => deleteTrack(track.id)}
                                            onImport={() => triggerImport(track.id)}
                                        />
                                    </div>
                                ))}
                                <div className="p-2">
                                     <button
                                        className="w-full flex items-center justify-center gap-1 bg-[#2e1d52] py-2 rounded text-xs font-medium text-[#bca9dd] hover:text-white"
                                        onClick={() => addTrack()}
                                     >
                                        <Plus size={14} /> Add Track
                                    </button>
                                </div>
                             </div>
                        </div>

                        {/* Right: Track Content (Scrollable Both) */}
                        <div
                            ref={contentContainerRef}
                            className="flex-1 overflow-auto bg-[#0d0718] relative touch-pan-x touch-pan-y overscroll-contain"
                            style={{ WebkitOverflowScrolling: 'touch' }}
                            onScroll={handleScroll}
                        >
                            <div style={{ width: `${contentWidth}px` }} className="pb-20 relative">
                                {/* Playhead Overlay for Tracks */}
                                <PlayheadOverlay timelineZoom={project.timeline.zoom} engineRef={engineRef} />

                                {project.tracks.map((track) => (
                                    <div
                                        key={track.id}
                                        onClick={() => setSelectedTrackId(track.id)}
                                        className={`transition-colors ${selectedTrackId === track.id ? 'bg-[#1e1233]/30' : ''}`}
                                    >
                                        <TrackContent
                                            track={track}
                                            buffers={project.buffers}
                                            zoom={project.timeline.zoom}
                                            width={contentWidth}
                                            selectedClipId={selectedClipId}
                                            onSelectClip={setSelectedClipId}
                                            onMove={(c, s) => moveClip(track.id, c, s)}
                                            onResize={(c, s, e) => trimClip(track.id, c, s, e)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'FX' && (
                <div className="h-full flex flex-col p-2">
                    {selectedTrack ? (
                        <EffectRack
                            track={selectedTrack}
                            onAdd={(type) => addEffect(selectedTrack.id, type)}
                            onUpdate={handleParamUpdate}
                            onRemove={(effectId) => removeEffect(selectedTrack.id, effectId)}
                        />
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-[#5f4b86] text-sm">
                            Select a track to edit effects
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'Tracks' && (
                <div className="h-full overflow-x-auto">
                    <div className="flex gap-2 h-full p-2 min-w-max">
                        {project.tracks.map(track => (
                            <div key={track.id} className="w-24 bg-[#1a0f2e] rounded-xl p-3 flex flex-col items-center justify-between border border-[#2e1d52]">
                                <div className="text-center w-full">
                                    <div className="text-xs font-bold truncate mb-2" style={{ color: track.color }}>{track.name}</div>
                                    <div className="flex gap-1 justify-center mb-4">
                                        <button
                                            onClick={() => update(n => { n.tracks.find(t => t.id === track.id)!.mute = !track.mute; return n; })}
                                            className={`w-8 h-8 rounded flex items-center justify-center font-bold text-xs ${track.mute ? 'bg-red-500 text-white' : 'bg-[#2e1d52] border border-[#3f2a66]'}`}
                                        >M</button>
                                        <button
                                            onClick={() => update(n => { n.tracks.find(t => t.id === track.id)!.solo = !track.solo; return n; })}
                                            className={`w-8 h-8 rounded flex items-center justify-center font-bold text-xs ${track.solo ? 'bg-yellow-500 text-black' : 'bg-[#2e1d52] border border-[#3f2a66]'}`}
                                        >S</button>
                                    </div>
                                </div>

                                <div className="flex-1 flex gap-2 w-full justify-center">
                                    <div className="h-full w-8 bg-[#0d0718] rounded-full relative group">
                                        <div
                                            className="absolute bottom-0 left-0 right-0 bg-[#7b3fe4] rounded-full opacity-50 pointer-events-none"
                                            style={{ height: `${Math.min(100, track.volume * 80)}%` }}
                                        />
                                        <input
                                            type="range"
                                            min="0" max="1.5" step="0.01"
                                            value={track.volume}
                                            onChange={e => handleVolumeChange(track.id, Number(e.target.value))}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            style={{ writingMode: 'vertical-lr', direction: 'rtl' }} // Firefox
                                        />
                                    </div>
                                </div>
                                <div className="mt-2 text-[10px] text-[#bca9dd]">{track.volume.toFixed(2)} dB</div>
                                <button
                                    onClick={() => deleteTrack(track.id)}
                                    className="mt-3 p-2 bg-red-900/50 hover:bg-red-700 rounded text-red-200"
                                    title="Delete Track"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'Export' && (
                <div className="flex flex-col items-center justify-center h-full p-4 space-y-4">
                    <div className="bg-[#1a0f2e] p-6 rounded-xl w-full max-w-sm border border-[#2e1d52]">
                        <h2 className="text-lg font-bold mb-1">Export Project</h2>
                        <p className="text-xs text-[#bca9dd] mb-6">Render your mix to an audio file.</p>

                        <div className="space-y-3">
                            <button
                                className="w-full bg-[#7b3fe4] hover:bg-[#6a35c4] py-3 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
                                onClick={async () => download(await exportProjectWav(project), `${project.name}.wav`)}
                            >
                                <Music size={16} /> Export as WAV (High Quality)
                            </button>
                            <button
                                className="w-full bg-[#7b3fe4] hover:bg-[#6a35c4] py-3 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
                                onClick={() => exportMp3(320)}
                            >
                                <Music size={16} /> Export as MP3 (320kbps)
                            </button>
                            <button
                                className="w-full bg-[#7b3fe4] hover:bg-[#6a35c4] py-3 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
                                onClick={() => exportMp3(128)}
                            >
                                <Music size={16} /> Export as MP3 (128kbps)
                            </button>
                            <div className="h-px bg-[#2e1d52] my-4" />
                            <button
                                className="w-full bg-[#2e1d52] hover:bg-[#3f2a66] py-3 rounded-lg font-medium text-sm transition-colors"
                                onClick={async () => download(await exportMonyxProject(project), `${project.name}.monyx`)}
                            >
                                Save Project File (.monyx)
                            </button>
                            <button
                                className="w-full bg-[#2e1d52] hover:bg-[#3f2a66] py-3 rounded-lg font-medium text-sm transition-colors"
                                onClick={() => upsertProject(project)}
                            >
                                Quick Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Clip Action Bar */}
        {selectedClipId && activeTab === 'Edit' && (
            <ClipActionBar clipId={selectedClipId} trackId={selectedTrackId} playhead={project.timeline.playhead} />
        )}

        {/* Bottom Tab Bar */}
        <nav className="flex-none bg-[#1a0f2e] border-t border-[#2e1d52] grid grid-cols-4 p-1 pb-safe z-50">
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all ${isActive ? 'text-[#7b3fe4] bg-[#251642]' : 'text-[#bca9dd] hover:text-[#f0e9ff]'}`}
                    >
                        <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                        <span className="text-[10px] font-medium mt-1">{tab.label}</span>
                    </button>
                )
            })}
        </nav>
    </main>
  );
}
