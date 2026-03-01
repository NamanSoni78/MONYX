'use client';

import { ProjectData } from '@/lib/types';
import { useRef } from 'react';

interface Props {
  project: ProjectData;
  duration: number; // Duration in seconds
  playbackTime?: number; // Visual playhead position
  onSeek: (time: number) => void;
  width: number;
}

export function Timeline({ project, duration, playbackTime, onSeek, width }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Calculate dynamic tick interval based on zoom to prevent overlap
  // zoom is pixels per second.
  // We want at least 50px between ticks.
  // interval * zoom >= 50
  // interval >= 50 / zoom

  const zoom = project.timeline.zoom;
  const minSpacing = 60; // pixels

  let interval = 1;
  const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

  for (const c of candidates) {
      if (c * zoom >= minSpacing) {
          interval = c;
          break;
      }
  }

  const ticks = [];
  for (let t = 0; t <= duration; t += interval) {
      ticks.push(t);
  }

  // Use the playbackTime if provided, otherwise the static playhead from project
  const currentHead = playbackTime ?? project.timeline.playhead;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!ref.current) return;
    // Only capture primary click/touch
    if (e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    const el = ref.current;
    el.setPointerCapture(e.pointerId);

    const rect = el.getBoundingClientRect();

    const seek = (clientX: number) => {
       const x = clientX - rect.left;
       const time = Math.max(0, x / zoom);
       onSeek(time);
    };

    seek(e.clientX);

    const move = (ev: PointerEvent) => {
        ev.preventDefault();
        seek(ev.clientX);
    };

    const up = (ev: PointerEvent) => {
       el.releasePointerCapture(ev.pointerId);
       el.removeEventListener('pointermove', move);
       el.removeEventListener('pointerup', up);
    };

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  return (
    <div
        ref={ref}
        className="relative h-8 bg-[#130b22] border-b border-[#2e1d52] cursor-pointer touch-none z-20"
        style={{ width: `${width}px` }}
        onPointerDown={handlePointerDown}
    >
        {ticks.map((t) => (
        <div
            key={t}
            className="absolute top-0 bottom-0 border-l border-[#3a2860] pl-1 text-[10px] text-[#b7a5d8] select-none pointer-events-none"
            style={{ left: `${t * zoom}px` }}
        >
            {Math.floor(t / 60)}:{String(t % 60).padStart(2, '0')}
        </div>
        ))}

        {/* Playhead */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-fuchsia-400 z-10 shadow-[0_0_10px_rgba(232,121,249,0.8)]"
          style={{ left: `${currentHead * zoom}px` }}
        >
          <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-fuchsia-400 rounded-full" />
        </div>
    </div>
  );
}
