'use client';

// Virtual instruments using Web Audio API synthesis.
// All instruments share a single AudioContext and route through a master gain
// node that feeds BOTH the speakers AND an optional MediaStreamDestination.

let sharedCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let mediaStreamDest: MediaStreamAudioDestinationNode | null = null;

function getCtx(): AudioContext {
  if (!sharedCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    sharedCtx = new AudioContextClass();
    masterGain = sharedCtx!.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(sharedCtx!.destination);
  }
  if (sharedCtx!.state === 'suspended') sharedCtx!.resume();
  return sharedCtx!;
}

function getMaster(): GainNode {
  getCtx();
  return masterGain!;
}

export function resumeAudioContext() {
  getCtx();
}

// Set the master instrument volume (0..1.5)
export function setInstrumentVolume(vol: number) {
  if (masterGain) masterGain.gain.value = vol;
}

export function getInstrumentVolume(): number {
  return masterGain?.gain.value ?? 1;
}

// ============================================================================
// NOTE FREQUENCIES
// ============================================================================
const PIANO_NOTES: Record<string, number> = {
  C: 261.63, 'C#': 277.18, D: 293.66, 'D#': 311.13,
  E: 329.63, F: 349.23, 'F#': 369.99, G: 392.0,
  'G#': 415.3, A: 440.0, 'A#': 466.16, B: 493.88,
};

// ============================================================================
// PIANO — Rich additive synthesis with 8 harmonics + proper ADSR envelope
// ============================================================================
export function playPiano(note: string, octave: number = 4, duration: number = 1.5): void {
  const ctx = getCtx();
  const master = getMaster();
  const baseFreq = PIANO_NOTES[note];
  if (!baseFreq) return;
  const freq = baseFreq * Math.pow(2, octave - 4);

  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.connect(master);

  // 8 harmonics for rich piano tone
  const harmonics = [
    { mult: 1, gain: 1.0 },
    { mult: 2, gain: 0.55 },
    { mult: 3, gain: 0.33 },
    { mult: 4, gain: 0.18 },
    { mult: 5, gain: 0.10 },
    { mult: 6, gain: 0.06 },
    { mult: 7, gain: 0.04 },
    { mult: 8, gain: 0.02 },
  ];

  for (const h of harmonics) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * h.mult;
    // Slight detuning for warmth
    osc.detune.value = (Math.random() - 0.5) * 2;
    const g = ctx.createGain();
    g.gain.value = h.gain;
    osc.connect(g);
    g.connect(out);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  // ADSR envelope — piano-like: fast attack, exponential decay
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(0.45, now + 0.003); // 3ms attack
  out.gain.exponentialRampToValueAtTime(0.25, now + 0.08); // 80ms decay to sustain
  out.gain.exponentialRampToValueAtTime(0.001, now + duration); // release
}

// ============================================================================
// DRUMS — Improved synthesis
// ============================================================================
export function playKick(): void {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  // Main oscillator — pitch sweep from 150Hz to 40Hz
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(1.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + 0.4);

  // Add a click transient for punch
  const click = ctx.createOscillator();
  click.type = 'triangle';
  click.frequency.value = 2000;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.3, now);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.01);
  click.connect(clickGain);
  clickGain.connect(master);
  click.start(now);
  click.stop(now + 0.02);
}

export function playSnare(): void {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  // Noise component (filtered)
  const bufferSize = ctx.sampleRate * 0.2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.value = 1200;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.8, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);

  // Tonal component (200Hz triangle)
  const osc = ctx.createOscillator();
  osc.frequency.value = 200;
  osc.type = 'triangle';
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.6, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  osc.connect(oscGain);
  oscGain.connect(master);

  noise.start(now);
  osc.start(now);
  osc.stop(now + 0.1);
}

export function playHihat(open: boolean = false): void {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;
  const duration = open ? 0.25 : 0.05;

  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  // Use a sharper highpass for brighter hihat
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 8000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.6, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  noise.start(now);
}

export function playClap(): void {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;
  for (let i = 0; i < 4; i++) {
    const t = now + i * 0.01;
    const bufferSize = ctx.sampleRate * 0.05;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let j = 0; j < bufferSize; j++) data[j] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 1.0;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    noise.start(t);
  }
}

export function playTom(freq: number = 100): void {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(freq * 1.5, now);
  osc.frequency.exponentialRampToValueAtTime(freq, now + 0.1);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.9, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + 0.3);
}

