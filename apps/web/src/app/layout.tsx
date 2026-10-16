import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Juma Food Products',
  description: 'Sales & distribution operations for Juma Food Products, Gujarat',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom stays available; inputs are 16px on mobile so focusing one does
  // not trigger iOS auto-zoom.
  maximumScale: 5,
  themeColor: '#1a6b4f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
