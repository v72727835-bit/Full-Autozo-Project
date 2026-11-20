'use client';

import { useEffect } from 'react';
import { syncBrandTheme } from '../lib/remoteTheme';

/** Keeps the site's colours in step with what the super admin chose. Renders nothing. */
export function BrandThemeSync() {
  useEffect(() => {
    void syncBrandTheme();
  }, []);
  return null;
}
