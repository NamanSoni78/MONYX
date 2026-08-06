'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Clip, ProjectAudioBuffer } from '@/lib/monyx/types';
import { Waveform } from './Waveform';

interface Props {
  clip: Clip;
  buffer?: ProjectAudioBuffer;
  zoom: number;
  trackColor: string;
  isSelected: boolean;
  onSelect: () => void;
  onCommitMove: (clipId: string, newStart: number) => void;
  onCommitResize: (clipId: string, newStart: number, newEnd: number) => void;
}

export const DraggableClip = React.memo(function DraggableClip({
  clip,
  buffer,
  zoom,
  trackColor,
  isSelected,
  onSelect,
  onCommitMove,
  onCommitResize,
}: Props) {
  const [visual, setVisual] = useState({
      start: clip.start,
      duration: clip.duration,
      offset: clip.offset
  });
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Sync with external updates when not dragging
  useEffect(() => {
    if (!dragging) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisual({
          start: clip.start,
          duration: clip.duration,
          offset: clip.offset
      });
    }
  }, [clip.start, clip.duration, clip.offset, dragging]);

  const handlePointerDown = (e: React.PointerEvent, type: 'move' | 'resizeL' | 'resizeR') => {
    if (e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    onSelect(); // Select on interaction

    const el = ref.current;
    if (!el) return;

    try {
        el.setPointerCapture(e.pointerId);
    } catch (err) {
        console.warn('Pointer capture failed', err);
    }

    setDragging(true);

    const startX = e.clientX;
    const initStart = visual.start;
    const initDuration = visual.duration;
    const initOffset = visual.offset;

    const onPointerMove = (ev: PointerEvent) => {
      ev.preventDefault();
      ev.stopPropagation();

      const deltaX = ev.clientX - startX;
      const deltaSec = deltaX / zoom;

      if (type === 'move') {
        const newStart = Math.max(0, initStart + deltaSec);
        setVisual(v => ({ ...v, start: newStart }));
      } else if (type === 'resizeL') {
        let newStart = initStart + deltaSec;
        const end = initStart + initDuration;

        newStart = Math.max(0, newStart);
        newStart = Math.min(newStart, end - 0.05);

        const change = newStart - initStart;

        setVisual(v => ({
            ...v,
            start: newStart,
            duration: initDuration - change,
            offset: initOffset + change
        }));
      } else if (type === 'resizeR') {
        let newDuration = Math.max(0.05, initDuration + deltaSec);

        if (buffer && buffer.duration) {
            const maxDuration = buffer.duration - visual.offset;
            newDuration = Math.min(newDuration, maxDuration);
        }

        setVisual(v => ({ ...v, duration: newDuration }));
      }
    };

    const onPointerUp = (ev: PointerEvent) => {
      ev.preventDefault();
      ev.stopPropagation();

      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      try {
          if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
      } catch (e) { /* ignore */ }

      setDragging(false);

      const deltaX = ev.clientX - startX;
      const deltaSec = deltaX / zoom;

      if (type === 'move') {
         const newStart = Math.max(0, initStart + deltaSec);
         if (Math.abs(newStart - clip.start) > 0.001) {
             onCommitMove(clip.id, newStart);
         } else {
             setVisual({ start: clip.start, duration: clip.duration, offset: clip.offset });
         }
      } else if (type === 'resizeL') {
         let newStart = initStart + deltaSec;
         const end = initStart + initDuration;
         newStart = Math.max(0, Math.min(newStart, end - 0.05));
         const change = newStart - initStart;

         if (Math.abs(change) > 0.001) {
             onCommitResize(clip.id, newStart, end);
         } else {
             setVisual({ start: clip.start, duration: clip.duration, offset: clip.offset });
         }
      } else if (type === 'resizeR') {
         const newDuration = Math.max(0.05, initDuration + deltaSec);
         if (Math.abs(newDuration - clip.duration) > 0.001) {
             onCommitResize(clip.id, clip.start, clip.start + newDuration);
         } else {
             setVisual({ start: clip.start, duration: clip.duration, offset: clip.offset });
         }
      }
    };

    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
  };

  const width = Math.max(visual.duration * zoom, 2);

  return (
    <div
      ref={ref}
      className={`absolute top-1 bottom-1 rounded-lg border bg-[#2a1847] overflow-hidden group select-none
                 ${dragging ? 'border-[#7b3fe4] z-50 shadow-lg' : 'border-white/10 hover:border-[#7b3fe4] hover:z-40'}
                 transition-colors`}
      style={{
        left: 0,
        transform: `translate3d(${visual.start * zoom}px, 0, 0)`,
        width: `${width}px`,
        touchAction: 'none'
      }}
      onPointerDown={(e) => handlePointerDown(e, 'move')}
    >
      {/* Waveform */}
      <div className="absolute inset-0 pointer-events-none opacity-80">
        <Waveform
          blob={buffer?.blob}
          bufferId={buffer?.id}
          width={width}
          height={110}
          color={trackColor}
          start={visual.offset}
          end={visual.offset + visual.duration}
        />
      </div>

      {/* Resize Handles - Wider touch targets */}
      <div
        className="absolute inset-y-0 left-0 w-8 -ml-4 cursor-w-resize z-30 group/handle"
        onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'resizeL'); }}
      >
          <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/10 group-hover/handle:bg-[#7b3fe4] transition-colors rounded-l" />
      </div>

      <div
        className="absolute inset-y-0 right-0 w-8 -mr-4 cursor-e-resize z-30 group/handle"
        onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'resizeR'); }}
      >
          <div className="absolute left-0 top-0 bottom-0 w-2 bg-white/10 group-hover/handle:bg-[#7b3fe4] transition-colors rounded-r" />
      </div>

      {/* Overlay Controls */}
      <div className="absolute top-0 left-3 right-3 text-[10px] text-white/90 z-20 p-1 truncate pointer-events-none drop-shadow-md font-medium">
        {clip.name}
      </div>

      {isSelected && (
          <div className="absolute inset-0 border-2 border-[#7b3fe4] rounded-lg pointer-events-none z-40" />
      )}
    </div>
  );
});
