import React, { useEffect, useState } from 'react';
import { adminCreateServiceCategory, adminDeleteServiceCategory, adminServiceCategories, adminUpdateServiceCategory } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { Badge, Button, CenterSpinner, ErrorBanner, Field, Modal } from '../components/ui';
import type { ServiceCategoryRow } from '../types';

const blank = { name: '', description: '', icon: '', image: '', sort: 1000, isActive: true };

/** Service categories shown on the public Services page. */
export default function ServiceCategoriesPage() {
  const [rows, setRows] = useState<ServiceCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ServiceCategoryRow | null>(null);
  const [form, setForm] = useState<typeof blank>(blank);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    adminServiceCategories().then(setRows).catch((e) => setError(getErrorMessage(e))).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const startNew = () => { setEditing(null); setForm(blank); setOpen(true); };
  const startEdit = (c: ServiceCategoryRow) => {
    setEditing(c);
    setForm({ name: c.name, description: c.description ?? '', icon: c.icon ?? '', image: c.image ?? '', sort: c.sort, isActive: c.isActive });
    setOpen(true);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = { name: form.name.trim(), description: form.description.trim() || undefined, icon: form.icon.trim() || undefined, image: form.image.trim() || undefined, sort: Number(form.sort) || 1000, isActive: form.isActive };
      if (editing) await adminUpdateServiceCategory(editing._id, body);
      else await adminCreateServiceCategory(body);
      setOpen(false);
      load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: ServiceCategoryRow) => {
    if (!window.confirm(`Delete "${c.name}"?`)) return;
    setError('');
    try { await adminDeleteServiceCategory(c._id); load(); } catch (e) { setError(getErrorMessage(e)); }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Service categories</h1>
          <div className="page-subtitle">The categories customers browse on the Services page. Providers pick one of these for each service they list.</div>
        </div>
        <Button onClick={startNew}>New category</Button>
      </div>
      <ErrorBanner message={error} />
      {loading ? (
        <CenterSpinner />
      ) : rows.length === 0 ? (
        <div className="card"><div className="empty-state">No categories yet. Add one so providers can list services.</div></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Sort</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c._id}>
                    <td className="cell-name">{c.name}{c.description ? <div className="cell-muted">{c.description}</div> : null}</td>
                    <td className="cell-muted">{c.sort}</td>
                    <td>{c.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Hidden</Badge>}</td>
                    <td>
                      <div className="row-flex">
                        <Button size="sm" variant="secondary" onClick={() => startEdit(c)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(c)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && (
        <Modal title={editing ? `Edit ${editing.name}` : 'New service category'} onClose={() => setOpen(false)}>
          <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Description"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Image URL"><input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} /></Field>
          <Field label="Sort (lower shows first)"><input type="number" value={form.sort} onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })} /></Field>
          <label className="row-flex" style={{ gap: 8, alignItems: 'center', marginTop: 8 }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            <span>Visible on the Services page</span>
          </label>
          <div className="row-flex" style={{ marginTop: 12 }}>
            <Button disabled={busy || form.name.trim().length < 2} onClick={save}>{editing ? 'Save' : 'Create'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
