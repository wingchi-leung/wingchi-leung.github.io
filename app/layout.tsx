import './globals.css';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import Navigation from '@/components/Navigation';

const wordmarkFont = localFont({
  src: '../public/fonts/bubble-inlie.ttf',
  display: 'swap',
  variable: '--font-wordmark-loaded',
});

const taglineFont = localFont({
  src: '../public/fonts/agrandir-narrow.otf',
  display: 'swap',
  variable: '--font-tagline-loaded',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || 'https://your-username.github.io';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Blog | 路边广播', template: '%s | 路边广播' },
  description: '路边广播 - 个人博客，记录与分享',
  openGraph: {
    title: 'Blog | 路边广播',
    description: '路边广播 - 个人博客，记录与分享',
    url: siteUrl,
    siteName: '路边广播',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blog | 路边广播',
    description: '路边广播 - 个人博客，记录与分享',
  },
  alternates: { canonical: siteUrl },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${wordmarkFont.variable} ${taglineFont.variable}`}>
      <head>
        <link rel="icon" href="/favicon.png" type="image/png" />
      </head>
      <body>
        <a className="skip-link" href="#main-content">跳到正文</a>
        <Navigation />
        <main id="main-content" className="site-main">
          {children}
        </main>
      </body>
    </html>
  );
}
