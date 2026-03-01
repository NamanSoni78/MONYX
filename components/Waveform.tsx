'use client';

import React, { useEffect, useRef, useState } from 'react';

const bufferCache = new Map<string, AudioBuffer>();
let decodeCtx: AudioContext | null = null;

function getDecodeContext() {
  if (!decodeCtx && typeof window !== 'undefined') {
    decodeCtx = new AudioContext();
  }
  return decodeCtx;
}

interface Props {
  blob?: Blob;
  bufferId?: string;
  color: string;
  width: number;
  height: number;
  start: number; // Offset in buffer (seconds)
  end: number;   // Offset + Duration (seconds)
}

function WaveformComponent({ blob, bufferId, color, width, height, start, end }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(
    bufferId ? bufferCache.get(bufferId) || null : null
  );

  useEffect(() => {
    if (!blob || !bufferId || buffer) return;

    const ctx = getDecodeContext();
    if (!ctx) return;

    blob.arrayBuffer().then((arr) => ctx.decodeAudioData(arr)).then((decoded) => {
      bufferCache.set(bufferId, decoded);
      setBuffer(decoded);
    }).catch((err) => console.error('Error decoding buffer', err));
  }, [blob, bufferId, buffer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color;

    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    const validStart = Math.max(0, start);
    const validEnd = Math.min(buffer.duration, end);

    const startSample = Math.floor(validStart * sampleRate);
    const endSample = Math.floor(validEnd * sampleRate);
    const totalSamples = endSample - startSample;

    if (totalSamples <= 0) return;

    const samplesPerPixel = totalSamples / width;

    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, height / 2, width, 1);
    ctx.globalAlpha = 1.0;

    for (let x = 0; x < width; x++) {
      const idx = startSample + Math.floor(x * samplesPerPixel);
      const chunkEnd = Math.min(startSample + Math.floor((x + 1) * samplesPerPixel), data.length);

      if (idx >= data.length) break;

      let min = 1.0;
      let max = -1.0;

      const stride = Math.max(1, Math.floor((chunkEnd - idx) / 20));

      for (let j = idx; j < chunkEnd; j += stride) {
        const val = data[j];
        if (val < min) min = val;
        if (val > max) max = val;
      }

      if (min > max) { min = 0; max = 0; }

      const yMin = ((1 + min) * height) / 2;
      const yMax = ((1 + max) * height) / 2;

      const h = Math.max(1, yMax - yMin);
      ctx.fillRect(x, height - yMax, 1, h);
    }
  }, [buffer, color, width, height, start, end]);

  return <canvas ref={canvasRef} className="block pointer-events-none" />;
}

export const Waveform = React.memo(WaveformComponent);
