'use client';

import { EffectConfig, ProjectData, ProjectAudioBuffer } from '@/lib/monyx/types';

interface AudioEffect {
  input: AudioNode;
  output: AudioNode;
  setParams(params: Record<string, number>): void;
}

export class AudioEngine {
  private ctx: AudioContext;
  private masterGain: GainNode;
  private sourceNodes: AudioBufferSourceNode[] = [];
  private activeEffects: Map<string, Map<string, AudioEffect>> = new Map();
  private trackGains: Map<string, GainNode> = new Map();
  private trackPanners: Map<string, StereoPannerNode> = new Map();

  public isPlaying: boolean = false;
  private startTime: number = 0;
  private pauseTime: number = 0;
  private startOffset: number = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
      } catch (e) {
        console.error('Failed to initialize AudioContext:', e);
        this.ctx = null as any;
        this.masterGain = null as any;
      }
    } else {
      this.ctx = null as any;
      this.masterGain = null as any;
    }
  }

  get context() {
    return this.ctx;
  }

  async resume() {
    if (this.ctx && this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch (e) {
        console.warn('Failed to resume AudioContext:', e);
      }
    }
  }

  async decodeBlob(blob: Blob) {
    if (!this.ctx) throw new Error('AudioContext not initialized');
    const arr = await blob.arrayBuffer();
    return this.ctx.decodeAudioData(arr.slice(0));
  }

  async decode(buffer: ProjectAudioBuffer) {
    return this.decodeBlob(buffer.blob);
  }

  stop() {
    this.sourceNodes.forEach((n) => {
      try { n.stop(); } catch (e) { /* ignore */ }
      try { n.disconnect(); } catch (e) { /* ignore */ }
    });
    this.sourceNodes = [];
    this.activeEffects.clear();
    this.trackGains.clear();
    this.trackPanners.clear();

    if (this.isPlaying && this.ctx) {
      this.pauseTime = this.ctx.currentTime;
      this.isPlaying = false;
    }
  }

  getCurrentTime(): number {
    if (!this.isPlaying || !this.ctx) return this.startOffset;
    return this.startOffset + (this.ctx.currentTime - this.startTime);
  }

  async restart(project: ProjectData) {
    if (!this.isPlaying) return;
    const time = this.getCurrentTime();
    await this.play(project, time);
  }

  async play(project: ProjectData, fromTime: number) {
    if (!this.ctx) return;
    await this.resume();
    this.stop();

    this.isPlaying = true;
    this.startOffset = fromTime;
    this.startTime = this.ctx.currentTime;

    await this.renderProjectToContext(this.ctx, project, this.masterGain, fromTime, true);
  }

  public async renderProjectToContext(
    ctx: BaseAudioContext,
    project: ProjectData,
    destination: AudioNode,
    fromTime: number = 0,
    isRealtime: boolean = false
  ) {
    const soloed = project.tracks.some((t) => t.solo);

    for (const track of project.tracks) {
      if (track.mute || (soloed && !track.solo)) continue;

      const trackGain = ctx.createGain();
      trackGain.gain.value = track.volume;
      if (isRealtime) this.trackGains.set(track.id, trackGain);

      const trackPanner = ctx.createStereoPanner();
      trackPanner.pan.value = track.pan;
      if (isRealtime) this.trackPanners.set(track.id, trackPanner);

      trackGain.connect(trackPanner);
      trackPanner.connect(destination);

      let chainInput: AudioNode = trackGain;

      const effects = this.createEffectsForContext(ctx, track.id, track.effects, isRealtime);

      if (effects.length > 0) {
        chainInput = effects[0].input;
        for (let i = 0; i < effects.length - 1; i++) {
          effects[i].output.connect(effects[i + 1].input);
        }
        effects[effects.length - 1].output.connect(trackGain);
      }

      for (const clip of track.clips) {
        const bufferInfo = project.buffers.find((b) => b.id === clip.bufferId);
        if (!bufferInfo) continue;

        try {
          let audioBuffer: AudioBuffer;
          if (isRealtime) {
            audioBuffer = await this.decode(bufferInfo);
          } else {
            const arr = await bufferInfo.blob.arrayBuffer();
            audioBuffer = await ctx.decodeAudioData(arr.slice(0));
          }

          const source = ctx.createBufferSource();
          source.buffer = clip.reverse ? reverseBuffer(ctx as AudioContext, audioBuffer) : audioBuffer;

          const startDelay = Math.max(0, clip.start - fromTime);
          const when = ctx.currentTime + startDelay;
          const offset = clip.offset + Math.max(0, fromTime - clip.start);

          if (offset < audioBuffer.duration) {
            const duration = clip.duration - (offset - clip.offset);
            if (duration > 0) {
              source.connect(chainInput);
              source.start(when, offset, duration);
              if (isRealtime) this.sourceNodes.push(source);
            }
          }
        } catch (e) {
          console.error(`Failed to play/render clip ${clip.name}`, e);
        }
      }
    }
  }

  public setEffectParam(trackId: string, effectId: string, params: Record<string, number>) {
    const trackFx = this.activeEffects.get(trackId);
    const fx = trackFx?.get(effectId);
    if (fx) {
      fx.setParams(params);
    }
  }

  public setTrackVolume(trackId: string, volume: number) {
    const gain = this.trackGains.get(trackId);
    if (gain) {
      gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
    }
  }

  public setTrackPan(trackId: string, pan: number) {
    const panner = this.trackPanners.get(trackId);
    if (panner) {
      panner.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.05);
    }
  }

  private createEffectsForContext(ctx: BaseAudioContext, trackId: string, configs: EffectConfig[], isRealtime: boolean): AudioEffect[] {
    const effects: AudioEffect[] = [];
    const trackEffects = new Map<string, AudioEffect>();

    for (const config of configs.filter((e) => e.enabled)) {
      const fx = this.createEffectForContext(ctx, config);
      if (fx) {
        effects.push(fx);
        if (isRealtime) trackEffects.set(config.id, fx);
      }
    }

    if (isRealtime && trackEffects.size > 0) {
      this.activeEffects.set(trackId, trackEffects);
    }
    return effects;
  }

  private createEffectForContext(ctx: BaseAudioContext, config: EffectConfig): AudioEffect | null {
    return this.createDryWetEffect(ctx, config, (c, input, output, params) => {
      switch (config.type) {
        case 'reverb':
        case 'cathedral': {
          const convolver = ctx.createConvolver();
          const decay = config.type === 'cathedral' ? 4.5 : 2.0;
          convolver.buffer = createImpulse(ctx as AudioContext, decay, decay);
          input.connect(convolver);
          convolver.connect(output);
          return () => {};
        }
        case 'echo':
        case 'delay': {
          const delay = ctx.createDelay(5.0);
          const feedback = ctx.createGain();

          delay.delayTime.value = params.time ?? 0.3;
          feedback.gain.value = params.feedback ?? 0.4;

          input.connect(delay);
          delay.connect(feedback);
          feedback.connect(delay);
          delay.connect(output);

          return (p) => {
            if (p.time !== undefined) delay.delayTime.setTargetAtTime(p.time, ctx.currentTime, 0.1);
            if (p.feedback !== undefined) feedback.gain.setTargetAtTime(p.feedback, ctx.currentTime, 0.1);
          };
        }
        case 'surroundEcho': {
          const merger = ctx.createChannelMerger(2);
          const delayL = ctx.createDelay(5.0);
          const delayR = ctx.createDelay(5.0);
          const fbL = ctx.createGain();
          const fbR = ctx.createGain();

          delayL.delayTime.value = params.time ?? 0.4;
          delayR.delayTime.value = (params.time ?? 0.4) * 1.5;
          fbL.gain.value = params.feedback ?? 0.4;
          fbR.gain.value = params.feedback ?? 0.4;

          input.connect(delayL);
          input.connect(delayR);

          delayL.connect(merger, 0, 0);
          delayR.connect(merger, 0, 1);

          delayL.connect(fbR);
          fbR.connect(delayR);

          delayR.connect(fbL);
          fbL.connect(delayL);

          merger.connect(output);

          return (p) => {
            if (p.time !== undefined) {
              delayL.delayTime.setTargetAtTime(p.time, ctx.currentTime, 0.1);
              delayR.delayTime.setTargetAtTime(p.time * 1.5, ctx.currentTime, 0.1);
            }
            if (p.feedback !== undefined) {
              fbL.gain.setTargetAtTime(p.feedback, ctx.currentTime, 0.1);
              fbR.gain.setTargetAtTime(p.feedback, ctx.currentTime, 0.1);
            }
          };
        }
        case 'lowpass':
        case 'highpass': {
          const filter = ctx.createBiquadFilter();
          filter.type = config.type;
          filter.frequency.value = params.freq ?? 1200;
          input.connect(filter);
          filter.connect(output);
          return (p) => {
            if (p.freq !== undefined) filter.frequency.setTargetAtTime(p.freq, ctx.currentTime, 0.1);
          };
        }
        case 'chorus':
        case 'flanger':
        case 'phaser': {
          const delay = ctx.createDelay(0.1);
          const feedback = ctx.createGain();
          const lfo = ctx.createOscillator();
          const lfoGain = ctx.createGain();

          const isFlanger = config.type === 'flanger';
          const isPhaser = config.type === 'phaser';

          const baseDelay = isFlanger ? 0.005 : 0.03;

          if (isPhaser) {
            const stages: BiquadFilterNode[] = [];
            for (let i = 0; i < 6; i++) {
              const apf = ctx.createBiquadFilter();
              apf.type = 'allpass';
              apf.frequency.value = 1000;
              stages.push(apf);
            }

            input.connect(stages[0]);
            for (let i = 0; i < 5; i++) stages[i].connect(stages[i + 1]);
            stages[5].connect(output);

            lfo.type = 'sine';
            lfo.frequency.value = params.rate ?? 0.5;
            lfoGain.gain.value = params.depth ?? 400;

            lfo.connect(lfoGain);
            stages.forEach((s) => lfoGain.connect(s.frequency));

            const fb = ctx.createGain();
            fb.gain.value = params.feedback ?? 0.5;
            stages[5].connect(fb);
            fb.connect(stages[0]);

            lfo.start();

            return (p) => {
              if (p.rate !== undefined) lfo.frequency.setTargetAtTime(p.rate, ctx.currentTime, 0.1);
              if (p.depth !== undefined) lfoGain.gain.setTargetAtTime(p.depth, ctx.currentTime, 0.1);
              if (p.feedback !== undefined) fb.gain.setTargetAtTime(p.feedback, ctx.currentTime, 0.1);
            };
          } else {
            delay.delayTime.value = baseDelay;
            feedback.gain.value = isFlanger ? (params.feedback ?? 0.5) : (params.feedback ?? 0.2);

            lfo.type = 'sine';
            lfo.frequency.value = params.rate ?? (isFlanger ? 0.25 : 1.5);
            lfoGain.gain.value = params.depth ?? 0.002;

            input.connect(delay);
            delay.connect(output);
            delay.connect(feedback);
            feedback.connect(delay);

            lfo.connect(lfoGain);
            lfoGain.connect(delay.delayTime);
            lfo.start();

            return (p) => {
              if (p.rate !== undefined) lfo.frequency.setTargetAtTime(p.rate, ctx.currentTime, 0.1);
              if (p.depth !== undefined) lfoGain.gain.setTargetAtTime(p.depth, ctx.currentTime, 0.1);
              if (p.feedback !== undefined) feedback.gain.setTargetAtTime(p.feedback, ctx.currentTime, 0.1);
            };
          }
        }
        case 'compressor':
        case 'limiter': {
          const comp = ctx.createDynamicsCompressor();
          const isLimiter = config.type === 'limiter';

          comp.threshold.value = isLimiter ? -2.0 : (params.threshold ?? -24);
          comp.knee.value = isLimiter ? 0.0 : (params.knee ?? 30);
          comp.ratio.value = isLimiter ? 20.0 : (params.ratio ?? 4);
          comp.attack.value = isLimiter ? 0.001 : (params.attack ?? 0.003);
          comp.release.value = isLimiter ? 0.1 : (params.release ?? 0.25);

          input.connect(comp);
          comp.connect(output);

          return (p) => {
            if (!isLimiter) {
              if (p.threshold !== undefined) comp.threshold.setTargetAtTime(p.threshold, ctx.currentTime, 0.1);
              if (p.ratio !== undefined) comp.ratio.setTargetAtTime(p.ratio, ctx.currentTime, 0.1);
            }
          };
        }
        case 'eq3': {
          const low = ctx.createBiquadFilter();
          const mid = ctx.createBiquadFilter();
          const high = ctx.createBiquadFilter();

          low.type = 'lowshelf';
          low.frequency.value = 320;
          low.gain.value = params.low ?? 0;

          mid.type = 'peaking';
          mid.frequency.value = 1000;
          mid.Q.value = 1.0;
          mid.gain.value = params.mid ?? 0;

          high.type = 'highshelf';
          high.frequency.value = 3200;
          high.gain.value = params.high ?? 0;

          input.connect(low);
          low.connect(mid);
          mid.connect(high);
          high.connect(output);

          return (p) => {
            if (p.low !== undefined) low.gain.setTargetAtTime(p.low, ctx.currentTime, 0.1);
            if (p.mid !== undefined) mid.gain.setTargetAtTime(p.mid, ctx.currentTime, 0.1);
            if (p.high !== undefined) high.gain.setTargetAtTime(p.high, ctx.currentTime, 0.1);
          };
        }
        case 'distortion':
        case 'saturation':
        case 'bitcrusher': {
          const shaper = ctx.createWaveShaper();
          const amount = params.amount ?? 50;
          shaper.curve = makeDistortionCurve(amount, config.type);
          shaper.oversample = '4x';

          input.connect(shaper);
          shaper.connect(output);

          return (p) => {
            if (p.amount !== undefined) shaper.curve = makeDistortionCurve(p.amount, config.type);
          };
        }
        case 'stereoWidener': {
          const delay = ctx.createDelay();
          delay.delayTime.value = (params.width ?? 0) * 0.02;

          const splitter = ctx.createChannelSplitter(2);
          const merger = ctx.createChannelMerger(2);

          input.connect(splitter);

          splitter.connect(merger, 0, 0);

          splitter.connect(delay, 1);
          delay.connect(merger, 0, 1);

          merger.connect(output);

          return (p) => {
            if (p.width !== undefined) delay.delayTime.setTargetAtTime(p.width * 0.02, ctx.currentTime, 0.1);
          };
        }
        default:
          input.connect(output);
          return () => {};
      }
    });
  }

  private createDryWetEffect(
    ctx: BaseAudioContext,
    config: EffectConfig,
    createFn: (
      c: BaseAudioContext,
      input: AudioNode,
      output: AudioNode,
      params: Record<string, number>
    ) => ((params: Record<string, number>) => void) | void
  ): AudioEffect {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const wetGain = ctx.createGain();
    const dryGain = ctx.createGain();
    const effectInput = ctx.createGain();
    const effectOutput = ctx.createGain();

    input.connect(dryGain);
    input.connect(effectInput);

    const updateFn = createFn(ctx, effectInput, effectOutput, config.params);

    effectOutput.connect(wetGain);
    wetGain.connect(output);
    dryGain.connect(output);

    const setMix = (wet: number) => {
      wetGain.gain.value = wet;
      dryGain.gain.value = 1 - wet;
    };

    setMix(config.wet);

    return {
      input,
      output,
      setParams: (params) => {
        if (updateFn) updateFn(params);
      },
    };
  }
}

