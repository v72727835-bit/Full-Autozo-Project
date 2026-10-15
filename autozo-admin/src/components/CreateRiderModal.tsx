import React, { useEffect, useState } from 'react';
import { createRider, fetchAllShops } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { Shop } from '../types';
import { Button, ErrorBanner, Field, Modal } from './ui';
import WarehouseChecks from './WarehouseChecks';

/** Creates a rider login: the rider signs in to the rider app with this phone number and password. */
export default function CreateRiderModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [f, setF] = useState({ name: '', phone: '', password: '', warehouses: [] as string[] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetchAllShops().then(setShops).catch((e) => setError(getErrorMessage(e)));
  }, []);
  const gen = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    setF((cur) => ({ ...cur, password: [...bytes].map((b) => chars[b % chars.length]).join('') + '@7' }));
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (f.warehouses.length === 0) {
      setError('Choose at least one warehouse.');
      return;
    }
    setBusy(true);
    try {
      await createRider(f);
      window.alert(`Rider created.\n\nRider app login (phone): ${f.phone}\nPassword: ${f.password}\n\nShare this with the rider now - the password cannot be shown again.`);
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="New rider" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBanner message={error} />
        <Field label="Rider name">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        </Field>
        <Field label="Phone number (rider app login, 10 digits)">
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="numeric" required />
        </Field>
        <Field label="Password (at least 6 characters)">
          <div className="row-flex">
            <input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required style={{ flex: 1 }} />
            <Button type="button" variant="secondary" onClick={gen}>
              Generate
            </Button>
          </div>
        </Field>
        <Field label="Warehouses (tick one or more)">
          <WarehouseChecks options={shops} value={f.warehouses} onChange={(warehouses) => setF({ ...f, warehouses })} />
        </Field>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create rider'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
