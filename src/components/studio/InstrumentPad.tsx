'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Piano as PianoIcon,
  Drum,
  Guitar,
  Music4,
  Mic,
  Square,
  Play,
  Pause,
  Download,
  Timer,
  Settings,
} from 'lucide-react';
import {
  playPiano,
  playKick,
  playSnare,
  playHihat,
  playClap,
  playTom,
  playGuitar,
  playBass,
  playPad,
  playSynth,
  playStrings,
  startMetronome,
  resumeAudioContext,
  getRecordingStream,
  setInstrumentVolume,
  getSharedAudioContext,
} from '@/lib/audio/virtualInstruments';
import { float32ArrayToWavBlob } from '@/lib/audio/wavUtils';

type Instrument = 'piano' | 'drums' | 'guitar' | 'bass' | 'pad' | 'synth' | 'strings';

const PIANO_KEYS = [
  { note: 'C', type: 'white' },
  { note: 'C#', type: 'black' },
  { note: 'D', type: 'white' },
  { note: 'D#', type: 'black' },
  { note: 'E', type: 'white' },
  { note: 'F', type: 'white' },
  { note: 'F#', type: 'black' },
  { note: 'G', type: 'white' },
  { note: 'G#', type: 'black' },
  { note: 'A', type: 'white' },
  { note: 'A#', type: 'black' },
  { note: 'B', type: 'white' },
];

const DRUM_PADS = [
  { name: 'Kick', icon: '🥁', play: playKick, color: 'from-red-500 to-red-700' },
  { name: 'Snare', icon: '🪘', play: playSnare, color: 'from-orange-500 to-orange-700' },
  { name: 'Hi-Hat', icon: '🎩', play: () => playHihat(false), color: 'from-yellow-500 to-yellow-700' },
  { name: 'Open Hat', icon: '🎩', play: () => playHihat(true), color: 'from-lime-500 to-lime-700' },
  { name: 'Clap', icon: '👏', play: playClap, color: 'from-green-500 to-green-700' },
  { name: 'Tom Low', icon: '🛢️', play: () => playTom(80), color: 'from-teal-500 to-teal-700' },
  { name: 'Tom Mid', icon: '🛢️', play: () => playTom(120), color: 'from-cyan-500 to-cyan-700' },
  { name: 'Tom High', icon: '🛢️', play: () => playTom(180), color: 'from-blue-500 to-blue-700' },
  { name: 'Kick+Snare', icon: '⚡', play: () => { playKick(); setTimeout(() => playSnare(), 100); }, color: 'from-purple-500 to-purple-700' },
];

