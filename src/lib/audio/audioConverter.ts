'use client';

import { exportProjectMp3 } from './mp3Exporter';

// Convert any WAV blob to MP3 using the existing mp3-worker.js
// Falls back to WAV if MP3 encoding fails.
export async function wavToMp3(wavBlob: Blob, bitrate: number = 192): Promise<Blob> {
  try {
    return await exportProjectMp3(wavBlob, bitrate);
  } catch (e) {
    console.warn('MP3 conversion failed, returning WAV:', e);
    return wavBlob;
  }
}

// Get file extension for a blob based on its type
export function getAudioExtension(blob: Blob): string {
  if (blob.type.includes('mp3')) return 'mp3';
  if (blob.type.includes('wav')) return 'wav';
  if (blob.type.includes('webm')) return 'webm';
  if (blob.type.includes('ogg')) return 'ogg';
  if (blob.type.includes('mp4')) return 'm4a';
  return 'mp3';
}
