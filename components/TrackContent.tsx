'use client';

import { Track, ProjectAudioBuffer } from '@/lib/types';
import { DraggableClip } from './DraggableClip';

import React from 'react';

interface Props {
  track: Track;
  buffers: ProjectAudioBuffer[];
  zoom: number;
  width: number;
  selectedClipId: string | null;
  onSelectClip: (clipId: string | null) => void;
  onMove: (clipId: string, start: number) => void;
  onResize: (clipId: string, start: number, end: number) => void;
}

export const TrackContent = React.memo(function TrackContent({
  track,
  buffers,
  zoom,
  width,
  selectedClipId,
  onSelectClip,
  onMove,
  onResize,
}: Props) {
  return (
    <div className="h-32 bg-[#130b22] border-b border-[#2e1d52] relative overflow-hidden">
        <div style={{ width: `${width}px`, height: '100%', position: 'relative' }}>
          {track.clips.map((clip) => (
              <DraggableClip
                  key={clip.id}
                  clip={clip}
                  buffer={buffers.find((b) => b.id === clip.bufferId)}
                  zoom={zoom}
                  trackColor={track.color}
                  isSelected={selectedClipId === clip.id}
                  onSelect={() => onSelectClip(clip.id)}
                  onCommitMove={onMove}
                  onCommitResize={onResize}
              />
          ))}
        </div>
    </div>
  );
});
