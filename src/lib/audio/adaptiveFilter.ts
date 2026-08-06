'use client';

// Adaptive LMS (Least Mean Squares) filter for cancelling a known reference signal
// from a recording. Used during karaoke recording: the user sings along with the
// instrumental/BGM playing through speakers; the mic picks up the voice PLUS the
// bleed of the BGM. We have the original BGM as reference, so we can adaptively
// estimate the speaker→mic transfer function and subtract the bleed.

export interface AdaptiveFilterOptions {
  filterLength: number; // taps
  stepSize: number; // mu (learning rate)
  leakage: number; // gamma for leaky LMS
}

export const DEFAULT_OPTIONS: AdaptiveFilterOptions = {
  filterLength: 256,
  stepSize: 0.005,
  leakage: 0.9999,
};

// Yield to the event loop so the UI can update
function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Process a recording with a known reference signal.
// recording: mic signal (voice + bleed)
// reference: the signal that was playing through the speaker (e.g., instrumental)
// Returns: cleaned voice signal (recording - estimated bleed)
// ASYNC version — yields to UI every ~50ms to keep the page responsive.
export async function cancelReferenceSignal(
  recording: Float32Array,
  reference: Float32Array,
  options: AdaptiveFilterOptions = DEFAULT_OPTIONS,
  onProgress?: (p: number) => void
): Promise<Float32Array> {
  const N = options.filterLength;
  const mu = options.stepSize;
  const gamma = options.leakage;
  const length = Math.min(recording.length, reference.length);

  // Filter coefficients — initialize with a single impulse at center tap
  const weights = new Float32Array(N);
  weights[Math.floor(N / 2)] = 1;

  // Circular buffer for reference samples (avoids expensive shifting)
  const refBuffer = new Float32Array(N);
  let refIdx = 0;

  const output = new Float32Array(length);

  // Yield every ~4096 samples (~93ms at 44.1kHz) so UI can update
  const YIELD_INTERVAL = 4096;
  let lastYieldTime = 0;
  let lastYieldIdx = 0;

  for (let i = 0; i < length; i++) {
    // Add new sample to circular buffer
    refBuffer[refIdx] = reference[i] ?? 0;

    // Compute filter output using circular indexing
    let y = 0;
    for (let j = 0; j < N; j++) {
      const sampleIdx = (refIdx - j + N) % N;
      y += weights[j] * refBuffer[sampleIdx];
    }

    // Error signal: recording - y
    const e = recording[i] - y;
    output[i] = e;

    // Update weights: w += mu * e * refBuffer
    for (let j = 0; j < N; j++) {
      const sampleIdx = (refIdx - j + N) % N;
      weights[j] = gamma * weights[j] + mu * e * refBuffer[sampleIdx];
    }

    // Advance circular buffer index
    refIdx = (refIdx + 1) % N;

    // Yield periodically
    if (i - lastYieldIdx >= YIELD_INTERVAL) {
      if (onProgress) onProgress(i / length);
      await nextFrame();
      lastYieldIdx = i;
    }
  }
  if (onProgress) onProgress(1);
  return output;
}

// A simpler (non-adaptive) approach: align reference to recording by cross-correlation
// (to find the delay), then subtract with a scale factor.
// This is faster but less effective than adaptive filtering for room-bleed removal.
// ASYNC version with yielding.
export async function cancelReferenceByAlignment(
  recording: Float32Array,
  reference: Float32Array,
  maxDelaySamples: number = 5000,
  onProgress?: (p: number) => void
): Promise<{ cleaned: Float32Array; delay: number; scale: number }> {
  const length = Math.min(recording.length, reference.length);
  // Find delay via cross-correlation
  let bestDelay = 0;
  let bestCorr = -Infinity;
  for (let d = 0; d < maxDelaySamples; d++) {
    let corr = 0;
    for (let i = d; i < length; i++) {
      corr += reference[i - d] * recording[i];
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestDelay = d;
    }
    if (onProgress && d % 200 === 0) {
      onProgress((d / maxDelaySamples) * 0.5);
      await nextFrame();
    }
  }

  // Find optimal scale that minimizes energy of (recording - scale * delayed_ref)
  let num = 0;
  let den = 0;
  for (let i = bestDelay; i < length; i++) {
    num += recording[i] * reference[i - bestDelay];
    den += reference[i - bestDelay] * reference[i - bestDelay];
  }
  const scale = den > 1e-9 ? num / den : 1;

  // Subtract
  const cleaned = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    if (i >= bestDelay) {
      cleaned[i] = recording[i] - scale * reference[i - bestDelay];
    } else {
      cleaned[i] = recording[i];
    }
  }
  if (onProgress) onProgress(1);
  return { cleaned, delay: bestDelay, scale };
}