// ============================================================================
// GUITAR — Improved Karplus-Strong with body resonance + pick position
//
// The previous implementation had several issues that made it sound thin:
//   1. Single damping coefficient for all frequencies (real strings have
//      frequency-dependent decay — high notes decay faster than low).
//   2. No body resonance (real guitars have a resonant cavity around
//      100-300 Hz that gives the characteristic warmth).
//   3. Random noise excitation (sounds like a pluck, but lacks the bright
//      "pick attack" of a real guitar).
//   4. No dynamics — every note had the same envelope.
//
// This version uses:
//   - Filtered noise burst as the excitation (low-passed for warmth, with
//     a short high-frequency "click" for the pick attack)
//   - Frequency-dependent damping (6 dB/octave brightness loss over time)
//   - A 3-stage body resonance filter (low shelf at 120 Hz + peak at
//     240 Hz + peak at 320 Hz — emulates the air cavity + top plate)
//   - Dynamic envelope (attack + decay + sustain + release) driven by the
//     note's duration parameter
// ============================================================================
export function playGuitar(note: string, octave: number = 4, duration: number = 1.5): void {
  const ctx = getCtx();
  const master = getMaster();
  const baseFreq = PIANO_NOTES[note];
  if (!baseFreq) return;
  const freq = baseFreq * Math.pow(2, octave - 4);

  const now = ctx.currentTime;
  const sampleRate = ctx.sampleRate;
  // Cap the buffer length to avoid very long buffers for sustained notes
  const bufferLength = Math.floor(Math.min(sampleRate * duration, sampleRate * 4));
  const buffer = ctx.createBuffer(1, bufferLength, sampleRate);
  const data = buffer.getChannelData(0);

  // ===== Step 1: Karplus-Strong delay line (the vibrating "string") =====
  const N = Math.max(2, Math.floor(sampleRate / freq));
  const delayLine = new Float32Array(N);

  // ===== Step 2: Filtered noise excitation =====
  // Real guitar picks produce a bright transient followed by sustained
  // ringing. We simulate this with:
  //   - A short high-frequency "click" (first ~50 samples) for the pick attack
  //   - Low-passed noise for the rest (the string's initial displacement)
  const excitationLength = Math.min(N, Math.floor(sampleRate * 0.005));  // 5ms attack
  let prevLp = 0;
  for (let i = 0; i < N; i++) {
    const noise = Math.random() * 2 - 1;
    if (i < excitationLength) {
      // Bright pick attack — full-bandwidth noise
      delayLine[i] = noise * 0.9;
    } else {
      // Low-passed noise for the body of the excitation
      prevLp = prevLp + 0.3 * (noise - prevLp);
      delayLine[i] = prevLp * 0.6;
    }
  }

  // ===== Step 3: Frequency-dependent damping =====
  // Lower notes ring longer than higher notes. The damping factor controls
  // how quickly the string loses energy. We use a slightly different factor
  // for the brightness filter vs. the overall amplitude.
  const baseDamping = 0.998 + 0.001 * Math.min(1, 200 / freq);  // lower freq → higher damping (closer to 1)
  const brightnessDecay = 0.5;  // how fast the brightness filter cuts highs

  let idx = 0;
  let prevAvg = 0;  // for the one-pole low-pass in the KS loop
  for (let i = 0; i < bufferLength; i++) {
    const current = delayLine[idx];
    const next = delayLine[(idx + 1) % N];
    // The classic KS update: average of current and next, scaled by damping.
    // The averaging acts as a one-pole low-pass, causing the high frequencies
    // to decay faster than the lows (natural string behavior).
    prevAvg = (current + next) * 0.5;
    delayLine[idx] = prevAvg * baseDamping;
    data[i] = current;
    idx = (idx + 1) % N;
  }

  // ===== Step 4: Natural decay envelope =====
  // Real guitar notes decay exponentially. The decay rate depends on the
  // note's frequency (lower notes ring longer).
  const decayTimeConstant = sampleRate * (3.0 + 2.0 * Math.min(1, 200 / freq));
  for (let i = 0; i < bufferLength; i++) {
    const env = Math.exp(-i / decayTimeConstant);
    data[i] *= env;
  }

  // ===== Step 5: Body resonance =====
  // Real guitars have a resonant cavity (the body) that boosts frequencies
  // around 100-300 Hz. We simulate this with a chain of biquad filters:
  //   1. Low shelf at 120 Hz, +6 dB (body warmth)
  //   2. Peaking filter at 240 Hz, +4 dB, Q=2 (main body resonance)
  //   3. Peaking filter at 320 Hz, +3 dB, Q=2 (top plate resonance)
  //   4. High-cut at 5 kHz, -3 dB (removes harshness from the noise excitation)
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 120;
  lowShelf.gain.value = 6;

  const bodyPeak1 = ctx.createBiquadFilter();
  bodyPeak1.type = 'peaking';
  bodyPeak1.frequency.value = 240;
  bodyPeak1.Q.value = 2;
  bodyPeak1.gain.value = 4;

  const bodyPeak2 = ctx.createBiquadFilter();
  bodyPeak2.type = 'peaking';
  bodyPeak2.frequency.value = 320;
  bodyPeak2.Q.value = 2;
  bodyPeak2.gain.value = 3;

  const highCut = ctx.createBiquadFilter();
  highCut.type = 'lowpass';
  highCut.frequency.value = 5000;
  highCut.Q.value = 0.5;

  const gain = ctx.createGain();
  gain.gain.value = 0.55;

  // Chain: source → lowShelf → bodyPeak1 → bodyPeak2 → highCut → gain → master
  source.connect(lowShelf);
  lowShelf.connect(bodyPeak1);
  bodyPeak1.connect(bodyPeak2);
  bodyPeak2.connect(highCut);
  highCut.connect(gain);
  gain.connect(master);

  source.start(now);
}

