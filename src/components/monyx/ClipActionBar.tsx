'use client';

import { useEditorStore } from '@/lib/monyx/store';
import { Scissors, Copy, Trash2, ArrowLeftRight, ChevronLeft, ChevronRight, Crop } from 'lucide-react';
import { useState } from 'react';
import { TrimRangeModal } from './TrimRangeModal';

interface Props {
  clipId: string | null;
  trackId: string | null;
  playhead: number;
}

export function ClipActionBar({ clipId, trackId, playhead }: Props) {
  const [showTrimModal, setShowTrimModal] = useState(false);
  const {
    project,
    splitClip,
    duplicateClip,
    deleteClip,
    reverseClip,
    trimClip,
    setClipRegion
  } = useEditorStore();

  if (!clipId || !trackId || !project) return null;

  const track = project.tracks.find(t => t.id === trackId);
  const clip = track?.clips.find(c => c.id === clipId);
  const buffer = project.buffers.find(b => b.id === clip?.bufferId);

  if (!clip) return null;

  const onSplit = () => splitClip(trackId, clipId, playhead);
  const onTrimStart = () => {
      if (playhead > clip.start && playhead < clip.start + clip.duration) {
          trimClip(trackId, clipId, playhead, clip.start + clip.duration);
      }
  };
  const onTrimEnd = () => {
      if (playhead > clip.start && playhead < clip.start + clip.duration) {
          trimClip(trackId, clipId, clip.start, playhead);
      }
  };

  const onManualTrim = (s: number, e: number) => {
      setClipRegion(trackId, clipId, s, e);
      setShowTrimModal(false);
  };

  return (
    <>
        <div className="fixed bottom-[70px] left-0 right-0 bg-[#1a0f2e] border-t border-[#2e1d52] p-2 flex gap-4 overflow-x-auto z-50 justify-center shadow-2xl pb-safe">
            <div className="flex gap-2">
                <ActionButton icon={<Scissors size={16} />} label="Split" onClick={onSplit} />
                <div className="w-px bg-[#2e1d52] mx-1" />
                <ActionButton icon={<ChevronLeft size={16} />} label="Trim Start" onClick={onTrimStart} />
                <ActionButton icon={<Crop size={16} />} label="Trim" onClick={() => setShowTrimModal(true)} />
                <ActionButton icon={<ChevronRight size={16} />} label="Trim End" onClick={onTrimEnd} />
                <div className="w-px bg-[#2e1d52] mx-1" />
                <ActionButton icon={<Copy size={16} />} label="Duplicate" onClick={() => duplicateClip(trackId, clipId)} />
                <ActionButton icon={<ArrowLeftRight size={16} />} label="Reverse" onClick={() => reverseClip(trackId, clipId)} active={clip.reverse} />
                <div className="w-px bg-[#2e1d52] mx-1" />
                <ActionButton icon={<Trash2 size={16} />} label="Delete" onClick={() => deleteClip(trackId, clipId)} danger />
            </div>
        </div>

        {showTrimModal && (
            <TrimRangeModal
                start={clip.offset}
                end={clip.offset + clip.duration}
                max={buffer?.duration || 9999}
                onConfirm={onManualTrim}
                onCancel={() => setShowTrimModal(false)}
            />
        )}
    </>
  );
}

function ActionButton({ icon, label, onClick, active, danger }: any) {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center justify-center min-w-[50px] p-1 rounded transition-colors
                ${danger ? 'text-red-400 hover:bg-red-900/30' : active ? 'text-[#7b3fe4] bg-[#251642]' : 'text-[#bca9dd] hover:text-white hover:bg-[#2e1d52]'}
            `}
        >
            {icon}
            <span className="text-[9px] mt-1 font-medium">{label}</span>
        </button>
    )
}
