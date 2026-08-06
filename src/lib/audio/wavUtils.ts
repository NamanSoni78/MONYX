// WAV encoding/decoding utilities for browser audio processing

export interface DecodedAudio {
  sampleRate: number;
  channels: number;
  length: number;
  data: Float32Array[]; // [channel][sample]
  duration: number;
}

// CRITICAL: The UVR_MDXNET_KARA_2 ONNX model was trained on 44.1kHz audio.
// The FFT bin frequencies depend on the sample rate (bin_k = k * sr / n_fft),
// so feeding 48kHz audio into a model trained on 44.1kHz would shift every
// frequency by ~8.8% — the model sees wrong frequencies and produces garbage.
// We force-resample to 44100Hz on decode to guarantee the model always sees
// the same frequency layout it was trained on.
const MODEL_SAMPLE_RATE = 44100;

export async function decodeAudioFile(file: File | Blob): Promise<DecodedAudio> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  // Force the sample rate to match what the AI models expect.
  const ctx = new AudioContextClass({ sampleRate: MODEL_SAMPLE_RATE });
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channels: Float32Array[] = [];
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      channels.push(audioBuffer.getChannelData(i).slice() as Float32Array);
    }
    return {
      sampleRate: audioBuffer.sampleRate, // will be MODEL_SAMPLE_RATE
      channels: audioBuffer.numberOfChannels,
      length: audioBuffer.length,
      data: channels,
      duration: audioBuffer.duration,
    };
  } finally {
    ctx.close();
  }
}

export async function decodeBlobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextClass({ sampleRate: MODEL_SAMPLE_RATE });
  try {
    return await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    ctx.close();
  }
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

export function float32ArrayToWavBlob(data: Float32Array[], sampleRate: number): Blob {
  const channels = data.length;
  const length = data[0].length;
  const bufferLength = length * channels * 2 + 44;
  const view = new DataView(new ArrayBuffer(bufferLength));
  let offset = 0;
  const writeString = (str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset++, str.charCodeAt(i));
  };
  writeString('RIFF');
  view.setUint32(offset, 36 + length * channels * 2, true);
  offset += 4;
  writeString('WAVEfmt ');
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, channels, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * channels * 2, true);
  offset += 4;
  view.setUint16(offset, channels * 2, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeString('data');
  view.setUint32(offset, length * channels * 2, true);
  offset += 4;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const sample = Math.max(-1, Math.min(1, data[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

export async function wavBlobToFloat32Arrays(blob: Blob): Promise<{ data: Float32Array[]; sampleRate: number; channels: number }> {
  const arrayBuffer = await blob.arrayBuffer();
  const view = new DataView(arrayBuffer);
  // Verify RIFF header
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (riff !== 'RIFF') throw new Error('Not a valid WAV file');
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);

  // Find data chunk
  let offset = 12;
  let dataOffset = -1;
  let dataLength = 0;
  while (offset < view.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataLength = chunkSize;
      break;
    }
    offset += 8 + chunkSize;
  }
  if (dataOffset < 0) throw new Error('No data chunk found');

  const bytesPerSample = bitsPerSample / 8;
  const numSamples = dataLength / (bytesPerSample * channels);
  const result: Float32Array[] = [];
  for (let c = 0; c < channels; c++) result.push(new Float32Array(numSamples));

  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < channels; c++) {
      const byteOffset = dataOffset + (i * channels + c) * bytesPerSample;
      if (bitsPerSample === 16) {
        const val = view.getInt16(byteOffset, true);
        result[c][i] = val / 0x8000;
      } else if (bitsPerSample === 32) {
        const val = view.getInt32(byteOffset, true);
        result[c][i] = val / 0x80000000;
      } else if (bitsPerSample === 24) {
        const b0 = view.getUint8(byteOffset);
        const b1 = view.getUint8(byteOffset + 1);
        const b2 = view.getInt8(byteOffset + 2);
        const val = (b2 << 16) | (b1 << 8) | b0;
        result[c][i] = val / 0x800000;
      } else if (bitsPerSample === 8) {
        const val = view.getUint8(byteOffset) - 128;
        result[c][i] = val / 128;
      }
    }
  }
  return { data: result, sampleRate, channels };
}

// Trim a Float32Array to [startSec, endSec]
export function trimAudio(data: Float32Array[], sampleRate: number, startSec: number, endSec: number): Float32Array[] {
  const startSample = Math.floor(startSec * sampleRate);
  const endSample = Math.floor(endSec * sampleRate);
  return data.map((ch) => ch.slice(startSample, endSample));
}

// Mix down to mono by averaging channels
export function toMono(data: Float32Array[]): Float32Array {
  if (data.length === 1) return data[0];
  const length = data[0].length;
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let c = 0; c < data.length; c++) sum += data[c][i];
    mono[i] = sum / data.length;
  }
  return mono;
}

// Convert mono to stereo
export function toStereo(mono: Float32Array): Float32Array[] {
  return [mono.slice(), mono.slice()];
}

// Mix two audio buffers (must be same length & sample rate)
export function mixAudio(a: Float32Array, b: Float32Array): Float32Array {
  const length = Math.max(a.length, b.length);
  const result = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = (a[i] || 0) + (b[i] || 0);
  }
  return result;
}

// Find the time offset (delay) between a reference signal and a recorded signal
// using cross-correlation. Returns delay in samples.
export function findDelay(reference: Float32Array, recorded: Float32Array, maxDelaySamples: number = 44100): number {
  const len = Math.min(reference.length, recorded.length);
  let bestDelay = 0;
  let bestCorr = -Infinity;
  for (let d = 0; d < maxDelaySamples; d++) {
    let corr = 0;
    for (let i = d; i < len; i++) {
      corr += reference[i - d] * recorded[i];
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestDelay = d;
    }
  }
  return bestDelay;
}
