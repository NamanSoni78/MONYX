'use client';

import { useEffect, useRef } from 'react';

interface Props {
  timelineZoom: number;
  engineRef: React.MutableRefObject<any>;
}

export function PlayheadOverlay({ timelineZoom, engineRef }: Props) {
  const lineRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      let frameId: number;

      const loop = () => {
          if (engineRef.current && lineRef.current) {
              const time = engineRef.current.getCurrentTime();
              const pos = time * timelineZoom;

              lineRef.current.style.transform = `translateX(${pos}px)`;

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
  }, [timelineZoom, engineRef]);

  return (
    <>
        <div
            ref={lineRef}
            className="absolute top-0 bottom-0 w-px bg-fuchsia-400 z-50 pointer-events-none shadow-[0_0_10px_rgba(232,121,249,0.8)] will-change-transform"
            style={{ left: 0 }}
        >
            <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-fuchsia-400 rounded-full" />
        </div>
        {/* Hidden element to broadcast time if needed, or we can use context */}
    </>
  );
}
