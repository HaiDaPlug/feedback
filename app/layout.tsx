import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { brand } from '@/lib/brand';
import './globals.css';

// Inter is the brand typeface. next/font downloads it at build time and serves
// it from this origin, so participant pages still make no third-party request.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: `${brand.name} ${brand.productName}`,
  description: `Anonymous event feedback for ${brand.name}.`,
  // The whole app is private: the dashboard is authenticated and participant
  // forms are unguessable links that must not be indexed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom is deliberately NOT disabled -- capping it is an accessibility
  // failure. Inputs use 16px type instead, which stops iOS zoom-on-focus.
  viewportFit: 'cover',
  themeColor: brand.colors.primary,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
