import React, { useEffect, useState } from 'react';
import { FreeRider } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { Button, ErrorBanner } from './ui';

/**
 * Lists the riders who are free right now (online, not paused, no parcel in
 * hand) in the order's warehouse and lets the store assign the order to one.
 */
export default function AssignRider({
  load,
  assign,
  onAssigned,
}: {
  load: () => Promise<FreeRider[]>;
  assign: (riderId: string) => Promise<void>;
  onAssigned: () => void;
}) {
  const [riders, setRiders] = useState<FreeRider[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const refresh = () => load().then(setRiders).catch((e) => setError(getErrorMessage(e)));
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async (id: string) => {
    setBusy(id);
    setError('');
    try {
      await assign(id);
      onAssigned();
    } catch (e) {
      setError(getErrorMessage(e));
      refresh();
    } finally {
      setBusy('');
    }
  };

  return (
    <div style={{ margin: '14px 0' }}>
      <div className="stat-label" style={{ marginBottom: 6 }}>
        Free riders — assign this order
      </div>
      <ErrorBanner message={error} />
      {riders === null ? (
        <span className="cell-muted">Loading riders…</span>
      ) : riders.length === 0 ? (
        <div className="cell-muted">No rider is free in this warehouse right now. This list refreshes every 15 seconds.</div>
      ) : (
        riders.map((r) => (
          <div key={r._id} className="row-flex" style={{ justifyContent: 'space-between', padding: '6px 0' }}>
            <span>
              <span className="dot dot-on" /> <b>{r.name}</b> <span className="cell-muted">{r.phone}</span>
            </span>
            <Button size="sm" disabled={!!busy} onClick={() => pick(r._id)}>
              {busy === r._id ? 'Assigning…' : 'Assign'}
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
