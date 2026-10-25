"use client";

import { useCallback, useRef, useState } from 'react';
import type { UploadOptions } from '../api/admin';

type Upload = (files: File[], opts?: UploadOptions) => Promise<string[]>;

/**
 * Starts uploading a photo the moment it is picked, so it is usually done by
 * the time the rest of the form is filled in. `urlFor` waits for (or retries)
 * a file's upload; `progress` is 0..1 while it runs, 1 when done, and -1
 * after a failure.
 */
export function useEagerUploads(upload: Upload, opts?: Omit<UploadOptions, 'onProgress'>) {
  const jobs = useRef(new Map<File, Promise<string>>());
  const [progress, setProgress] = useState(() => new Map<File, number>());
  const setOne = (file: File, value: number) =>
    setProgress((cur) => {
      const next = new Map(cur);
      next.set(file, value);
      return next;
    });

  const start = useCallback(
    (file: File): Promise<string> => {
      const existing = jobs.current.get(file);
      if (existing) return existing;
      setOne(file, 0);
      const job = upload([file], { ...opts, onProgress: (f) => setOne(file, Math.min(f, 0.99)) })
        .then(([url]) => {
          setOne(file, 1);
          return url;
        })
        .catch((error) => {
          jobs.current.delete(file);
          setOne(file, -1);
          throw error;
        });
      // A failure is reported when the form is saved, not as an unhandled rejection.
      job.catch(() => undefined);
      jobs.current.set(file, job);
      return job;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upload, opts?.maxBytes, opts?.maxSide],
  );

  const values = [...progress.values()];
  const running = values.filter((v) => v >= 0 && v < 1);
  return {
    start,
    urlFor: start,
    progressOf: (file: File) => progress.get(file),
    /** Average progress of uploads still running, or null when none are. */
    overall: running.length ? running.reduce((a, b) => a + b, 0) / running.length : null,
  };
}
