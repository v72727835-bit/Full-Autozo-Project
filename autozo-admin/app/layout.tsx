import type { Metadata } from 'next';
import React from 'react';
import ThemeSync from '../src/components/ThemeSync';
import { AuthProvider } from '../src/context/AuthContext';
import '../src/styles.css';

export const metadata: Metadata = {
  title: 'autozo Admin',
  description: 'autozo super admin panel',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ThemeSync />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}