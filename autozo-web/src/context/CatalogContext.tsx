'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchHome } from '../api/catalog';
import { POINT_EVENT } from '../lib/deliveryPoint';
import { getErrorMessage } from '../lib/client';
import { Home } from '../lib/types';

/**
 * The home payload carries the storefront's shape — delivery promise, the
 * top-level category tabs and every home section. Both the header and the
 * home page need it, so it is fetched once here and shared. Render's free
 * tier cold-starts, and a second identical request would double that wait.
 */
interface CatalogApi {
  home: Home | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
}

const CatalogContext = createContext<CatalogApi | undefined>(undefined);

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [home, setHome] = useState<Home | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setHome(await fetchHome());
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    // A new delivery pin changes which shops (and so which products) apply.
    window.addEventListener(POINT_EVENT, reload);
    return () => window.removeEventListener(POINT_EVENT, reload);
  }, [reload]);

  return <CatalogContext.Provider value={{ home, loading, error, reload }}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogApi {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used inside <CatalogProvider>');
  return ctx;
}
