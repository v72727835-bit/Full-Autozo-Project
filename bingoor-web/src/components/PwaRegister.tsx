'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import s from './PwaRegister.module.css';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

const DISMISS_KEY = 'bingoor_install_dismissed';

export function PwaRegister() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [gone, setGone] = useState(true);

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      // When a deploy ships a new worker, hand over immediately and reload
      // once. Without this a visitor can sit on a worker from an older build
      // until every tab is closed.
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });

      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          reg.addEventListener('updatefound', () => {
            const next = reg.installing;
            next?.addEventListener('statechange', () => {
              if (next.state === 'installed' && navigator.serviceWorker.controller) {
                next.postMessage('skip-waiting');
              }
            });
          });
        })
        .catch(() => {});
    }
    try {
      setGone(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setGone(false);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = () => {
    setGone(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode — it reappears next session, which is acceptable */
    }
  };

  if (!prompt || gone) return null;

  return (
    <div className={s.bar}>
      <span className={s.icon}>
        <Icon name="download" size={19} />
      </span>
      <span className={s.text}>
        <b>Install Bingoor</b>
        <span className={s.sub}>Add it to your home screen for faster access</span>
      </span>
      <button
        className={s.go}
        onClick={async () => {
          await prompt.prompt();
          setPrompt(null);
        }}
      >
        Install
      </button>
      <button className={s.x} onClick={dismiss} aria-label="Dismiss">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