function createImpulse(ctx: AudioContext, duration: number, decay: number) {
  const length = ctx.sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function makeDistortionCurve(amount: number, type: string) {
  const k = typeof amount === 'number' ? amount : 50;
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;

  if (type === 'bitcrusher') {
    const steps = Math.max(1, 16 - (k / 10));
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = Math.round(x * steps) / steps;
    }
  } else if (type === 'saturation') {
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
  } else {
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
  }
  return curve;
}

function reverseBuffer(ctx: AudioContext, buffer: AudioBuffer) {
  const reversed = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    const source = buffer.getChannelData(i);
    const target = reversed.getChannelData(i);
    for (let j = 0; j < source.length; j++) {
      target[j] = source[source.length - 1 - j];
    }
  }
  return reversed;
}

export async function exportProjectWav(project: ProjectData): Promise<Blob> {
  const duration = Math.max(
    ...project.tracks.flatMap((t) => t.clips.map((c) => c.start + c.duration)),
    4,
  );
  const ctx = new OfflineAudioContext(2, Math.ceil(project.sampleRate * duration), project.sampleRate);

  const engine = new AudioEngine();
  await (engine as any).renderProjectToContext(ctx, project, ctx.destination, 0, false);

  const rendered = await ctx.startRendering();
  return audioBufferToWavBlob(rendered);
}

export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const view = new DataView(new ArrayBuffer(length));
  let offset = 0;
  const writeString = (str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset++, str.charCodeAt(i));
  };
  writeString('RIFF');
  view.setUint32(offset, 36 + buffer.length * numOfChan * 2, true);
  offset += 4;
  writeString('WAVEfmt ');
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, numOfChan, true);
  offset += 2;
  view.setUint32(offset, buffer.sampleRate, true);
  offset += 4;
  view.setUint32(offset, buffer.sampleRate * numOfChan * 2, true);
  offset += 4;
  view.setUint16(offset, numOfChan * 2, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeString('data');
  view.setUint32(offset, buffer.length * numOfChan * 2, true);
  offset += 4;

  const channels = [...Array(numOfChan)].map((_, i) => buffer.getChannelData(i));
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numOfChan; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}
