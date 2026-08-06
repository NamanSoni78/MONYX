'use client';

import { get, set, del } from 'idb-keyval';
import JSZip from 'jszip';
import { generateId } from '@/lib/monyx/utils';
import { ProjectData, ProjectMetadata, ProjectAudioBuffer } from './types';

const PROJECTS_KEY = 'monyx-projects';

export async function getProjects(): Promise<ProjectMetadata[]> {
  return (await get<ProjectMetadata[]>(PROJECTS_KEY)) ?? [];
}

export async function loadProject(id: string): Promise<ProjectData | null> {
  const projects = await getProjects();
  const metadata = projects.find((p) => p.id === id);
  if (!metadata) return null;

  const buffers = await get<ProjectAudioBuffer[]>(`monyx-project-content-${id}`);
  return { ...metadata, buffers: buffers ?? [] };
}

export function createEmptyProject(name: string): ProjectData {
  return {
    id: generateId(),
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sampleRate: 44100,
    bpm: 120,
    markers: [],
    tracks: [
      {
        id: generateId(),
        name: 'Track 1',
        color: '#7b3fe4',
        mute: false,
        solo: false,
        locked: false,
        volume: 1,
        pan: 0,
        order: 0,
        clips: [],
        effects: [],
        automation: { volume: [], pan: [] },
      },
    ],
    buffers: [],
    loopRegion: { enabled: false, start: 0, end: 8 },
    timeline: { zoom: 30, snap: 0.25, playhead: 0 },
  };
}

export async function upsertProject(project: ProjectData) {
  const projects = await getProjects();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { buffers, ...metadata } = project;

  const next = projects.filter((p) => p.id !== project.id);
  next.unshift({ ...metadata, updatedAt: new Date().toISOString() });

  await set(PROJECTS_KEY, next);
  await set(`monyx-project-content-${project.id}`, buffers);
}

export async function deleteProject(projectId: string) {
  const projects = await getProjects();
  await set(PROJECTS_KEY, projects.filter((p) => p.id !== projectId));
  await del(`monyx-project-content-${projectId}`);
}

export async function exportMonyxProject(project: ProjectData): Promise<Blob> {
  const zip = new JSZip();
  const buffersFolder = zip.folder('buffers');

  if (buffersFolder) {
    for (const buffer of project.buffers) {
      buffersFolder.file(buffer.id, buffer.blob);
    }
  }

  // Create a copy of the project without blobs to store in JSON
  const projectJson = {
    ...project,
    buffers: project.buffers.map((b) => ({
      ...b,
      blob: undefined, // Remove blob from JSON
    })),
  };

  zip.file('project.json', JSON.stringify(projectJson));
  return zip.generateAsync({ type: 'blob' });
}

export async function importMonyxProject(file: File): Promise<ProjectData> {
  const zip = await JSZip.loadAsync(file);
  const json = await zip.file('project.json')?.async('text');
  if (!json) throw new Error('Invalid .monyx file');

  const parsed = JSON.parse(json);
  const projectBuffers: ProjectAudioBuffer[] = [];

  // Handle both old format (base64 in JSON) and new format (binary in zip)
  if (parsed.buffers && Array.isArray(parsed.buffers)) {
     // New format
     for (const b of parsed.buffers) {
       let blob: Blob | undefined;
       const fileInZip = zip.file(`buffers/${b.id}`);
       if (fileInZip) {
         blob = await fileInZip.async('blob');
       }

       if (blob) {
         // Migration: If duration is missing, set to 0 or try to approximate (or it will be undefined)
         // But types say it's mandatory. We should default to 0 and fix later if critical.
         // Actually, if it's undefined, it's just falsy.
         // Let's assume it's there or 0.
         projectBuffers.push({ ...b, duration: (b as any).duration || 0, blob });
       }
     }
  } else if (parsed.buffers && !Array.isArray(parsed.buffers)) {
      // Old format fallback (if we want to support it, strictly not needed but good practice)
      // The old format had `parsed.buffers` as Record<id, base64>
      // And `parsed.project.buffers` as metadata array
      // But here `parsed` IS the project object in new format.

      // Wait, old format structure:
      // zip.file('project.json', JSON.stringify({ version: '1.0', project: ..., buffers: ... }))
      // So parsed object has `project` and `buffers`.

      if (parsed.project && parsed.buffers) {
          const oldBuffers = parsed.buffers as Record<string, string>;
          const oldProject = parsed.project as ProjectData;
           for (const buffer of oldProject.buffers) {
               const base64 = oldBuffers[buffer.id];
               if (base64) {
                   const binary = atob(base64);
                   const bytes = new Uint8Array(binary.length);
                   for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                   projectBuffers.push({ ...buffer, blob: new Blob([bytes], { type: 'audio/wav' }) });
               }
           }
           // Use the old project structure
           return {
             ...oldProject,
             id: generateId(),
             name: `${oldProject.name} (Imported)`,
             buffers: projectBuffers,
             createdAt: new Date().toISOString(),
             updatedAt: new Date().toISOString(),
           };
      }
  }

  return {
    ...parsed,
    id: generateId(),
    name: `${parsed.name} (Imported)`,
    buffers: projectBuffers,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
