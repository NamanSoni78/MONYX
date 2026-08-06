'use client';

import {
  DecodedAudio,
  float32ArrayToWavBlob,
  toMono,
  toStereo,
} from './wavUtils';
import {
  createInferenceSession,
  getActiveSession,
  loadModelData,
  runInference,
  ModelKind,
  listStoredModels,
} from './onnxModelManager';
import * as ort from 'onnxruntime-web';

export interface SeparationResult {
  vocals: Blob;
  instrumental: Blob;
  method: string;
}

export interface SeparationProgress {
  stage: string;
  progress: number;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ============================================================================
// METHOD 1: Phase Cancellation (fallback)
// ============================================================================
export function separateByPhaseCancellation(audio: DecodedAudio): SeparationResult {
  if (audio.channels < 2) {
    const mono = audio.data[0];
    return {
      vocals: float32ArrayToWavBlob(toStereo(new Float32Array(mono.length)), audio.sampleRate),
      instrumental: float32ArrayToWavBlob([mono, mono], audio.sampleRate),
      method: 'Phase cancellation (mono)',
    };
  }

  const left = audio.data[0];
  const right = audio.data[1];
  const length = left.length;

  const vocals = new Float32Array(length);
  const instrumental = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    const l = left[i];
    const r = right[i];
    const center = (l + r) * 0.5;
    const side = (l - r) * 0.5;
    instrumental[i] = side;
    vocals[i] = center;
  }

  const vocalEQ = bandpassFilter(vocals, audio.sampleRate, 200, 8000);
  const finalVocals = new Float32Array(length);
  for (let i = 0; i < length; i++) finalVocals[i] = vocalEQ[i];

  const bassKeep = lowpassFilter(toMono([left, right]), audio.sampleRate, 250);
  const finalInstrumental = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    finalInstrumental[i] = instrumental[i] + bassKeep[i] * 0.8;
  }

  return {
    vocals: float32ArrayToWavBlob(toStereo(finalVocals), audio.sampleRate),
    instrumental: float32ArrayToWavBlob(toStereo(finalInstrumental), audio.sampleRate),
    method: 'Phase cancellation (mid-side)',
  };
}

