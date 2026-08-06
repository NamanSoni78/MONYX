'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface WaveformPreviewProps {
  audioBuffer?: AudioBuffer | null;
  audioBlob?: Blob | null;
  height?: number;
  color?: string;
  progressColor?: string;
  progress?: number; // 0..1
  onSeek?: (progress: number) => void;
  trimRange?: [number, number]; // [startSec, endSec]
  onTrimChange?: (range: [number, number]) => void;
  trimmable?: boolean;
}

export function WaveformPreview({
  audioBuffer,
  audioBlob,
  height = 80,
  color = '#7b3fe4',
  progressColor = '#2bc7da',
  progress,
  onSeek,
  trimRange,
  onTrimChange,
  trimmable = false,
}: WaveformPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [duration, setDuration] = useState(0);
  // Use a ref for width so callbacks always have the latest value
  const widthRef = useRef(800);
  const [width, setWidth] = useState(800);
  const draggingHandleRef = useRef<'start' | 'end' | 'body' | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  // Keep widthRef in sync
  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  // Decode blob if buffer not provided
  useEffect(() => {
    let cancelled = false;
    async function decode() {
      if (audioBuffer) {
        if (!cancelled) {
          setDuration(audioBuffer.duration);
          computePeaks(audioBuffer);
        }
      } else if (audioBlob) {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass();
          const arr = await audioBlob.arrayBuffer();
          const buf = await ctx.decodeAudioData(arr.slice(0));
          ctx.close();
          if (!cancelled) {
            setDuration(buf.duration);
            computePeaks(buf);
          }
        } catch (e) {
          console.error('Failed to decode audio for waveform', e);
        }
      }
    }
    function computePeaks(buf: AudioBuffer) {
      const targetWidth = Math.min(2000, Math.max(400, containerRef.current?.clientWidth || 800));
      const channelData = buf.getChannelData(0);
      const samplesPerPeak = Math.max(1, Math.floor(channelData.length / targetWidth));
      const peaksArr = new Float32Array(targetWidth);
      for (let i = 0; i < targetWidth; i++) {
        let max = 0;
        const start = i * samplesPerPeak;
        const end = Math.min(channelData.length, start + samplesPerPeak);
        for (let j = start; j < end; j++) {
          const v = Math.abs(channelData[j]);
          if (v > max) max = v;
        }
        peaksArr[i] = max;
      }
      if (!cancelled) {
        setPeaks(peaksArr);
        setWidth(targetWidth);
        widthRef.current = targetWidth;
      }
    }
    decode();
    return () => {
      cancelled = true;
    };
  }, [audioBuffer, audioBlob]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (containerRef.current && audioBuffer) {
        const newWidth = Math.min(2000, Math.max(400, containerRef.current.clientWidth));
        if (Math.abs(newWidth - width) > 50) {
          setWidth(newWidth);
          widthRef.current = newWidth;
          const channelData = audioBuffer.getChannelData(0);
          const samplesPerPeak = Math.max(1, Math.floor(channelData.length / newWidth));
          const peaksArr = new Float32Array(newWidth);
          for (let i = 0; i < newWidth; i++) {
            let max = 0;
            const start = i * samplesPerPeak;
            const end = Math.min(channelData.length, start + samplesPerPeak);
            for (let j = start; j < end; j++) {
              const v = Math.abs(channelData[j]);
              if (v > max) max = v;
            }
            peaksArr[i] = max;
          }
          setPeaks(peaksArr);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [audioBuffer, width]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);
    const mid = height / 2;
    const progressX = progress !== undefined ? progress * width : 0;

    const trimStartX = trimRange ? (trimRange[0] / duration) * width : 0;
    const trimEndX = trimRange ? (trimRange[1] / duration) * width : width;

    // Draw peaks
    const barWidth = Math.max(1, width / peaks.length - 0.5);
    for (let i = 0; i < peaks.length; i++) {
      const x = (i / peaks.length) * width;
      const h = Math.max(1, peaks[i] * (height - 4));
      const inTrim = !trimRange || (x >= trimStartX && x <= trimEndX);
      const isPlayed = progress !== undefined && x <= progressX;
      if (!inTrim) {
        ctx.fillStyle = '#3a2860';
      } else if (isPlayed) {
        ctx.fillStyle = progressColor;
      } else {
        ctx.fillStyle = color;
      }
      ctx.fillRect(x, mid - h / 2, barWidth, h);
    }

    // Dim outside trim
    if (trimRange) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, trimStartX, height);
      ctx.fillRect(trimEndX, 0, width - trimEndX, height);
    }

    // Progress line
    if (progress !== undefined) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(progressX - 1, 0, 2, height);
    }

    // Trim handles
    if (trimRange) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(trimStartX - 2, 0, 4, height);
      ctx.beginPath();
      ctx.arc(trimStartX, height / 2, 10, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(trimEndX - 2, 0, 4, height);
      ctx.beginPath();
      ctx.arc(trimEndX, height / 2, 10, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [peaks, width, height, color, progressColor, progress, duration, trimRange]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!containerRef.current || !duration) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const currentWidth = widthRef.current;

    containerRef.current.setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;

    if (trimmable && trimRange) {
      const trimStartX = (trimRange[0] / duration) * currentWidth;
      const trimEndX = (trimRange[1] / duration) * currentWidth;
      const distStart = Math.abs(x - trimStartX);
      const distEnd = Math.abs(x - trimEndX);
      if (distStart < 22 && distStart <= distEnd) {
        draggingHandleRef.current = 'start';
        e.preventDefault();
        return;
      }
      if (distEnd < 22) {
        draggingHandleRef.current = 'end';
        e.preventDefault();
        return;
      }
    }
    if (onSeek) {
      onSeek(Math.max(0, Math.min(1, x / currentWidth)));
    }
  }, [duration, trimmable, trimRange, onSeek]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingHandleRef.current || !containerRef.current || !trimRange || !onTrimChange) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const currentWidth = widthRef.current;
    const time = Math.max(0, Math.min(duration, (x / currentWidth) * duration));
    if (draggingHandleRef.current === 'start') {
      onTrimChange([Math.min(time, trimRange[1] - 0.1), trimRange[1]]);
    } else if (draggingHandleRef.current === 'end') {
      onTrimChange([trimRange[0], Math.max(time, trimRange[0] + 0.1)]);
    }
  }, [duration, trimRange, onTrimChange]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    draggingHandleRef.current = null;
    if (pointerIdRef.current !== null && containerRef.current) {
      try {
        containerRef.current.releasePointerCapture(pointerIdRef.current);
      } catch (err) {
        // ignore
      }
    }
    pointerIdRef.current = null;
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-[#0d0718] rounded-lg overflow-hidden border border-[#2e1d52]"
      style={{ height, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <canvas
        ref={canvasRef}
        className={`w-full h-full block ${trimmable ? 'cursor-ew-resize' : 'cursor-pointer'}`}
      />
    </div>
  );
}
