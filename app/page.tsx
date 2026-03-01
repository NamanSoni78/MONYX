'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Plus, Upload, FolderOpen, Trash2, Heart } from 'lucide-react';

import {
  createEmptyProject,
  deleteProject,
  getProjects,
  importMonyxProject,
  upsertProject,
} from '@/lib/projectManager';
import { ProjectMetadata } from '@/lib/types';

export default function HomePage() {
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [name, setName] = useState('My Mobile Mix');

  const load = async () => setProjects(await getProjects());
  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    try {
      const project = createEmptyProject(name.trim() || 'Untitled Project');
      await upsertProject(project);
      await load();
    } catch (e) {
      console.error("Failed to create project:", e);
      alert(`Failed to create project: ${e}`);
    }
  };

  return (
    <main className="min-h-screen bg-[#0d0718] p-4 text-[#f0e9ff]">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">Monyx Mobile Studio</h1>
        <p className="text-sm text-[#bca9dd]">Create, import, and manage .monyx projects from your phone.</p>
        <div className="rounded-xl bg-[#1a0f2e] p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded bg-[#2a1847] p-2"
            placeholder="Project name"
          />
          <div className="mt-2 flex gap-2">
            <button onClick={create} className="flex-1 rounded bg-[#7b3fe4] p-2 font-medium flex items-center justify-center gap-2 hover:bg-[#6a35c9] transition-colors"><Plus className="w-4 h-4" />
              Create Project
            </button>
            <label className="flex-1 cursor-pointer rounded bg-[#2e1d52] p-2 text-center flex items-center justify-center gap-2 hover:bg-[#3a2569] transition-colors"><Upload className="w-4 h-4" />
              Import .monyx
              <input
                type="file"
                accept=".monyx"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const project = await importMonyxProject(file);
                  await upsertProject(project);
                  load();
                }}
              />
            </label>
          </div>
        </div>

        <div className="space-y-2">
          {projects.map((project) => (
            <motion.article initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} key={project.id} className="rounded-xl bg-[#1a0f2e] p-3 transition-colors hover:bg-[#23153c]">
              <div className="font-medium">{project.name}</div>
              <div className="text-xs text-[#bca9dd]">
                {project.tracks.length} tracks • Updated {new Date(project.updatedAt).toLocaleString()}
              </div>
              <div className="mt-2 flex gap-2">
                <Link href={`/editor/${project.id}`} className="flex-1 rounded bg-[#7b3fe4] p-2 text-center text-sm flex items-center justify-center gap-2 hover:bg-[#6a35c9] transition-colors"><FolderOpen className="w-4 h-4" />
                  Open
                </Link>
                <button
                  onClick={async () => {
                    await deleteProject(project.id);
                    load();
                  }}
                  className="rounded bg-red-700 px-3 text-sm flex items-center justify-center gap-2 hover:bg-red-800 transition-colors" title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.article>
          ))}
        </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-8 pb-8 text-center text-sm text-[#bca9dd] flex items-center justify-center gap-1">
        Made with <Heart className="w-4 h-4 text-red-500 fill-red-500" /> By Naman
      </motion.div>
      </motion.div>
    </main>
  );
}