// ============================================================================
// METHOD 2: ONNX Model Inference
// Model input/output: [1, 4, 2048, 256]
//   - 4 channels = [real_L, imag_L, real_R, imag_R] (complex STFT)
//   - 2048 = frequency bins
//   - 256 = time frames per chunk
//
// CRITICAL: n_fft MUST be 4096 (a power of 2) so that:
//   1. Our radix-2 FFT works directly (no zero-padding needed)
//   2. Frequency spacing matches what the model was trained with
//      (bins at k * sr / 4096, NOT k * sr / 8192 from padding)
//
// Parameters:
//   n_fft = 4096, hop = 1024, freqBins = 2048, framesPerChunk = 256
//   chunkSamples = (256-1)*1024 + 4096 = 265216
//   n_bins = 4096/2 + 1 = 2049 (use first 2048, drop Nyquist)
// ============================================================================
export async function separateByONNX(
  audio: DecodedAudio,
  modelId: string,
  modelKind: ModelKind,
  onProgress?: (p: SeparationProgress) => void
): Promise<SeparationResult> {
  onProgress?.({ stage: 'Loading AI model', progress: 0.05 });
  const modelData = await loadModelData(modelId);
  if (!modelData) throw new Error('Model data not found.');

  const current = getActiveSession();
  if (!current || current.kind !== modelKind) {
    await createInferenceSession(modelData, modelKind);
  }
  const session = getActiveSession()!;

  onProgress?.({ stage: 'Preparing audio input', progress: 0.1 });

  // Model parameters — n_fft=4096 (power of 2, no padding needed)
  const fftSize = 4096;
  const hopSize = 1024;
  const freqBins = 2048; // use first 2048 of 2049 bins
  const framesPerChunk = 256;
  const chunkSamples = (framesPerChunk - 1) * hopSize + fftSize; // 265216
  const window = hannWindowPeriodic(fftSize);

  // Get stereo audio
  const left = audio.data[0] || new Float32Array(audio.length);
  const right = audio.data[1] || left;
  const totalSamples = left.length;

  // Output buffers
  const outLeft = new Float32Array(totalSamples);
  const outRight = new Float32Array(totalSamples);
  const normLeft = new Float32Array(totalSamples);
  const normRight = new Float32Array(totalSamples);

  const inputName = session.inputNames[0];
  const numChunks = Math.ceil(totalSamples / (framesPerChunk * hopSize));
  let chunkIdx = 0;

  // Pre-allocate reusable chunk buffers (these are NOT passed to ONNX, so they're safe to reuse)
  const chunkL = new Float32Array(chunkSamples);
  const chunkR = new Float32Array(chunkSamples);
  const ftSize = freqBins * framesPerChunk;

  for (let start = 0; start < totalSamples; start += framesPerChunk * hopSize) {
    const chunkLen = Math.min(chunkSamples, totalSamples - start);
    const numFrames = Math.min(framesPerChunk, Math.floor((chunkLen - fftSize) / hopSize) + 1);
    if (numFrames < 1) break;

    // Extract chunk (clear and fill)
    chunkL.fill(0);
    chunkR.fill(0);
    chunkL.set(left.subarray(start, start + chunkLen));
    chunkR.set(right.subarray(start, start + chunkLen));

    // Compute STFT for both channels
    const stftL = computeSTFT(chunkL, fftSize, hopSize, window, freqBins, framesPerChunk);
    const stftR = computeSTFT(chunkR, fftSize, hopSize, window, freqBins, framesPerChunk);

    // CRITICAL: Allocate a FRESH inputData buffer for every inference call.
    // When ort.env.wasm.proxy = true, ONNX Runtime Web transfers the
    // ArrayBuffer to the worker thread, which DETACHES it from the main
    // thread. Reusing inputData across iterations would throw
    // "Cannot perform set on detached ArrayBuffer" on the 2nd iteration,
    // silently falling back to phase cancellation (the original bug).
    const inputData = new Float32Array(4 * ftSize);
    inputData.set(stftL.real, 0 * ftSize);
    inputData.set(stftL.imag, 1 * ftSize);
    inputData.set(stftR.real, 2 * ftSize);
    inputData.set(stftR.imag, 3 * ftSize);

    // Run inference. The inputData buffer is now owned by ONNX (transferred to worker).
    const inputTensor = new ort.Tensor('float32', inputData, [1, 4, freqBins, framesPerChunk]);

    const outputs = await runInference({ [inputName]: inputTensor });
    const rawOutput = outputs[0].data as Float32Array;

    // CRITICAL: Copy the output IMMEDIATELY. In proxy mode, the output
    // buffer can also be transferred/detached after the run returns, so
    // we must snapshot it before doing any iSTFT work.
    const outputData = new Float32Array(rawOutput.length);
    outputData.set(rawOutput);

    // Extract output: [4, freqBins, framesPerChunk] → complex spectrogram
    // The MDX-Net KARA model directly outputs the complex STFT of the
    // separated source (instrumental for KARA models). We iSTFT it back
    // to the time domain. The output magnitudes can be much larger than
    // the input's because MDX-Net doesn't have a bounded activation in
    // its final layer — this is normal and is handled by the soft limiter
    // in float32ArrayToWavBlob's caller (see normalizePeak below).
    const outRealL = outputData.subarray(0 * ftSize, 1 * ftSize);
    const outImagL = outputData.subarray(1 * ftSize, 2 * ftSize);
    const outRealR = outputData.subarray(2 * ftSize, 3 * ftSize);
    const outImagR = outputData.subarray(3 * ftSize, 4 * ftSize);

    // iSTFT to get waveform (the model output's complex spectrogram)
    const sepL = inverseSTFT(outRealL, outImagL, fftSize, hopSize, window, chunkSamples, freqBins, framesPerChunk);
    const sepR = inverseSTFT(outRealR, outImagR, fftSize, hopSize, window, chunkSamples, freqBins, framesPerChunk);

    // Overlap-add into output buffers
    for (let i = 0; i < chunkSamples && start + i < totalSamples; i++) {
      outLeft[start + i] += sepL[i];
      outRight[start + i] += sepR[i];
      normLeft[start + i] += 1;
      normRight[start + i] += 1;
    }

    chunkIdx++;
    if (onProgress && chunkIdx % 4 === 0) {
      onProgress({ stage: `Running AI model (${chunkIdx}/${numChunks} chunks)`, progress: 0.1 + (chunkIdx / numChunks) * 0.8 });
      await nextFrame();
    }
  }

  // Normalize
  for (let i = 0; i < totalSamples; i++) {
    if (normLeft[i] > 0) outLeft[i] /= normLeft[i];
    if (normRight[i] > 0) outRight[i] /= normRight[i];
  }

  // Determine what the model outputs based on its kind:
  // - mdxnet (UVR_MDXNET_KARA_2): outputs INSTRUMENTAL (Karaoke). Vocals = original - instrumental.
  // - kimvocal2 (Kim Vocal 2): outputs VOCALS directly. Instrumental = original - vocals.
  // - mdx23c: outputs VOCALS directly (vocal extraction model). Instrumental = original - vocals.
  // - demucs / custom: assume instrumental (like mdxnet).
  //
  // Mixing this up would swap vocals and instrumental — the user would
  // hear "instrumental" containing the singer's voice and "vocals"
  // containing only the beat. Very confusing.
  const modelOutputsVocals = modelKind === 'kimvocal2' || modelKind === 'mdx23c';

  let vocalLeft: Float32Array;
  let vocalRight: Float32Array;
  let instrLeft: Float32Array;
  let instrRight: Float32Array;

  if (modelOutputsVocals) {
    // Model output is VOCALS
    vocalLeft = outLeft;
    vocalRight = outRight;
    instrLeft = new Float32Array(totalSamples);
    instrRight = new Float32Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      instrLeft[i] = left[i] - vocalLeft[i];
      instrRight[i] = right[i] - vocalRight[i];
    }
  } else {
    // Model output is INSTRUMENTAL (KARA / default)
    instrLeft = outLeft;
    instrRight = outRight;
    vocalLeft = new Float32Array(totalSamples);
    vocalRight = new Float32Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      vocalLeft[i] = left[i] - instrLeft[i];
      vocalRight[i] = right[i] - instrRight[i];
    }
  }

  // CRITICAL: MDX-Net output magnitudes can be much larger than the input's
  // (the network has no bounded final activation). The iSTFT produces a
  // time-domain signal with very high crest factor (peak/RMS ≈ 250) — most
  // samples are reasonable but a few transients are 1000x larger. Peak
  // normalization would crush the RMS to ~0.003 (silent). Instead, we use
  // a soft limiter (tanh) which:
  //   1. Leaves small values unchanged (tanh(x) ≈ x for |x| < 0.3)
  //   2. Softly compresses large transients (tanh(x) → ±1 as x → ∞)
  //   3. Preserves the RMS / overall loudness
  // This is the same approach used by UVR's "limiter" post-processing.
  softLimit(vocalLeft, vocalRight, 0.95);
  softLimit(instrLeft, instrRight, 0.95);

  onProgress?.({ stage: 'Finalizing', progress: 1 });
  return {
    vocals: float32ArrayToWavBlob([vocalLeft, vocalRight], audio.sampleRate),
    instrumental: float32ArrayToWavBlob([instrLeft, instrRight], audio.sampleRate),
    method: `AI model (${modelKind.toUpperCase()})`,
  };
}