export function InstrumentPad({ onExit }: { onExit: () => void }) {
  const [instrument, setInstrument] = useState<Instrument>('piano');
  const [octave, setOctave] = useState(4);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const [bpm, setBpm] = useState(90);
  const [recentNotes, setRecentNotes] = useState<string[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const stopMetronomeRef = useRef<(() => void) | null>(null);

  const stopAll = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch (e) { /* ignore */ }
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (stopMetronomeRef.current) {
      stopMetronomeRef.current();
      stopMetronomeRef.current = null;
    }
  };

  useEffect(() => {
    resumeAudioContext();
    return () => {
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerNote = (note: string) => {
    resumeAudioContext();
    switch (instrument) {
      case 'piano':
        playPiano(note, octave);
        break;
      case 'guitar':
        playGuitar(note, octave);
        break;
      case 'bass':
        playBass(note, octave - 2);
        break;
      case 'pad':
        playPad(note, octave);
        break;
      case 'synth':
        playSynth(note, octave);
        break;
      case 'strings':
        playStrings(note, octave);
        break;
    }
    setRecentNotes((prev) => [...prev.slice(-7), note]);
  };

  const toggleRecording = async () => {
    if (isRecording) {
      stopAll();
      setIsRecording(false);
      return;
    }
    resumeAudioContext();
    try {
      // Get the recording stream that taps the master instrument output
      const stream = getRecordingStream();
      const mimeType = getRecordingMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 192000 });
      } catch (e) {
        recorder = new MediaRecorder(stream);
      }
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setRecordingBlob(blob);
      };
      recorder.start(100);
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch (e) {
      alert(`Failed to start recording: ${e}`);
    }
  };

  const toggleMetronome = async () => {
    if (isMetronomeOn) {
      if (stopMetronomeRef.current) {
        stopMetronomeRef.current();
        stopMetronomeRef.current = null;
      }
      setIsMetronomeOn(false);
    } else {
      // Ensure AudioContext is running before starting metronome
      resumeAudioContext();
      const ctx = getSharedAudioContext();
      if (ctx.state !== 'running') {
        await ctx.resume();
        await new Promise((r) => setTimeout(r, 100));
      }
      stopMetronomeRef.current = startMetronome(bpm, 4);
      setIsMetronomeOn(true);
    }
  };

  useEffect(() => {
    if (isMetronomeOn && stopMetronomeRef.current) {
      stopMetronomeRef.current();
      stopMetronomeRef.current = startMetronome(bpm, 4);
    }
  }, [bpm, isMetronomeOn]);

  const getRecordingMimeType = (): string => {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) return c;
    }
    return 'audio/webm';
  };

  const download = (blob: Blob, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  };

  return (
    <main className="min-h-screen bg-[#0d0718] text-[#f0e9ff]">
      <div className="mx-auto max-w-md px-4 py-4 pb-32">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => { stopAll(); onExit(); }}
            className="w-9 h-9 rounded-full bg-[#1a0f2e] hover:bg-[#2e1d52] flex items-center justify-center"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Instrument Pad</h1>
            <p className="text-[10px] text-[#bca9dd]">Play live instruments and record your performance.</p>
          </div>
        </div>

        {/* Instrument selector */}
        <div className="grid grid-cols-7 gap-1.5 mb-4">
          {([
            { id: 'piano', label: 'Piano', icon: PianoIcon },
            { id: 'drums', label: 'Drums', icon: Drum },
            { id: 'guitar', label: 'Guitar', icon: Guitar },
            { id: 'bass', label: 'Bass', icon: Music4 },
            { id: 'synth', label: 'Synth', icon: Music4 },
            { id: 'strings', label: 'Strings', icon: Music4 },
            { id: 'pad', label: 'Pad', icon: Music4 },
          ] as const).map((i) => {
            const Icon = i.icon;
            return (
              <button
                key={i.id}
                onClick={() => setInstrument(i.id)}
                className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-medium transition-all ${instrument === i.id ? 'bg-[#7b3fe4] text-white shadow-[0_0_15px_rgba(123,63,228,0.4)]' : 'bg-[#1a0f2e] text-[#bca9dd] hover:bg-[#23153c]'}`}
              >
                <Icon size={16} />
                {i.label}
              </button>
            );
          })}
        </div>

        {/* Recent notes */}
        <div className="bg-[#1a0f2e] rounded-lg p-2 mb-4 h-8 flex items-center gap-1 overflow-hidden">
          {recentNotes.length === 0 ? (
            <span className="text-[10px] text-[#5f4b86]">Played notes will appear here...</span>
          ) : (
            recentNotes.map((n, i) => (
              <span
                key={i}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[#2e1d52] text-[#bca9dd]"
              >
                {n}
              </span>
            ))
          )}
        </div>

        {/* Octave selector for melodic instruments */}
        {instrument !== 'drums' && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-[#bca9dd]">Octave:</span>
            <button
              onClick={() => setOctave(Math.max(1, octave - 1))}
              className="w-7 h-7 rounded bg-[#2e1d52] hover:bg-[#3f2a66] text-xs"
            >
              -
            </button>
            <span className="text-sm font-mono w-6 text-center">{octave}</span>
            <button
              onClick={() => setOctave(Math.min(7, octave + 1))}
              className="w-7 h-7 rounded bg-[#2e1d52] hover:bg-[#3f2a66] text-xs"
            >
              +
            </button>
          </div>
        )}

        {/* Instrument UI */}
        {instrument === 'drums' ? (
          <div className="grid grid-cols-3 gap-2">
            {DRUM_PADS.map((pad) => (
              <motion.button
                key={pad.name}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  resumeAudioContext();
                  pad.play();
                  setRecentNotes((prev) => [...prev.slice(-7), pad.name]);
                }}
                className={`aspect-square rounded-xl bg-gradient-to-br ${pad.color} flex flex-col items-center justify-center text-white shadow-lg`}
              >
                <div className="text-2xl mb-1">{pad.icon}</div>
                <div className="text-[10px] font-medium">{pad.name}</div>
              </motion.button>
            ))}
          </div>
        ) : (
          <div className="relative h-64 select-none">
            {/* Piano keyboard — white keys as flex row, black keys absolutely positioned on top */}
            <div className="relative h-full flex">
              {PIANO_KEYS.filter((k) => k.type === 'white').map((key) => (
                <button
                  key={key.note}
                  onPointerDown={(e) => { e.preventDefault(); triggerNote(key.note); }}
                  className="flex-1 bg-gradient-to-b from-white to-gray-200 hover:from-gray-100 hover:to-gray-300 active:from-[#7b3fe4] active:to-[#5a2eb8] active:text-white text-black rounded-b-lg flex items-end justify-center pb-2 text-[10px] font-semibold border-r border-gray-400 shadow-inner"
                >
                  {key.note}
                </button>
              ))}
            </div>
            {/* Black keys overlay (separate layer so white-key clicks pass through gaps) */}
            <div className="absolute top-0 left-0 right-0 h-36 pointer-events-none">
              {PIANO_KEYS.filter((k) => k.type === 'black').map((key) => {
                // Position black keys relative to the white keys (each white key is 1/7 of width)
                const positions: Record<string, string> = {
                  'C#': 'calc(14.28% - 12px)',
                  'D#': 'calc(28.57% - 12px)',
                  'F#': 'calc(57.14% - 12px)',
                  'G#': 'calc(71.43% - 12px)',
                  'A#': 'calc(85.71% - 12px)',
                };
                return (
                  <button
                    key={key.note}
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); triggerNote(key.note); }}
                    className="absolute top-0 w-6 h-full bg-gradient-to-b from-gray-900 to-black hover:from-gray-700 hover:to-gray-900 active:from-[#ca4af1] active:to-[#9333ea] rounded-b-lg text-white text-[8px] flex items-end justify-center pb-1 pointer-events-auto shadow-lg"
                    style={{ left: positions[key.note] }}
                  >
                    {key.note}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Metronome */}
        <div className="mt-4 bg-[#1a0f2e] rounded-xl p-3 flex items-center gap-3">
          <button
            onClick={toggleMetronome}
            className={`w-10 h-10 rounded-full flex items-center justify-center ${isMetronomeOn ? 'bg-[#2bc7da] text-white' : 'bg-[#2e1d52] text-[#bca9dd]'}`}
          >
            <Timer size={16} />
          </button>
          <div className="flex-1">
            <div className="text-xs text-[#bca9dd]">Metronome</div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={40}
                max={200}
                step={1}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="flex-1 accent-[#2bc7da]"
              />
              <span className="text-sm font-mono w-12 text-right">{bpm} BPM</span>
            </div>
          </div>
        </div>

        {/* Recording */}
        <div className="mt-3 bg-[#1a0f2e] rounded-xl p-3">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleRecording}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-600 animate-pulse shadow-[0_0_20px_rgba(220,38,38,0.6)]' : 'bg-[#7b3fe4] hover:bg-[#6a35c9]'}`}
            >
              {isRecording ? <Square size={18} fill="currentColor" /> : <Mic size={18} />}
            </button>
            <div className="flex-1">
              <div className="text-xs font-medium">
                {isRecording ? 'Recording...' : 'Record performance'}
              </div>
              <div className="text-[10px] text-[#bca9dd]">
                Records what you play into a downloadable audio file
              </div>
            </div>
          </div>
          {recordingBlob && !isRecording && (
            <div className="mt-3 space-y-2">
              <audio src={URL.createObjectURL(recordingBlob)} controls className="w-full" />
              <button
                onClick={() => download(recordingBlob, `instrument-recording-${Date.now()}.webm`)}
                className="w-full bg-[#7b3fe4] hover:bg-[#6a35c9] py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
              >
                <Download size={14} /> Download Recording
              </button>
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="mt-4 bg-[#1a0f2e] rounded-xl p-3 text-[10px] text-[#bca9dd] space-y-1">
          <div className="font-semibold text-white mb-1">Tips</div>
          <div>• Tap notes/drums to play — works on touch and mouse</div>
          <div>• Use the metronome to keep time</div>
          <div>• Record button captures everything you play</div>
          <div>• Try the Pad instrument for atmospheric chords</div>
        </div>
      </div>
    </main>
  );
}
