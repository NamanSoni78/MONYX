import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://monyx.namansoni.in'),
  title: 'Monyx Mobile Audio Editor',
  description: 'Client-side multitrack audio editor optimized for mobile. Create, import, and manage audio projects.',
  keywords: ['audio editor', 'multitrack', 'mobile audio editor', 'DAW', 'music production', 'Monyx'],
  authors: [{ name: 'Naman Soni', url: 'https://namansoni.in' }],
  creator: 'Naman Soni',
  publisher: 'Naman Soni',
  openGraph: {
    title: 'Monyx Mobile Audio Editor',
    description: 'Client-side multitrack audio editor optimized for mobile. Create, import, and manage audio projects.',
    url: 'https://monyx.namansoni.in',
    siteName: 'Monyx',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Monyx Mobile Audio Editor',
    description: 'Client-side multitrack audio editor optimized for mobile. Create, import, and manage audio projects.',
    creator: '@NamanSoni',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
