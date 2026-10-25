"use client";

import React, { useRef, useState } from 'react';
import { fetchThumbless, saveThumb } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { makeThumb, runLimited } from '../lib/imageCompress';
import { Button, ErrorBanner } from './ui';

/**
 * One-time job for photos uploaded before card-sized copies existed. Each
 * photo is downloaded, a 480 px copy is made in this browser and sent back,
 * so product cards on the website and app stop loading full-size photos.
 * Safe to stop and run again: it only picks photos that still lack a copy.
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The API allows about 1,000 requests per 15 minutes; on "too many requests" wait a minute and carry on. */
async function withRetry<T>(task: () => Promise<T>, stopped: () => boolean): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status !== 429 || attempt >= 20 || stopped()) throw error;
      await sleep(60_000);
    }
  }
}

export default function SpeedUpPhotos() {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');
  const stop = useRef(false);

  const run = async () => {
    stop.current = false;
    setRunning(true);
    setFinished(false);
    setError('');
    setDone(0);
    setFailed(0);
    try {
      let after: string | undefined;
      do {
        const page = await withRetry(() => fetchThumbless(after), () => stop.current);
        await runLimited(page.items, 3, async (item) => {
          if (stop.current) return;
          try {
            const res = await fetch(item.url, { mode: 'cors' });
            if (!res.ok) throw new Error(String(res.status));
            const thumb = await makeThumb(await res.blob(), item.name);
            if (!thumb) throw new Error('unreadable');
            await withRetry(() => saveThumb(item.name, thumb), () => stop.current);
            setDone((n) => n + 1);
          } catch {
            setFailed((n) => n + 1);
          }
        });
        after = page.next ?? undefined;
      } while (after && !stop.current);
      setFinished(!stop.current);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="card card-pad" style={{ marginBottom: 18 }}>
      <h2 className="card-title">Speed up older photos</h2>
      <div className="page-subtitle">
        New photos get a small copy for product cards automatically. Run this once to make small copies of photos uploaded earlier,
        so the website and app load product lists faster. Keep this tab open while it runs; you can stop and run it again any time.
      </div>
      <ErrorBanner message={error} />
      {(running || done > 0 || failed > 0) && (
        <div className="cell-muted" style={{ marginTop: 8 }}>
          {running ? 'Working… ' : finished ? 'Finished. ' : 'Stopped. '}
          {done} photo{done === 1 ? '' : 's'} sped up{failed ? `, ${failed} skipped (missing or unreadable)` : ''}.
        </div>
      )}
      <div className="modal-actions">
        {running ? (
          <Button variant="secondary" onClick={() => (stop.current = true)}>Stop</Button>
        ) : (
          <Button onClick={() => void run()}>{finished ? 'Run again' : 'Speed up older photos'}</Button>
        )}
      </div>
    </div>
  );
}
