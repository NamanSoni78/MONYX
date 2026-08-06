'use client';

import { useState } from 'react';
import { HomeHub } from '@/components/home/HomeHub';
import { EditorView } from '@/components/monyx/EditorView';
import { KaraokeStudio } from '@/components/sing/KaraokeStudio';
import { VocalRemover } from '@/components/separate/VocalRemover';
import { InstrumentPad } from '@/components/studio/InstrumentPad';
import { VideoMaker } from '@/components/video/VideoMaker';

export type AppSection = 'home' | 'editor' | 'sing' | 'separate' | 'studio' | 'video';

export default function Home() {
  const [section, setSection] = useState<AppSection>('home');

  const handleNavigate = (s: AppSection) => setSection(s);
  const handleExit = () => setSection('home');

  if (section === 'home') {
    return <HomeHub onNavigate={handleNavigate} />;
  }
  if (section === 'editor') {
    return <EditorView projectId={null} onExit={handleExit} />;
  }
  if (section === 'sing') {
    return <KaraokeStudio onExit={handleExit} />;
  }
  if (section === 'separate') {
    return <VocalRemover onExit={handleExit} />;
  }
  if (section === 'studio') {
    return <InstrumentPad onExit={handleExit} />;
  }
  if (section === 'video') {
    return <VideoMaker onExit={handleExit} />;
  }
  return <HomeHub onNavigate={handleNavigate} />;
}
