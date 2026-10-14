# Monyx Studio

[![Live Demo](https://img.shields.io/badge/Live%20Demo-monyx.namansoni.in-7b3fe4?style=for-the-badge&logo=vercel)](https://monyx.namansoni.in)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com/)

**Monyx Studio** is an all-in-one, browser-based digital audio workstation (DAW) and mobile-friendly music production suite. Sing, separate stems with browser-side AI, play virtual instruments, mix multitrack audio, and generate videos—all without uploading your audio to external servers.

🔗 **Live Application:** [https://monyx.namansoni.in](https://monyx.namansoni.in)

---

## ✨ Features

- 🎛️ **Multitrack Editor (DAW)**
  - Full multitrack timeline with playback controls, mixer, zoom, and time navigation.
  - Trim, split, duplicate, reverse, normalize, and align audio clips smoothly.
  - Effects rack support for track-level audio manipulation.

- 🎤 **Karaoke Studio**
  - Sing along with your favorite backing tracks directly in the browser.
  - Trim audio, extract vocals, record live input, adjust timing/gain, and render polished recordings.

- ✂️ **In-Browser AI Vocal Remover**
  - Separate song stems into isolated **Vocals** and **Instrumentals (BGM)** using the MDX-Net KARA 2 ONNX model.
  - **100% Client-Side Privacy**: Runs locally using ONNX Runtime Web & WebAssembly—your audio files never leave your device.

- 🎹 **Instrument Pad & Virtual Instruments**
  - Play interactive instruments live in the browser (Piano, Guitar, Drums, Bass, Pad).
  - High-performance Web Audio synthesizers with live performance recording.

- 🎬 **Video Maker**
  - Pair your audio tracks with images, background video clips, text overlays, and fade effects.
  - Render MP4 video directly in the browser for instant sharing.

- 💾 **Export & Project Management**
  - Export custom tracks and master mixes to high-quality **MP3** or **WAV** format.
  - Persistent local project storage using IndexedDB (`idb-keyval`) and SQLite with Prisma.

---

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router), React 19
- **Language:** TypeScript
- **Styling & UI Components:** Tailwind CSS v4, Radix UI Primitives, Lucide Icons, Framer Motion
- **Audio Engine:** Web Audio API, Custom WAV & MP3 Processing (`lamejs`)
- **AI / Stem Separation:** ONNX Runtime Web (`onnxruntime-web`), MDX-Net KARA 2 Model
- **State Management:** Zustand
- **Database & Persistence:** Prisma ORM, SQLite, IndexedDB (`idb-keyval`)
- **Exporting Tools:** JSZip, Custom Video/Audio Canvas & Web Audio Recorders

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18.x or higher
- **npm** or **pnpm** or **yarn**

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/namansoni/monyx-studio.git
   cd monyx-studio
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL="file:./dev.db"
   ```

4. **Initialize Database:**
   Generate the Prisma client and push the schema to SQLite:
   ```bash
   npm run db:generate
   npm run db:push
   ```

5. **Start Development Server:**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser to view Monyx Studio.

---

## 📜 Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts local development server |
| `npm run build` | Builds the production bundle |
| `npm run start` | Starts the production server |
| `npm run lint` | Runs ESLint checks across the codebase |
| `npm run db:push` | Pushes Prisma schema changes directly to SQLite |
| `npm run db:generate` | Generates Prisma client artifacts |
| `npm run db:migrate` | Runs database migrations |
| `npm run db:reset` | Resets database schema and data |

---

## 🔒 Privacy & Performance

Monyx Studio performs processing client-side:
- **Audio Stem Separation** is executed locally inside your WebAssembly/WebGPU environment using ONNX Runtime Web.
- **Audio Processing & Recording** utilize native browser Web Audio API.
- Your uploaded music files and recordings remain strictly private on your device.

---

## 👤 Author

- **Naman Soni** – [monyx.namansoni.in](https://monyx.namansoni.in)
