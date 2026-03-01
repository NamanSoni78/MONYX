'use client';

import { useState } from 'react';
import { X, Check } from 'lucide-react';

interface Props {
  start: number;
  end: number;
  max: number;
  onConfirm: (start: number, end: number) => void;
  onCancel: () => void;
}

export function TrimRangeModal({ start, end, max, onConfirm, onCancel }: Props) {
  const [sTime, setSTime] = useState(formatTime(start));
  const [eTime, setETime] = useState(formatTime(end));

  const handleConfirm = () => {
      const s = parseTime(sTime);
      const e = parseTime(eTime);
      if (isNaN(s) || isNaN(e)) {
          alert('Invalid time format. Use MM:SS.ms');
          return;
      }
      if (s >= e) {
          alert('Start time must be less than End time');
          return;
      }
      if (s < 0 || e > max + 0.1) { // 0.1 tolerance
          alert(`Range out of bounds (Max: ${formatTime(max)})`);
          return;
      }
      onConfirm(s, e);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xs rounded-xl bg-[#1a0f2e] border border-[#2e1d52] p-4 shadow-2xl">
        <h3 className="mb-4 text-sm font-bold text-center text-[#f0e9ff]">Trim Clip Range</h3>

        <div className="space-y-3 mb-4">
            <div>
                <label className="text-[10px] text-[#bca9dd] uppercase font-bold">Start (Offset)</label>
                <input
                    className="w-full bg-[#0d0718] border border-[#3f2a66] rounded p-2 text-sm text-[#7b3fe4] font-mono text-center focus:border-[#7b3fe4] outline-none"
                    value={sTime}
                    onChange={(e) => setSTime(e.target.value)}
                />
            </div>
            <div>
                <label className="text-[10px] text-[#bca9dd] uppercase font-bold">End (Offset)</label>
                <input
                    className="w-full bg-[#0d0718] border border-[#3f2a66] rounded p-2 text-sm text-[#7b3fe4] font-mono text-center focus:border-[#7b3fe4] outline-none"
                    value={eTime}
                    onChange={(e) => setETime(e.target.value)}
                />
            </div>
            <div className="text-[10px] text-center text-[#5f4b86]">
                Max Duration: {formatTime(max)}
            </div>
        </div>

        <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 flex items-center justify-center gap-1 bg-[#2e1d52] hover:bg-[#3f2a66] p-2 rounded text-xs font-bold text-[#bca9dd]">
                <X size={14} /> Cancel
            </button>
            <button onClick={handleConfirm} className="flex-1 flex items-center justify-center gap-1 bg-[#7b3fe4] hover:bg-[#6a35c4] p-2 rounded text-xs font-bold text-white">
                <Check size={14} /> Apply
            </button>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

function parseTime(str: string): number {
    // MM:SS.ms or MM:SS
    const parts = str.split(':');
    if (parts.length !== 2) return NaN;
    const m = parseInt(parts[0], 10);
    const s = parseFloat(parts[1]);
    return m * 60 + s;
}
