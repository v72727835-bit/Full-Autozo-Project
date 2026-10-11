import type { Metadata } from 'next';
import React from 'react';
import { AuthProvider } from '../src/context/AuthContext';
import '../src/styles.css';

export const metadata: Metadata = {
  title: 'Autozo Admin',
  description: 'Autozo super admin panel',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}