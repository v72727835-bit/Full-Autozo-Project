'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { fetchHome, homeLocationKey } from '../api/catalog';
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

/**
 * The last home payload is kept in the browser, so a returning visitor sees
 * the shop instantly while the fresh copy loads (usually a second later).
 * Prices and stock are always re-checked by the server at checkout.
 */
const SAVED_KEY = 'autozo_home_v1';
const SAVED_MAX_AGE = 24 * 60 * 60 * 1000;

function readSaved(key: string): Home | null {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { key: string; at: number; home: Home };
    return saved.key === key && Date.now() - saved.at < SAVED_MAX_AGE ? saved.home : null;
  } catch {
    return null;
  }
}

function writeSaved(key: string, home: Home) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify({ key, at: Date.now(), home }));
  } catch {
    /* storage full or blocked: the next visit just loads normally */
  }
}

// Start the request while React is still hydrating instead of after it.
if (typeof window !== 'undefined') void fetchHome().catch(() => undefined);

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [home, setHome] = useState<Home | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef(0);
  const currentKey = useRef<string | null>(null);

  const load = useCallback(async (force = false) => {
    const version = ++request.current;
    const key = homeLocationKey();
    if (currentKey.current !== key) {
      const saved = readSaved(key);
      setHome(saved);
      setLoading(!saved);
    } else {
      setLoading(true);
    }
    currentKey.current = key;
    setError('');
    try {
      const result = await fetchHome(key, force);
      if (request.current === version) {
        setHome(result);
        writeSaved(key, result);
      }
    } catch (e) {
      // With a saved copy on screen, a failed refresh stays quiet.
      if (request.current === version && !readSaved(key)) setError(getErrorMessage(e));
    } finally {
      if (request.current === version) setLoading(false);
    }
  }, []);
  const reload = useCallback(() => load(true), [load]);

  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    // A new delivery pin changes which shops (and so which products) apply.
    window.addEventListener(POINT_EVENT, refresh);
    window.addEventListener('online', refresh);
    return () => {
      request.current++;
      window.removeEventListener(POINT_EVENT, refresh);
      window.removeEventListener('online', refresh);
    };
  }, [load]);

  return <CatalogContext.Provider value={{ home, loading, error, reload }}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogApi {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used inside <CatalogProvider>');
  return ctx;
}
