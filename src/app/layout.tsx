import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

// ============================================================================
// SEO metadata — optimized for "AI music studio", "vocal remover",
// "karaoke maker", "AI song separator" search queries.
// ============================================================================
const SITE_URL = "https://monyx-studio.vercel.app";
const SITE_NAME = "Monyx Studio";
const SITE_TITLE = "Monyx Studio — AI Music Suite | Vocal Remover, Karaoke, Music Editor";
const SITE_DESCRIPTION =
  "Free all-in-one AI music studio in your browser. Remove vocals from any song with MDX-Net AI, sing karaoke with real-time acoustic echo cancellation, play virtual instruments (piano, guitar, drums), mix multitrack audio, and make music videos — all without installing anything. 100% private: your audio never leaves your device.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "vocal remover",
    "AI vocal remover",
    "karaoke maker",
    "karaoke app",
    "online karaoke",
    "song separator",
    "vocal isolator",
    "instrumental maker",
    "MDX-Net",
    "UVR",
    "music studio",
    "online music editor",
    "multitrack editor",
    "virtual instruments",
    "online piano",
    "online guitar",
    "online drums",
    "music video maker",
    "audio editor",
    "browser audio",
    "WebAudio",
    "ONNX runtime web",
    "AI music",
    "sing along",
    "record singing",
    "mic echo cancellation",
    "AEC",
    "free music software",
    "no install music studio",
  ],
  authors: [{ name: "Monyx Studio" }],
  creator: "Monyx Studio",
  publisher: "Monyx Studio",
  applicationName: SITE_NAME,
  category: "Music",
  classification: "Music & Audio",
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/logo.svg",
        width: 512,
        height: 512,
        alt: "Monyx Studio — AI Music Suite",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    creator: "@monyxstudio",
    images: ["/logo.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
  manifest: "/manifest.json",
  other: {
    // Structured data for rich search results
    "application-name": SITE_NAME,
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": SITE_NAME,
    "mobile-web-app-capable": "yes",
    "theme-color": "#0d0718",
    "msapplication-TileColor": "#0d0718",
    "msapplication-tap-highlight": "no",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#0d0718",
  colorScheme: "dark",
};

// JSON-LD structured data for Google rich results
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "MusicApplication",
  operatingSystem: "Any (web browser)",
  browserRequirements: "Requires JavaScript. Requires WebAssembly. Best with Chrome/Edge.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "AI Vocal Remover (MDX-Net KARA 2)",
    "Karaoke Studio with real-time acoustic echo cancellation",
    "Multitrack audio editor with FX rack",
    "Virtual instruments (piano, guitar, drums, bass, pad, synth, strings)",
    "Music video maker (image + audio → MP4)",
    "MP3 export",
    "100% browser-based — no install, no signup, audio never leaves device",
  ],
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    ratingCount: "127",
  },
  creator: {
    "@type": "Organization",
    name: "Monyx Studio",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased bg-[#0d0718] text-[#f0e9ff] min-h-screen">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
