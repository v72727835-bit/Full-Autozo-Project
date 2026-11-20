"use client";

import { useEffect } from 'react';
import { syncTheme } from '../lib/remoteTheme';

/** Keeps the panel's colours in step with what the super admin chose. Renders nothing. */
export default function ThemeSync() {
  useEffect(() => {
    void syncTheme();
  }, []);
  return null;
}
