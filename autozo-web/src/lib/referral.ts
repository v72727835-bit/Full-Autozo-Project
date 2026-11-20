const KEY = 'autozo.ref';

/** A share link opened on this device remembers whose it was until the person signs up. */
export function rememberReferral(raw: string | null | undefined) {
  const code = (raw ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return;
  try { localStorage.setItem(KEY, code); } catch { /* private mode: the code can still be typed */ }
}

export function savedReferral(): string {
  try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; }
}

export function clearReferral() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
