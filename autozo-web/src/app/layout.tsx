import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import React from 'react';
import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';
import { CatalogProvider } from '../context/CatalogContext';
import { LanguageProvider } from '../context/LanguageContext';
import { SlotProvider } from '../context/SlotContext';
import { SettingsProvider } from '../context/SettingsContext';
import { WishlistProvider } from '../context/WishlistContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { BottomNav } from '../components/BottomNav';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { LocationGate } from '../components/LocationGate';
import { OrderProgressToast } from '../components/OrderProgressToast';
import { PushRegister } from '../components/PushRegister';
import { PwaRegister } from '../components/PwaRegister';
import { RateOrderPrompt } from '../components/RateOrderPrompt';
import { API_URL } from '../lib/config';

/** The API (and its photos) live on another host; opening that connection early saves a round trip. */
const API_ORIGIN = (() => {
  try {
    return new URL(API_URL).origin;
  } catch {
    return null;
  }
})();

/**
 * Plus Jakarta Sans, served from our own origin rather than Google's. It
 * removes a third-party round trip on first paint, keeps the build working
 * without network access to fonts.googleapis.com, and means no visitor data
 * leaves to a font CDN.
 */
const sans = localFont({
  src: './fonts/PlusJakartaSans-Variable.woff2',
  weight: '200 800',
  style: 'normal',
  display: 'swap',
  variable: '--font-sans',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const metadata: Metadata = {
  title: { default: 'Autozo — groceries in minutes', template: '%s · Autozo' },
  description:
    'Order groceries, fruits, vegetables and daily essentials from shops near you in Robertsganj. Delivered in minutes.',
  manifest: '/manifest.json',
  icons: { icon: '/icons/icon-32.png', apple: '/icons/icon-180.png' },
  appleWebApp: { capable: true, title: 'Autozo', statusBarStyle: 'black-translucent' },
  openGraph: {
    title: 'Autozo — groceries in minutes',
    description: 'Everyday essentials from shops in your neighbourhood.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffc61a' },
    { media: '(prefers-color-scheme: dark)', color: '#0b2a1a' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * Applies the saved theme before first paint. Without this the page renders
 * light and then flips, which is the most obvious tell of a bolted-on theme.
 */
const THEME_BOOT = `(function(){try{var t=localStorage.getItem('autozo_theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {API_ORIGIN ? <link rel="preconnect" href={API_ORIGIN} crossOrigin="anonymous" /> : null}
        {/* Photos load without CORS, which browsers send over a separate connection. */}
        {API_ORIGIN ? <link rel="preconnect" href={API_ORIGIN} /> : null}
      </head>
      <body>
        <a href="#main" className="sr-only">
          Skip to content
        </a>
        <ThemeProvider>
          <AuthProvider>
            <SettingsProvider>
             <LanguageProvider>
              <SlotProvider>
              <CatalogProvider>
                <CartProvider>
                 <WishlistProvider>
                  <ToastProvider>
                    <Header />
                    <LocationGate />
                    <main id="main" style={{ minHeight: '60vh' }}>
                      {children}
                    </main>
                    <Footer />
                    <BottomNav />
                    <OrderProgressToast />
                    <RateOrderPrompt />
                    <PwaRegister />
                    <PushRegister />
                  </ToastProvider>
                 </WishlistProvider>
                </CartProvider>
              </CatalogProvider>
              </SlotProvider>
             </LanguageProvider>
            </SettingsProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
