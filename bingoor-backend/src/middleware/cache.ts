import { RequestHandler } from 'express';
import { clearSettingsCache } from '../services/settings.service';

/**
 * Short-lived cache for the public catalogue.
 *
 * Every customer opening the app asks for the same home feed, category
 * tree and product lists. Rebuilding them from MongoDB on every request is
 * the main cost under load, so successful responses are kept in memory for
 * a few seconds and browsers/CDNs are told they may reuse them too.
 *
 * Stock is still checked atomically when an order is placed, so a product
 * card that is a few seconds stale can never oversell. Any admin write
 * clears the cache so catalogue edits show up immediately.
 */
const TTL_MS = 30_000;
const MAX_ENTRIES = 1_000;

type Entry = { expires: number; status: number; body: unknown };
const store = new Map<string, Entry>();

export function clearCatalogCache(): void {
  store.clear();
  clearSettingsCache();
}

export const catalogCache: RequestHandler = (req, res, next) => {
  // Catalogue responses never depend on who is asking, so signed-in users share the cache.
  if (req.method !== 'GET') return next();

  res.set('Cache-Control', `public, max-age=${TTL_MS / 1000}, stale-while-revalidate=300`);

  const key = req.originalUrl;
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) {
    res.set('X-Cache', 'HIT');
    res.status(hit.status).json(hit.body);
    return;
  }

  const json = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode === 200) {
      // Map keeps insertion order, so the first key is the oldest.
      if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
      store.set(key, { expires: Date.now() + TTL_MS, status: 200, body });
    }
    res.set('X-Cache', 'MISS');
    return json(body);
  };
  next();
};

/** Drops cached catalogue pages after any admin change. */
export const invalidateOnWrite: RequestHandler = (req, res, next) => {
  if (req.method !== 'GET') res.on('finish', () => res.statusCode < 400 && clearCatalogCache());
  next();
};