// Apply tanh-based soft limiting to a stereo pair. Values below `threshold`
// pass through unchanged; values above are softly compressed toward ±1.
// This prevents hard clipping distortion in the int16 WAV writer while
// preserving the audio's RMS and dynamic range.
function softLimit(left: Float32Array, right: Float32Array, threshold: number): void {
  // tanh(x/threshold) maps |x| < threshold to ~x, and |x| >> threshold to ±threshold.
  // We scale by threshold so the output peak is approximately `threshold`.
  for (let i = 0; i < left.length; i++) {
    left[i] = threshold * Math.tanh(left[i] / threshold);
    right[i] = threshold * Math.tanh(right[i] / threshold);
  }
}

// ============================================================================
// STFT — computes complex spectrogram
// Returns [real, imag] arrays of shape [freqBins, framesPerChunk]
// fftSize MUST be a power of 2 (4096) for correct frequency spacing
// ============================================================================
function computeSTFT(
  signal: Float32Array,
  fftSize: number,
  hopSize: number,
  window: Float32Array,
  freqBins: number,
  framesPerChunk: number
): { real: Float32Array; imag: Float32Array } {
  const real = new Float32Array(freqBins * framesPerChunk);
  const imag = new Float32Array(freqBins * framesPerChunk);

  for (let t = 0; t < framesPerChunk; t++) {
    const start = t * hopSize;
    if (start + fftSize > signal.length) break;

    // Apply window
    const frame = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      frame[i] = signal[start + i] * window[i];
    }

    // FFT (fftSize is power of 2, no padding needed)
    const spectrum = fft(frame);
    for (let f = 0; f < freqBins; f++) {
      real[f * framesPerChunk + t] = spectrum[f][0];
      imag[f * framesPerChunk + t] = spectrum[f][1];
    }
  }

  return { real, imag };
}