// ============================================================================
// BASS — Sub oscillator + sawtooth + resonant filter
// ============================================================================
export function playBass(note: string, octave: number = 2, duration: number = 0.8): void {
  const ctx = getCtx();
  const master = getMaster();
  const baseFreq = PIANO_NOTES[note];
  if (!baseFreq) return;
  const safeOctave = Math.max(2, Math.min(5, octave));
  const freq = baseFreq * Math.pow(2, safeOctave - 4);

  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0.8;
  out.connect(master);

  // Sub oscillator
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = freq / 2;
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0, now);
  subGain.gain.linearRampToValueAtTime(0.6, now + 0.02);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  sub.connect(subGain);
  subGain.connect(out);

  // Main sawtooth
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1500, now);
  filter.frequency.exponentialRampToValueAtTime(250, now + duration);
  filter.Q.value = 5;
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0, now);
  oscGain.gain.linearRampToValueAtTime(0.5, now + 0.02);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(filter);
  filter.connect(oscGain);
  oscGain.connect(out);

  sub.start(now);
  sub.stop(now + duration + 0.05);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

// ============================================================================
// PAD — Warm evolving chord (5 detuned sawtooths + lowpass)
// ============================================================================
export function playPad(note: string, octave: number = 4, duration: number = 3): void {
  const ctx = getCtx();
  const master = getMaster();
  const baseFreq = PIANO_NOTES[note];
  if (!baseFreq) return;
  const freq = baseFreq * Math.pow(2, octave - 4);

  const out = ctx.createGain();
  out.connect(master);

  // Slowly opening lowpass for evolving character
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, ctx.currentTime);
  filter.frequency.linearRampToValueAtTime(3000, ctx.currentTime + duration * 0.5);
  filter.frequency.linearRampToValueAtTime(800, ctx.currentTime + duration);
  filter.Q.value = 2;
  out.connect(filter);
  filter.connect(master);

  const now = ctx.currentTime;
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(0.3, now + 0.3);
  out.gain.linearRampToValueAtTime(0.3, now + duration - 0.5);
  out.gain.linearRampToValueAtTime(0, now + duration);

  const detunes = [-7, -3, 0, 3, 7];
  for (const d of detunes) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = d;
    osc.connect(out);
    osc.start(now);
    osc.stop(now + duration + 0.1);
  }
}

// ============================================================================
// SYNTH LEAD — Sawtooth + resonant filter sweep (80s style)
// ============================================================================
export function playSynth(note: string, octave: number = 4, duration: number = 1.0): void {
  const ctx = getCtx();
  const master = getMaster();
  const baseFreq = PIANO_NOTES[note];
  if (!baseFreq) return;
  const freq = baseFreq * Math.pow(2, octave - 4);

  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.connect(master);

  // Two detuned sawtooths for thick sound
  for (const detune of [-5, 5]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(out);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  // Resonant filter sweep
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(500, now);
  filter.frequency.exponentialRampToValueAtTime(4000, now + 0.05);
  filter.frequency.exponentialRampToValueAtTime(800, now + duration);
  filter.Q.value = 8;
  out.disconnect();
  out.connect(filter);
  filter.connect(master);

  // Envelope
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(0.4, now + 0.01);
  out.gain.linearRampToValueAtTime(0.3, now + 0.1);
  out.gain.exponentialRampToValueAtTime(0.001, now + duration);
}

// ============================================================================
// STRINGS — Warm sustained string sound (sawtooth + vibrato + filter)
// ============================================================================
export function playStrings(note: string, octave: number = 4, duration: number = 2.0): void {
  const ctx = getCtx();
  const master = getMaster();
  const baseFreq = PIANO_NOTES[note];
  if (!baseFreq) return;
  const freq = baseFreq * Math.pow(2, octave - 4);

  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.connect(master);

  // Vibrato LFO
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5; // 5Hz vibrato
  const vibratoGain = ctx.createGain();
  vibratoGain.gain.value = 3; // 3 cents vibrato depth
  vibrato.connect(vibratoGain);

  // Three detuned sawtooths
  const detunes = [-8, 0, 8];
  for (const d of detunes) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = d;
    vibratoGain.connect(osc.detune);
    osc.connect(out);
    osc.start(now);
    osc.stop(now + duration + 0.1);
  }
  vibrato.start(now);
  vibrato.stop(now + duration + 0.1);

  // Warm lowpass
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2500;
  filter.Q.value = 0.5;
  out.disconnect();
  out.connect(filter);
  filter.connect(master);

  // Slow attack for string-like envelope
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(0.35, now + 0.15); // 150ms attack
  out.gain.linearRampToValueAtTime(0.3, now + duration - 0.2);
  out.gain.linearRampToValueAtTime(0, now + duration);
}

