'use client';

import { useEffect, useRef } from 'react';

interface Props {
  timelineZoom: number;
  engineRef: React.MutableRefObject<any>;
  // When provided, the container auto-scrolls to keep the playhead in view during playback.
  followContainerRef?: React.MutableRefObject<HTMLDivElement | null>;
  // Renders a live time readout (e.g. in the ruler strip).
  showTime?: boolean;
}

export function PlayheadOverlay({ timelineZoom, engineRef, followContainerRef, showTime }: Props) {
  const lineRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      let frameId: number;

      const loop = () => {
          if (engineRef.current && lineRef.current) {
              const time = engineRef.current.getCurrentTime();
              const pos = time * timelineZoom;

              lineRef.current.style.transform = `translateX(${pos}px)`;

              // Auto-follow: only while actually playing, so manual scrolling
              // and pinch-zoom are never fought by this loop.
              const container = followContainerRef?.current;
              if (engineRef.current.isPlaying && container) {
                  const viewLeft = container.scrollLeft;
                  const viewWidth = container.clientWidth;
                  if (pos < viewLeft || pos > viewLeft + viewWidth * 0.9) {
                      container.scrollLeft = Math.max(0, pos - viewWidth * 0.15);
                  }
              }

              if (timeRef.current) {
                  const m = Math.floor(time / 60);
                  const s = Math.floor(time % 60);
                  const ms = Math.floor((time % 1) * 10);
                  timeRef.current.innerText = `${m}:${String(s).padStart(2, '0')}.${ms}`;
              }
          }
          frameId = requestAnimationFrame(loop);
      };

      frameId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(frameId);
  }, [timelineZoom, engineRef, followContainerRef]);

  return (
    <>
        <div
            ref={lineRef}
            className="absolute top-0 bottom-0 w-px bg-fuchsia-400 z-50 pointer-events-none shadow-[0_0_10px_rgba(232,121,249,0.8)] will-change-transform"
            style={{ left: 0 }}
        >
            <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-fuchsia-400 rounded-full" />
        </div>
        {showTime && (
            <div
                ref={timeRef}
                className="absolute top-1 right-2 z-40 px-2 py-0.5 rounded bg-[#1a0f2e]/90 border border-[#2e1d52] text-[10px] font-mono text-fuchsia-300 pointer-events-none"
            />
        )}
    </>
  );
}
