'use client';

// Video maker: combine image/video clips with an audio track, render to MP4/WebM.
// Uses Canvas + MediaRecorder API. Audio is decoded and routed to a
// MediaStreamDestination (NOT to speakers — silent render).

export interface VideoClip {
  id: string;
  type: 'image' | 'video';
  url: string; // object URL
  start: number; // sec
  duration: number; // sec
  fadeIn?: number;
  fadeOut?: number;
  scale?: number;
  x?: number;
  y?: number;
  text?: string;
  textColor?: string;
  textBg?: string;
  fontSize?: number;
}

export interface AudioTrack {
  url: string;
  start: number;
  volume: number;
}

export interface VideoProject {
  width: number;
  height: number;
  fps: number;
  clips: VideoClip[];
  audio: AudioTrack;
  backgroundColor: string;
  totalDuration: number;
}

export interface RenderProgress {
  stage: string;
  progress: number; // 0..1
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error(`Failed to load video: ${url}`));
    v.src = url;
  });
}

interface PreparedClip {
  clip: VideoClip;
  image?: HTMLImageElement;
  video?: HTMLVideoElement;
}

async function prepareClips(clips: VideoClip[]): Promise<PreparedClip[]> {
  const prepared: PreparedClip[] = [];
  for (const clip of clips) {
    try {
      if (clip.type === 'image') {
        const img = await loadImage(clip.url);
        prepared.push({ clip, image: img });
      } else {
        const v = await loadVideo(clip.url);
        prepared.push({ clip, video: v });
      }
    } catch (e) {
      console.warn('Failed to prepare clip:', e);
      // Skip broken clips
    }
  }
  return prepared;
}

function drawClip(
  ctx: CanvasRenderingContext2D,
  prepared: PreparedClip,
  t: number,
  width: number,
  height: number,
  bgColor: string
) {
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  const clip = prepared.clip;
  const localT = t - clip.start;
  if (localT < 0 || localT > clip.duration) return;

  let sourceWidth: number;
  let sourceHeight: number;

  if (prepared.image) {
    sourceWidth = prepared.image.naturalWidth;
    sourceHeight = prepared.image.naturalHeight;
  } else if (prepared.video) {
    // Sync video playback to localT
    const targetTime = Math.max(0, Math.min(prepared.video.duration || 0, localT));
    if (Math.abs(prepared.video.currentTime - targetTime) > 0.15) {
      try {
        prepared.video.currentTime = targetTime;
      } catch (e) {
        // ignore
      }
    }
    sourceWidth = prepared.video.videoWidth || 1280;
    sourceHeight = prepared.video.videoHeight || 720;
  } else {
    return;
  }

  // Fit-contain
  const scale = Math.min(width / sourceWidth, height / sourceHeight) * (clip.scale || 1);
  const drawW = sourceWidth * scale;
  const drawH = sourceHeight * scale;
  const drawX = (width - drawW) / 2 + (clip.x ? (clip.x - 0.5) * width : 0);
  const drawY = (height - drawH) / 2 + (clip.y ? (clip.y - 0.5) * height : 0);

  ctx.save();
  let alpha = 1;
  if (clip.fadeIn && localT < clip.fadeIn) alpha *= Math.max(0, localT / clip.fadeIn);
  if (clip.fadeOut && localT > clip.duration - (clip.fadeOut || 0))
    alpha *= Math.max(0, (clip.duration - localT) / (clip.fadeOut || 1));
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

  try {
    if (prepared.image) {
      ctx.drawImage(prepared.image, drawX, drawY, drawW, drawH);
    } else if (prepared.video && prepared.video.readyState >= 2) {
      ctx.drawImage(prepared.video, drawX, drawY, drawW, drawH);
    }
  } catch (e) {
    // ignore drawImage errors (frame not ready)
  }
  ctx.restore();

  // Text overlay
  if (clip.text) {
    ctx.save();
    const fontSize = clip.fontSize || 48;
    ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textY = height * 0.85;
    const textMetrics = ctx.measureText(clip.text);
    const padX = 20;
    const padY = 10;
    if (clip.textBg) {
      ctx.fillStyle = clip.textBg;
      ctx.fillRect(
        width / 2 - textMetrics.width / 2 - padX,
        textY - fontSize / 2 - padY,
        textMetrics.width + padX * 2,
        fontSize + padY * 2
      );
    }
    ctx.fillStyle = clip.textColor || '#ffffff';
    ctx.fillText(clip.text, width / 2, textY);
    ctx.restore();
  }
}

