import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import './roadmap.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Word Archive',
  description: 'Keep the words spoken over you, exactly as given.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
  appleWebApp: { capable: true, title: 'Word Archive', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = { themeColor: '#0b0f17', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