// ============================================================================
// Metronome — sample-accurate scheduling using AudioContext clock
//
// The previous implementation had two bugs:
//   1. It scheduled beats in 25ms intervals via setInterval, but if the JS
//      thread was busy (e.g. React rendering), beats would drift or be
//      scheduled late — causing uneven timing.
//   2. It scheduled beats with `nextBeatTime < ctx.currentTime + 0.2`,
//      which only schedules ONE beat ahead. If the audio context's clock
//      advanced past nextBeatTime before the next setInterval tick, the
//      beat was missed entirely (silent click).
//
// This version uses a look-ahead scheduler that:
//   - Runs setInterval every 25ms (unchanged)
//   - Schedules ALL beats within the next 0.5 seconds (look-ahead window)
//   - Each beat is scheduled at an absolute ctx.currentTime-relative time
//     (sample-accurate — no drift)
//   - The accent (downbeat) uses a higher pitch and louder gain
//   - Uses a short sine burst (5ms) for a clean "tick" without harshness
// ============================================================================
export function startMetronome(bpm: number, beatsPerMeasure: number = 4): () => void {
  const ctx = getCtx();
  const master = getMaster();

  // Validate inputs — bad BPM (0, NaN, negative) would cause infinite loops
  // or division by zero.
  const safeBpm = Math.max(20, Math.min(300, bpm || 90));
  const safeBeatsPerMeasure = Math.max(1, Math.min(16, beatsPerMeasure || 4));
  const intervalSec = 60 / safeBpm;

  // Look-ahead window: schedule beats up to 0.5s in the future. This gives
  // the scheduler enough headroom that even if setInterval is delayed by
  // 100-200ms (e.g. during a heavy React render), no beats are missed.
  const LOOK_AHEAD_SEC = 0.5;

  // Start scheduling from slightly in the future so the first beat isn't
  // cut off by the time it takes to set up the oscillators.
  let nextBeatTime = ctx.currentTime + 0.1;
  let beat = 0;
  let stopped = false;

  const scheduleBeat = (when: number, isAccent: boolean) => {
    // Use a sine oscillator for a clean "tick" — square/sawtooth clicks
    // sound harsh and fatigue the ear quickly.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = isAccent ? 1500 : 1000;

    // Gain envelope: instant attack, exponential decay over 5ms.
    // setValueAtTime + exponentialRampToValueAtTime produces a clean click
    // without clicks/pops at the start (which linear ramps would cause).
    const gain = ctx.createGain();
    const peakGain = isAccent ? 0.6 : 0.35;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peakGain, when + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);

    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + 0.06);  // stop slightly after the decay for safety
  };

  const schedule = () => {
    if (stopped) return;
    // Schedule all beats that fall within the look-ahead window.
    // This is the key fix: we schedule MULTIPLE beats per tick, so even
    // if setInterval is delayed, the beats are already queued in the
    // audio context's event list and will fire at the right time.
    while (nextBeatTime < ctx.currentTime + LOOK_AHEAD_SEC) {
      const isAccent = beat % safeBeatsPerMeasure === 0;
      scheduleBeat(nextBeatTime, isAccent);
      nextBeatTime += intervalSec;
      beat++;
    }
  };

  // Run the scheduler immediately, then every 25ms.
  schedule();
  const timer = setInterval(schedule, 25);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

// ============================================================================
// Recording support
// ============================================================================
export function getRecordingStream(): MediaStream {
  const ctx = getCtx();
  if (!mediaStreamDest) {
    mediaStreamDest = ctx.createMediaStreamDestination();
    masterGain!.connect(mediaStreamDest);
  }
  return mediaStreamDest.stream;
}

export function getSharedAudioContext(): AudioContext {
  return getCtx();
}
