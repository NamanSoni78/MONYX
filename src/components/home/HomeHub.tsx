'use client';

import { motion } from 'framer-motion';
import {
  Music,
  Mic,
  Scissors,
  Piano,
  Video,
  Heart,
  Sparkles,
} from 'lucide-react';
import { AppSection } from '@/app/page';

interface HomeHubProps {
  onNavigate: (section: AppSection) => void;
}

const sections: {
  id: AppSection;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  gradient: string;
  iconColor: string;
}[] = [
  {
    id: 'editor',
    title: 'Multitrack Editor',
    description: 'Full DAW with timeline, FX rack, mixer. Original Monyx studio.',
    icon: Music,
    gradient: 'from-[#7b3fe4] to-[#ca4af1]',
    iconColor: 'text-white',
  },
  {
    id: 'sing',
    title: 'Karaoke Studio',
    description: 'Upload song → trim → extract BGM with AI → sing along → merge clean vocal + BGM.',
    icon: Mic,
    gradient: 'from-[#2bc7da] to-[#59d98e]',
    iconColor: 'text-white',
  },
  {
    id: 'separate',
    title: 'Vocal Remover (AI)',
    description: 'Extract vocals or instrumental from any song using the MDX-Net KARA 2 AI model. 100% in your browser.',
    icon: Scissors,
    gradient: 'from-[#f67d7d] to-[#ca4af1]',
    iconColor: 'text-white',
  },
  {
    id: 'studio',
    title: 'Instrument Pad',
    description: 'Play piano, guitar, drums, bass, pad live in the browser. Record your performance.',
    icon: Piano,
    gradient: 'from-[#fbbf24] to-[#f67d7d]',
    iconColor: 'text-white',
  },
  {
    id: 'video',
    title: 'Video Maker',
    description: 'Combine images/videos with your audio track → MP4 video with text overlays & fades.',
    icon: Video,
    gradient: 'from-[#a78bfa] to-[#2bc7da]',
    iconColor: 'text-white',
  },
];

export function HomeHub({ onNavigate }: HomeHubProps) {
  return (
    <main className="min-h-screen bg-[#0d0718] text-[#f0e9ff]">
      <div className="mx-auto max-w-md px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 text-center"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1a0f2e] border border-[#2e1d52] text-[10px] text-[#bca9dd] mb-3">
            <Sparkles className="w-3 h-3 text-[#ca4af1]" />
            <span>All-in-one mobile music studio</span>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#7b3fe4] via-[#ca4af1] to-[#2bc7da] bg-clip-text text-transparent">
            Monyx Studio
          </h1>
          <p className="text-sm text-[#bca9dd] mt-1.5 max-w-xs mx-auto">
            Sing. Separate. Play. Mix. Make videos. All in your browser.
          </p>
        </motion.div>

        <div className="space-y-3">
          {sections.map((s, idx) => {
            const Icon = s.icon;
            return (
              <motion.button
                key={s.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.06 }}
                onClick={() => onNavigate(s.id)}
                className="group w-full text-left rounded-2xl bg-[#1a0f2e] border border-[#2e1d52] p-4 hover:border-[#7b3fe4]/60 hover:bg-[#23153c] transition-all hover:shadow-[0_0_25px_rgba(123,63,228,0.15)]"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${s.gradient} flex items-center justify-center shadow-lg shrink-0`}
                  >
                    <Icon className={`${s.iconColor} w-6 h-6`} size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm text-white">{s.title}</h3>
                    <p className="text-xs text-[#bca9dd] mt-1 leading-snug">{s.description}</p>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-8 pb-8 text-center space-y-1"
        >
          <div className="text-xs text-[#5f4b86] flex items-center justify-center gap-1">
            Made with <Heart className="w-3 h-3 text-red-500 fill-red-500" /> for future singer
          </div>
          <div className="text-[10px] text-[#5f4b86]">Made by Naman</div>
        </motion.div>
      </div>
    </main>
  );
}
