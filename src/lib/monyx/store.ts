'use client';

import { generateId } from '@/lib/monyx/utils';
import { create } from 'zustand';
import { Clip, EffectType, ProjectData, Track } from './types';

interface EditorState {
  project: ProjectData | null;
  history: ProjectData[];
  future: ProjectData[];
  setProject: (project: ProjectData) => void;
  update: (updater: (project: ProjectData) => ProjectData) => void;
  updateTransient: (updater: (project: ProjectData) => ProjectData) => void;
  undo: () => void;
  redo: () => void;
  addTrack: () => void;
  deleteTrack: (trackId: string) => void;
  addClip: (trackId: string, clip: Clip) => void;
  splitClip: (trackId: string, clipId: string, time: number) => void;
  trimClip: (trackId: string, clipId: string, newStart: number, newEnd: number) => void;
  setClipRegion: (trackId: string, clipId: string, startOffset: number, endOffset: number) => void;
  duplicateClip: (trackId: string, clipId: string) => void;
  deleteClip: (trackId: string, clipId: string) => void;
  moveClip: (trackId: string, clipId: string, start: number) => void;
  reverseClip: (trackId: string, clipId: string) => void;
  normalizeClip: (trackId: string, clipId: string) => void;
  addEffect: (trackId: string, type: EffectType) => void;
  removeEffect: (trackId: string, effectId: string) => void;
  updateEffectParam: (trackId: string, effectId: string, params: Record<string, number>, wet?: number) => void;
}

const colors = ['#7b3fe4', '#ca4af1', '#2bc7da', '#59d98e', '#f67d7d'];

const pushHistory = (state: EditorState) => {
  if (!state.project) return state;
  return {
    history: [...state.history, structuredClone(state.project)].slice(-80),
    future: [],
  };
};

export const useEditorStore = create<EditorState>((set, get) => ({
  project: null,
  history: [],
  future: [],
  setProject: (project) => set({ project, history: [], future: [] }),
  update: (updater) =>
    set((state) => {
      if (!state.project) return state;
      const historyPart = pushHistory(state as EditorState);
      return {
        ...historyPart,
        project: updater(structuredClone(state.project)),
      };
    }),
  updateTransient: (updater) =>
    set((state) => {
      if (!state.project) return state;
      // No history push for transient updates (like zoom/scroll)
      return {
        project: updater(structuredClone(state.project)),
      };
    }),
  undo: () =>
    set((state) => {
      if (!state.history.length || !state.project) return state;
      const prev = state.history[state.history.length - 1];
      return {
        project: prev,
        history: state.history.slice(0, -1),
        future: [structuredClone(state.project), ...state.future],
      };
    }),
  redo: () =>
    set((state) => {
      if (!state.future.length || !state.project) return state;
      const next = state.future[0];
      return {
        project: next,
        history: [...state.history, structuredClone(state.project)],
        future: state.future.slice(1),
      };
    }),
  addTrack: () =>
    get().update((project) => {
      project.tracks.push({
        id: generateId(),
        name: `Track ${project.tracks.length + 1}`,
        color: colors[project.tracks.length % colors.length],
        mute: false,
        solo: false,
        locked: false,
        volume: 1,
        pan: 0,
        order: project.tracks.length,
        clips: [],
        effects: [],
        automation: { volume: [], pan: [] },
      });
      return project;
    }),
  deleteTrack: (trackId) =>
    get().update((project) => {
      project.tracks = project.tracks.filter((t) => t.id !== trackId);
      return project;
    }),
  addClip: (trackId, clip) =>
    get().update((project) => {
      const track = project.tracks.find((t) => t.id === trackId);
      track?.clips.push(clip);
      return project;
    }),
  splitClip: (trackId, clipId, time) =>
    get().update((project) => {
      const track = project.tracks.find((t) => t.id === trackId);
      if (!track) return project;
      const index = track.clips.findIndex((c) => c.id === clipId);
      if (index < 0) return project;
      const clip = track.clips[index];
      if (time <= clip.start + 0.01 || time >= clip.start + clip.duration - 0.01) return project;
      const leftDur = time - clip.start;
      const rightDur = clip.duration - leftDur;
      track.clips.splice(index, 1,
        { ...clip, id: generateId(), duration: leftDur },
        { ...clip, id: generateId(), start: time, offset: clip.offset + leftDur, duration: rightDur },
      );
      return project;
    }),
  trimClip: (trackId, clipId, newStart, newEnd) =>
    get().update((project) => {
      const clip = project.tracks.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId);
      if (!clip) return project;

      // Ensure min duration 0.05
      if (newEnd - newStart < 0.05) return project;

      // Check if start changed (trimming from left)
      if (Math.abs(newStart - clip.start) > 0.001) {
          const diff = newStart - clip.start;
          clip.offset += diff;
          clip.start = newStart;
          clip.duration -= diff;
      } else {
          // Trimming from right (changing duration)
          const newDuration = newEnd - clip.start;
          clip.duration = newDuration;
      }

      return project;
    }),
  setClipRegion: (trackId, clipId, startOffset, endOffset) =>
    get().update((project) => {
      const clip = project.tracks.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId);
      if (!clip) return project;

      if (endOffset - startOffset < 0.05) return project;

      clip.offset = startOffset;
      clip.duration = endOffset - startOffset;
      return project;
    }),
  duplicateClip: (trackId, clipId) =>
    get().update((project) => {
      const track = project.tracks.find((t) => t.id === trackId);
      const clip = track?.clips.find((c) => c.id === clipId);
      if (!track || !clip) return project;
      track.clips.push({
          ...clip,
          id: generateId(),
          start: clip.start + clip.duration,
          name: `${clip.name} (Copy)`
      });
      return project;
    }),
  deleteClip: (trackId, clipId) =>
    get().update((project) => {
      const track = project.tracks.find((t) => t.id === trackId);
      if (!track) return project;
      track.clips = track.clips.filter((c) => c.id !== clipId);
      return project;
    }),
  moveClip: (trackId, clipId, start) =>
    get().update((project) => {
      const clip = project.tracks.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId);
      if (!clip) return project;
      clip.start = Math.max(0, start);
      return project;
    }),
  reverseClip: (trackId, clipId) =>
    get().update((project) => {
      const clip = project.tracks.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId);
      if (clip) clip.reverse = !clip.reverse;
      return project;
    }),
  normalizeClip: (trackId, clipId) =>
    get().update((project) => {
      const clip = project.tracks.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId);
      if (clip) clip.gain = 1;
      return project;
    }),
  addEffect: (trackId, type) =>
    get().update((project) => {
      const track = project.tracks.find((t) => t.id === trackId);
      if (!track) return project;
      track.effects.push({ id: generateId(), type, enabled: true, wet: 0.6, params: {} });
      return project;
    }),
  removeEffect: (trackId, effectId) =>
    get().update((project) => {
      const track = project.tracks.find((t) => t.id === trackId);
      if (!track) return project;
      track.effects = track.effects.filter((e) => e.id !== effectId);
      return project;
    }),
  updateEffectParam: (trackId, effectId, params, wet) =>
    get().update((project) => {
      const track = project.tracks.find((t) => t.id === trackId);
      const effect = track?.effects.find((e) => e.id === effectId);
      if (!effect) return project;

      if (wet !== undefined) effect.wet = wet;
      effect.params = { ...effect.params, ...params };
      return project;
    }),
}));
