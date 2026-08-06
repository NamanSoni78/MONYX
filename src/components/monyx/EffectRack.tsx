'use client';

import { EffectType, Track, EffectConfig } from '@/lib/monyx/types';
import { X } from 'lucide-react';

const effectCatalog: EffectType[] = [
  'reverb',
  'cathedral',
  'echo',
  'surroundEcho',
  'delay',
  'chorus',
  'flanger',
  'phaser',
  'compressor',
  'limiter',
  'eq3',
  'lowpass',
  'highpass',
  'distortion',
  'saturation',
  'bitcrusher',
  'stereoWidener',
];

interface Props {
  track: Track;
  onAdd: (type: EffectType) => void;
  onUpdate: (trackId: string, effectId: string, params: Record<string, number>, wet?: number) => void;
  onRemove: (effectId: string) => void;
}

export function EffectRack({ track, onAdd, onUpdate, onRemove }: Props) {
  return (
    <div className="rounded-xl bg-[#1a0f2e] p-3">
      <div className="mb-2 text-sm text-[#efe9ff] font-bold">FX Rack — {track.name}</div>
      <div
        className="mb-3 flex gap-2 overflow-x-auto pb-2 border-b border-[#2e1d52] scrollbar-none"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {effectCatalog.map((effect) => (
          <button
            key={effect}
            className="rounded bg-[#2e1d52] hover:bg-[#7b3fe4] px-3 py-1 text-xs text-[#d8cbf6] whitespace-nowrap transition-colors"
            onClick={() => onAdd(effect)}
          >
            + {effect}
          </button>
        ))}
      </div>
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {track.effects.map((effect) => (
          <EffectUnit
            key={effect.id}
            effect={effect}
            onChange={(params, wet) => onUpdate(track.id, effect.id, params, wet)}
            onRemove={() => onRemove(effect.id)}
          />
        ))}
        {track.effects.length === 0 && (
          <div className="text-xs text-[#5f4b86] text-center p-4">No effects added</div>
        )}
      </div>
    </div>
  );
}

function EffectUnit({ effect, onChange, onRemove }: { effect: EffectConfig; onChange: (params: Record<string, number>, wet?: number) => void; onRemove: () => void; }) {
  const updateParam = (key: string, value: number) => {
    onChange({ [key]: value });
  };

  return (
    <div className="rounded border border-[#3f2a66] bg-[#0d0718] p-2 text-xs text-[#cbb6f5]">
      <div className="flex justify-between items-center mb-2">
        <span className="font-bold text-[#7b3fe4] uppercase">{effect.type}</span>
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
                <label>Mix</label>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={effect.wet}
                    onChange={(e) => onChange({}, Number(e.target.value))}
                    className="w-16 h-1 bg-[#2e1d52] rounded-lg appearance-none cursor-pointer accent-[#7b3fe4]"
                />
            </div>
            <button onClick={onRemove} className="p-1 hover:bg-red-500/20 rounded text-red-400">
                <X size={14} />
            </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {renderControls(effect, updateParam)}
      </div>
    </div>
  );
}

function renderControls(effect: EffectConfig, update: (k: string, v: number) => void) {
  const Slider = ({ label, param, min, max, step = 0.01, def }: { label: string, param: string, min: number, max: number, step?: number, def: number }) => (
    <div className="flex flex-col">
      <div className="flex justify-between">
        <label>{label}</label>
        <span>{(effect.params[param] ?? def).toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={effect.params[param] ?? def}
        onChange={(e) => update(param, Number(e.target.value))}
        className="w-full h-1 bg-[#2e1d52] rounded-lg appearance-none cursor-pointer accent-[#7b3fe4]"
      />
    </div>
  );

  switch (effect.type) {
    case 'delay':
    case 'echo':
    case 'surroundEcho':
      return (
        <>
          <Slider label="Time" param="time" min={0.01} max={1.0} def={0.3} />
          <Slider label="Feedback" param="feedback" min={0} max={0.95} def={0.4} />
        </>
      );
    case 'lowpass':
    case 'highpass':
      return <Slider label="Freq" param="freq" min={20} max={20000} step={1} def={1200} />;
    case 'chorus':
    case 'flanger':
    case 'phaser':
      return (
        <>
          <Slider label="Rate" param="rate" min={0.1} max={10} def={0.5} />
          <Slider label="Depth" param="depth" min={0} max={1000} def={100} />
          <Slider label="Feedback" param="feedback" min={0} max={0.9} def={0.3} />
        </>
      );
    case 'compressor':
      return (
        <>
          <Slider label="Thresh" param="threshold" min={-60} max={0} step={1} def={-24} />
          <Slider label="Ratio" param="ratio" min={1} max={20} step={0.1} def={4} />
          <Slider label="Attack" param="attack" min={0} max={1} def={0.003} />
          <Slider label="Release" param="release" min={0} max={1} def={0.25} />
        </>
      );
    case 'eq3':
      return (
        <>
          <Slider label="Low" param="low" min={-24} max={24} def={0} />
          <Slider label="Mid" param="mid" min={-24} max={24} def={0} />
          <Slider label="High" param="high" min={-24} max={24} def={0} />
        </>
      );
    case 'distortion':
    case 'saturation':
    case 'bitcrusher':
      return <Slider label="Amount" param="amount" min={0} max={100} step={1} def={50} />;
    case 'stereoWidener':
      return <Slider label="Width" param="width" min={0} max={100} step={1} def={0} />;
    default:
      return null;
  }
}
