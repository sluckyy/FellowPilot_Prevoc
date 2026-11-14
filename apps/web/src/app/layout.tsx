import type { Metadata, Viewport } from 'next';
import { BRAND } from '@/brand/generated/brand';
import { fontClassName } from '@/brand/generated/fonts';
import { canReview, currentUser } from '@/lib/auth';
import { TopBar } from '@/components/TopBar';
import { Background } from '@/components/Background';
import './brand.css';
import './globals.css';

// Name, icons, colours and fonts all come from the brand file (brand/<brand>/brand.json via scripts/apply-brand.mjs).

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s – ${BRAND.name}` },
  description: BRAND.productLine,
  applicationName: BRAND.name,
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      ...(BRAND.faviconSvg ? [{ url: BRAND.faviconSvg, type: 'image/svg+xml' }] : []),
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, title: BRAND.shortName, statusBarStyle: 'default' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: BRAND.themeColor.light },
    { media: '(prefers-color-scheme: dark)', color: BRAND.themeColor.dark },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser().catch(() => null);
  return (
    <html lang="en-AU" className={fontClassName}>
      <body>
        <TopBar signedIn={!!user?.hasConsent} isAdmin={!!user?.roles.includes('admin')} isReviewer={!!user?.hasConsent && canReview(user)} />
        <main className="shell">{children}</main>
        <Background signedIn={!!user?.hasConsent} />
      </body>
    </html>
  );
}
