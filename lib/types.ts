export type EffectType =
  | 'reverb'
  | 'cathedral'
  | 'echo'
  | 'surroundEcho'
  | 'delay'
  | 'chorus'
  | 'flanger'
  | 'phaser'
  | 'compressor'
  | 'limiter'
  | 'eq3'
  | 'lowpass'
  | 'highpass'
  | 'distortion'
  | 'saturation'
  | 'bitcrusher'
  | 'stereoWidener';

export interface EffectConfig {
  id: string;
  type: EffectType;
  enabled: boolean;
  wet: number;
  params: Record<string, number>;
}

export interface Clip {
  id: string;
  name: string;
  bufferId: string;
  start: number;
  offset: number;
  duration: number;
  fadeIn: number;
  fadeOut: number;
  gain: number;
  reverse?: boolean;
}

export interface AutomationPoint {
  time: number;
  value: number;
}

export interface Track {
  id: string;
  name: string;
  color: string;
  mute: boolean;
  solo: boolean;
  locked: boolean;
  volume: number;
  pan: number;
  order: number;
  clips: Clip[];
  effects: EffectConfig[];
  automation: {
    volume: AutomationPoint[];
    pan: AutomationPoint[];
  };
}

export interface ProjectAudioBuffer {
  id: string;
  name: string;
  sampleRate: number;
  channels: number;
  duration: number;
  blob: Blob;
}

export interface Marker {
  id: string;
  time: number;
  name: string;
}

export interface ProjectBase {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sampleRate: number;
  bpm: number;
  tracks: Track[];
  markers: Marker[];
  loopRegion: {
    enabled: boolean;
    start: number;
    end: number;
  };
  timeline: {
    zoom: number;
    snap: number;
    playhead: number;
  };
}

export interface ProjectMetadata extends ProjectBase {}

export interface ProjectData extends ProjectBase {
  buffers: ProjectAudioBuffer[];
}
