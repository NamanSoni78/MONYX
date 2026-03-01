'use client';

import { Track } from '@/lib/types';
import { Plus, Trash2 } from 'lucide-react';
import React from 'react';

interface Props {
  track: Track;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onVolume: (value: number) => void;
  onPan: (value: number) => void;
  onDelete: () => void;
  onImport: () => void;
}

export const TrackHeader = React.memo(function TrackHeader({
  track,
  onToggleMute,
  onToggleSolo,
  onVolume,
  onPan,
  onDelete,
  onImport,
}: Props) {
  return (
    <div className="flex flex-col h-32 p-2 bg-[#1a0f2e] border-r border-b border-[#2e1d52] select-none touch-manipulation relative shadow-md z-10">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1 w-full overflow-hidden">
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold truncate flex-1" style={{ backgroundColor: track.color }}>
            {track.name}
            </span>
            <div className="flex gap-0.5 shrink-0">
                <button
                    onClick={onToggleMute}
                    className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold transition-colors ${track.mute ? 'bg-red-500 text-white' : 'bg-[#2e1d52] hover:bg-[#3f2a66] text-gray-400'}`}
                >
                M
                </button>
                <button
                    onClick={onToggleSolo}
                    className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold transition-colors ${track.solo ? 'bg-yellow-500 text-black' : 'bg-[#2e1d52] hover:bg-[#3f2a66] text-gray-400'}`}
                >
                S
                </button>
            </div>
        </div>
      </div>

      {/* Volume/Pan Sliders - Compact */}
      <div className="flex-1 flex flex-col justify-center gap-1 text-[9px] text-[#bca9dd]">
        <div className="flex items-center gap-1">
            <span className="w-6">Vol</span>
            <input
                type="range"
                min={0}
                max={1.5}
                step={0.01}
                value={track.volume}
                onChange={(e) => onVolume(Number(e.target.value))}
                className="flex-1 h-1 bg-[#3a2860] rounded-lg appearance-none cursor-pointer accent-[#7b3fe4]"
            />
        </div>
        <div className="flex items-center gap-1">
            <span className="w-6">Pan</span>
            <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={track.pan}
                onChange={(e) => onPan(Number(e.target.value))}
                className="flex-1 h-1 bg-[#3a2860] rounded-lg appearance-none cursor-pointer accent-[#7b3fe4]"
            />
        </div>
      </div>

      <div className="mt-2 flex gap-2 justify-between items-center border-t border-[#2e1d52] pt-1">
         <button
             onClick={onImport}
             className="flex items-center gap-1 bg-[#2e1d52] hover:bg-[#3f2a66] px-2 py-1 rounded text-[#bca9dd] text-[9px]"
             title="Import Audio to Track"
         >
             <Plus size={10} /> Add Clip
         </button>
         <button
             onClick={onDelete}
             className="p-1 hover:bg-red-900/50 rounded text-red-400"
             title="Delete Track"
         >
             <Trash2 size={12} />
         </button>
      </div>
    </div>
  );
});