// Mix instrumental BGM with recorded vocals, applying simple ducking:
// when vocal is loud, BGM is slightly reduced to keep vocals clear.
// ASYNC version with yielding.
export async function mixVocalWithBgm(
  vocals: Float32Array,
  bgm: Float32Array,
  bgmGain: number = 0.85,
  duckAmount: number = 0.3,
  onProgress?: (p: number) => void
): Promise<Float32Array> {
  const length = Math.max(vocals.length, bgm.length);
  const out = new Float32Array(length);

  // Precompute vocal energy in windows for efficiency
  const windowSize = 1024;
  const duckFactors = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let energy = 0;
    const winStart = Math.max(0, i - windowSize / 2);
    const winEnd = Math.min(length, i + windowSize / 2);
    for (let k = winStart; k < winEnd; k++) {
      energy += Math.abs(vocals[k] || 0);
    }
    energy /= windowSize;
    duckFactors[i] = 1 - duckAmount * Math.min(1, energy * 5);
  }

  for (let i = 0; i < length; i++) {
    const v = vocals[i] || 0;
    const b = bgm[i] || 0;
    out[i] = v + b * bgmGain * duckFactors[i];
    // Soft clip
    if (out[i] > 1) out[i] = 1;
    if (out[i] < -1) out[i] = -1;
    if (onProgress && i % 8192 === 0) {
      onProgress(i / length);
      await nextFrame();
    }
  }
  if (onProgress) onProgress(1);
  return out;
}

// Apply a gentle vocal enhancer: light compression + EQ + soft saturation
// ASYNC version with yielding.
export async function enhanceVocals(
  input: Float32Array,
  sampleRate: number,
  onProgress?: (p: number) => void
): Promise<Float32Array> {
  // 1. High-pass at 80Hz to remove rumble
  const rc = 1 / (2 * Math.PI * 80);
  const dt = 1 / sampleRate;
  const hpAlpha = rc / (rc + dt);
  let prevIn = 0;
  let prevOut = 0;
  const hp = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = hpAlpha * (prevOut + x - prevIn);
    hp[i] = y;
    prevOut = y;
    prevIn = x;
    if (onProgress && i % 16384 === 0) {
      onProgress((i / input.length) * 0.33);
      await nextFrame();
    }
  }

  // 2. Simple compression (threshold -20dB, ratio 3:1)
  const threshold = 0.1;
  const ratio = 3;
  const comp = new Float32Array(hp.length);
  for (let i = 0; i < hp.length; i++) {
    const x = hp[i];
    const abs = Math.abs(x);
    if (abs > threshold) {
      const sign = x < 0 ? -1 : 1;
      const excess = abs - threshold;
      comp[i] = sign * (threshold + excess / ratio);
    } else {
      comp[i] = x;
    }
    if (onProgress && i % 16384 === 0) {
      onProgress(0.33 + (i / hp.length) * 0.33);
      await nextFrame();
    }
  }

  // 3. Soft saturation (gentle tanh)
  const out = new Float32Array(comp.length);
  for (let i = 0; i < comp.length; i++) {
    out[i] = Math.tanh(comp[i] * 1.5) * 0.85;
    if (onProgress && i % 16384 === 0) {
      onProgress(0.66 + (i / comp.length) * 0.34);
      await nextFrame();
    }
  }
  if (onProgress) onProgress(1);
  return out;
}