// ============================================================================
// iSTFT — reconstructs waveform from complex spectrogram
// Mirrors bins freqBins..fftSize-1 using conjugate symmetry
// ============================================================================
function inverseSTFT(
  real: Float32Array,
  imag: Float32Array,
  fftSize: number,
  hopSize: number,
  window: Float32Array,
  outputLength: number,
  freqBins: number,
  framesPerChunk: number
): Float32Array {
  const output = new Float32Array(outputLength);
  const norm = new Float32Array(outputLength);

  for (let t = 0; t < framesPerChunk; t++) {
    // Reconstruct full FFT spectrum
    const reArr = new Float32Array(fftSize);
    const imArr = new Float32Array(fftSize);

    // Fill bins 0..freqBins-1 from input
    for (let f = 0; f < freqBins; f++) {
      reArr[f] = real[f * framesPerChunk + t];
      imArr[f] = imag[f * framesPerChunk + t];
    }

    // Mirror: bin (fftSize - f) = conjugate of bin f
    // freqBins = 2048, fftSize = 4096
    // bin 2049 = conj(bin 2047), bin 2050 = conj(bin 2046), etc.
    for (let f = 1; f < fftSize - freqBins; f++) {
      const srcBin = freqBins - f;
      const dstBin = freqBins + f;
      if (dstBin < fftSize && srcBin >= 0) {
        reArr[dstBin] = reArr[srcBin];
        imArr[dstBin] = -imArr[srcBin];
      }
    }

    // Nyquist bin (bin 2048) — set to 0
    reArr[freqBins] = 0;
    imArr[freqBins] = 0;

    // Inverse FFT
    ifftInPlace(reArr, imArr);

    // Overlap-add with window
    const start = t * hopSize;
    for (let i = 0; i < fftSize; i++) {
      const outIdx = start + i;
      if (outIdx < outputLength) {
        output[outIdx] += reArr[i] * window[i];
        norm[outIdx] += window[i] * window[i];
      }
    }
  }

  // Normalize
  for (let i = 0; i < outputLength; i++) {
    if (norm[i] > 1e-9) output[i] /= norm[i];
  }

  return output;
}

// ============================================================================
// High-level orchestration
// ============================================================================
export async function separateAudio(
  audio: DecodedAudio,
  options: {
    preferModel?: string;
    modelKind?: ModelKind;
  } = {},
  onProgress?: (p: SeparationProgress) => void
): Promise<SeparationResult> {
  if (options.preferModel && options.modelKind) {
    // Try AI separation. If it fails, we DO NOT silently fall back to
    // phase cancellation anymore — that produced near-identity output
    // and was the original "vocal remover doesn't work" bug. Instead,
    // surface the real error to the user so they know what's wrong.
    onProgress?.({ stage: 'Starting AI separation', progress: 0.05 });
    return await separateByONNX(audio, options.preferModel, options.modelKind, onProgress);
  }
  // No model selected — only use phase cancellation as a last resort,
  // but mark the method clearly so the user knows it's not AI.
  onProgress?.({ stage: 'Phase cancellation separation (no AI model selected)', progress: 0.5 });
  await nextFrame();
  const result = separateByPhaseCancellation(audio);
  onProgress?.({ stage: 'Done', progress: 1 });
  return result;
}

export async function hasConfiguredModel(): Promise<boolean> {
  const models = await listStoredModels();
  return models.length > 0;
}

// ============================================================================
// DSP helpers
// ============================================================================

// Periodic Hann window — matches torch.hann_window(N, periodic=True)
function hannWindowPeriodic(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / size));
  }
  return w;
}

// FFT — Radix-2 (input must be power of 2)
function fft(input: Float32Array): Float32Array[][] {
  const n = input.length;
  if ((n & (n - 1)) !== 0) {
    throw new Error('FFT input must be power of 2');
  }
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++) re[i] = input[i];
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * wRe - im[i + k + len / 2] * wIm;
        const vIm = re[i + k + len / 2] * wIm + im[i + k + len / 2] * wRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const newWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = newWRe;
      }
    }
  }
  const result: Float32Array[][] = [];
  for (let i = 0; i <= n / 2; i++) {
    result.push(new Float32Array([re[i], im[i]]));
  }
  return result;
}

function ifftInPlace(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 0; i < n; i++) im[i] = -im[i];
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * wRe - im[i + k + len / 2] * wIm;
        const vIm = re[i + k + len / 2] * wIm + im[i + k + len / 2] * wRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const newWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = newWRe;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    re[i] = re[i] / n;
    im[i] = -im[i] / n;
  }
}

function lowpassFilter(input: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / sampleRate;
  const alpha = dt / (rc + dt);
  const output = new Float32Array(input.length);
  let prev = 0;
  for (let i = 0; i < input.length; i++) {
    prev = prev + alpha * (input[i] - prev);
    output[i] = prev;
  }
  return output;
}

function highpassFilter(input: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);
  const output = new Float32Array(input.length);
  let prevIn = 0;
  let prevOut = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = alpha * (prevOut + x - prevIn);
    output[i] = y;
    prevOut = y;
    prevIn = x;
  }
  return output;
}

function bandpassFilter(input: Float32Array, sampleRate: number, lowCut: number, highCut: number): Float32Array {
  return highpassFilter(lowpassFilter(input, sampleRate, highCut), sampleRate, lowCut);
}