export async function renderVideo(
  project: VideoProject,
  onProgress?: (p: RenderProgress) => void
): Promise<Blob> {
  if (typeof window === 'undefined') throw new Error('Render requires browser environment');

  // Cap resolution for speed — render at max 720p regardless of input
  const maxWidth = 1280;
  const maxHeight = 720;
  let renderWidth = project.width;
  let renderHeight = project.height;
  if (renderWidth > maxWidth || renderHeight > maxHeight) {
    const scale = Math.min(maxWidth / renderWidth, maxHeight / renderHeight);
    renderWidth = Math.round(renderWidth * scale);
    renderHeight = Math.round(renderHeight * scale);
  }
  // Use 24 FPS for faster rendering (good enough quality)
  const renderFps = Math.min(project.fps, 30);

  onProgress?.({ stage: 'Preparing clips', progress: 0.02 });
  const prepared = await prepareClips(project.clips);
  if (prepared.length === 0) throw new Error('No valid clips to render');

  onProgress?.({ stage: 'Setting up canvas', progress: 0.08 });
  const canvas = document.createElement('canvas');
  canvas.width = renderWidth;
  canvas.height = renderHeight;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Failed to get canvas context');

  // Fill initial frame
  ctx.fillStyle = project.backgroundColor;
  ctx.fillRect(0, 0, renderWidth, renderHeight);

  const firstClip = prepared.find((p) => p.clip.start === 0);
  if (firstClip) drawClip(ctx, firstClip, 0, renderWidth, renderHeight, project.backgroundColor);

  // Set up video stream from canvas
  const videoStream = canvas.captureStream(renderFps);

  // Set up audio — SILENT render
  onProgress?.({ stage: 'Loading audio', progress: 0.12 });
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioContextClass();
  const audioDest = audioCtx.createMediaStreamDestination();

  let audioBufferSource: AudioBufferSourceNode | null = null;
  try {
    const audioResp = await fetch(project.audio.url);
    const audioArrBuf = await audioResp.arrayBuffer();
    const decoded = await audioCtx.decodeAudioData(audioArrBuf.slice(0));
    audioBufferSource = audioCtx.createBufferSource();
    audioBufferSource.buffer = decoded;
    const gain = audioCtx.createGain();
    gain.gain.value = project.audio.volume;
    audioBufferSource.connect(gain);
    gain.connect(audioDest);
  } catch (e) {
    console.warn('Failed to load audio for video:', e);
  }

  const combinedStream = new MediaStream();
  videoStream.getVideoTracks().forEach((t) => combinedStream.addTrack(t));
  audioDest.stream.getAudioTracks().forEach((t) => combinedStream.addTrack(t));

  // Choose MIME type — prefer MP4/H264 for compatibility
  const mimeCandidates = [
    'video/mp4;codecs=h264,aac',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  let mimeType = '';
  for (const c of mimeCandidates) {
    if (MediaRecorder.isTypeSupported(c)) {
      mimeType = c;
      break;
    }
  }
  if (!mimeType) mimeType = 'video/webm';

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: 3_000_000, // 3 Mbps — good quality, smaller file
      audioBitsPerSecond: 128_000,
    });
  } catch (e) {
    recorder = new MediaRecorder(combinedStream);
    mimeType = recorder.mimeType || 'video/webm';
  }

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const renderComplete = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      const type = mimeType.split(';')[0];
      const blob = new Blob(chunks, { type });
      resolve(blob);
    };
    recorder.onerror = (e) => reject(new Error(`Recorder error: ${e}`));
  });

  // Start playing video clips
  for (const p of prepared) {
    if (p.video) {
      try {
        p.video.muted = true;
        p.video.currentTime = 0;
        await p.video.play().catch(() => {});
      } catch (e) { /* ignore */ }
    }
  }

  onProgress?.({ stage: 'Rendering video...', progress: 0.15 });
  recorder.start(200);

  if (audioBufferSource) {
    try { audioBufferSource.start(); } catch (e) { /* ignore */ }
  }

  // Render frame by frame
  const startWallTime = performance.now();
  const totalMs = project.totalDuration * 1000;

  await new Promise<void>((resolve) => {
    const renderFrame = () => {
      const elapsed = performance.now() - startWallTime;
      const t = elapsed / 1000;
      if (t >= project.totalDuration) {
        resolve();
        return;
      }
      const active = prepared.find(
        (p) => t >= p.clip.start && t < p.clip.start + p.clip.duration
      );
      if (active) {
        drawClip(ctx, active, t, renderWidth, renderHeight, project.backgroundColor);
      } else {
        ctx.fillStyle = project.backgroundColor;
        ctx.fillRect(0, 0, renderWidth, renderHeight);
      }
      if (onProgress) {
        onProgress({ stage: 'Rendering video...', progress: 0.15 + 0.8 * (elapsed / totalMs) });
      }
      requestAnimationFrame(renderFrame);
    };
    requestAnimationFrame(renderFrame);
  });

  await new Promise((r) => setTimeout(r, 200));

  try { recorder.stop(); } catch (e) { /* ignore */ }
  try { if (audioBufferSource) audioBufferSource.stop(); } catch (e) { /* ignore */ }
  try { videoStream.getTracks().forEach((t) => t.stop()); } catch (e) { /* ignore */ }
  try { audioCtx.close(); } catch (e) { /* ignore */ }

  const blob = await renderComplete;
  onProgress?.({ stage: 'Done', progress: 1 });
  return blob;
}

export function getSupportedMimeType(): string {
  const candidates = [
    'video/mp4;codecs=h264,aac',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return 'video/webm';
}

export function isMp4Supported(): boolean {
  return MediaRecorder.isTypeSupported('video/mp4;codecs=h264,aac');
}
