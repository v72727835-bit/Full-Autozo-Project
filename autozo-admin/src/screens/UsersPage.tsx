"use client";

import React, { useEffect, useState } from 'react';
import { createRider, fetchShops, fetchUsers, updateUser } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { Badge, Button, CenterSpinner, ErrorBanner, Field, Modal, Pagination, Tabs, Tone, formatDate, timeAgo } from '../components/ui';
import { AppUser, PageMeta, Shop } from '../types';

const ROLES = ['customer', 'rider', 'shop', 'admin'] as const;
type Role = (typeof ROLES)[number];
const ROLE_TONE: Record<Role, Tone> = { admin: 'danger', shop: 'info', rider: 'brand', customer: 'muted' };
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export default function UsersPage({ fixedRole, title = 'Users', subtitle }: { fixedRole?: Role; title?: string; subtitle?: string }) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<string>(fixedRole ?? '');
  const [q, setQ] = useState('');
  const [warehouses, setWarehouses] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    setRole(fixedRole ?? '');
    setPage(1);
    setQ('');
    if (fixedRole === 'rider') {
      fetchShops({ page: 1, limit: 50 }).then(({ items }) => setWarehouses(items)).catch((err) => setError(getErrorMessage(err)));
    }
  }, [fixedRole]);

  const load = () => {
    setLoading(true);
    fetchUsers({ page, limit: 20, role: role || undefined, q: q || undefined })
      .then(({ items, meta: nextMeta }) => { setUsers(items); setMeta(nextMeta); })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [page, role]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const patch = async (user: AppUser, body: { isActive?: boolean; role?: string; warehouse?: string | null }, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setSavingId(user._id);
    setError('');
    try {
      const updated = await updateUser(user._id, body);
      setUsers((list) => list.map((item) => item._id === user._id ? { ...item, ...updated } : item));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <div className="page-subtitle">{subtitle ?? (meta ? `${meta.total} accounts` : '')}</div>
        </div>
        {fixedRole === 'rider' && <Button onClick={() => setShowCreate(true)}>+ Create rider</Button>}
      </div>

      <div className="toolbar">
        {!fixedRole && (
          <Tabs value={role} onChange={(value) => { setRole(value); setPage(1); }} options={[
            { value: '', label: 'Everyone' },
            ...ROLES.map((value) => ({ value, label: `${cap(value)}s` })),
          ]} />
        )}
        <form className="toolbar" style={{ margin: 0, flex: 1 }} onSubmit={search}>
          <input className="search-input" placeholder="Search by name, phone or email..." value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit" variant="secondary">Search</Button>
        </form>
      </div>

      <ErrorBanner message={error} />

      <div className="card">
        {loading ? <div style={{ padding: 40 }}><CenterSpinner /></div> : users.length === 0 ? <div className="empty-state">No accounts found.</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>User</th><th>Role</th><th>Status</th>{fixedRole === 'rider' && <th>Warehouse</th>}<th>Last login</th><th>Joined</th><th></th></tr></thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id}>
                    <td><div className="row-flex"><span className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{user.name.slice(0, 2).toUpperCase()}</span><div><div className="cell-name">{user.name}</div><div className="cell-muted">{user.phone}{user.email ? ` · ${user.email}` : ''}</div></div></div></td>
                    <td><div className="row-flex"><Badge tone={ROLE_TONE[user.role as Role] ?? 'muted'}>{cap(user.role)}</Badge><select value={user.role} disabled={savingId === user._id} onChange={(e) => patch(user, { role: e.target.value }, `Change ${user.name}'s role?`)} style={{ width: 118, height: 31, fontSize: 12.5 }}>{ROLES.map((value) => <option key={value} value={value}>{cap(value)}</option>)}</select></div></td>
                    <td><Badge tone={user.isActive ? 'success' : 'danger'}>{user.isActive ? 'Active' : 'Blocked'}</Badge></td>
                    {fixedRole === 'rider' && <td><select value={typeof user.warehouse === 'string' ? user.warehouse : user.warehouse?._id ?? ''} disabled={savingId === user._id} onChange={(e) => patch(user, { warehouse: e.target.value || null })} style={{ width: 160, height: 31, fontSize: 12.5 }}><option value="">Unassigned</option>{warehouses.map((warehouse) => <option key={warehouse._id} value={warehouse._id}>{warehouse.name}</option>)}</select></td>}
                    <td className="cell-muted">{user.lastLoginAt ? timeAgo(user.lastLoginAt) : '—'}</td>
                    <td className="cell-muted">{formatDate(user.createdAt)}</td>
                    <td><Button size="sm" variant={user.isActive ? 'danger' : 'secondary'} disabled={savingId === user._id} onClick={() => patch(user, { isActive: !user.isActive })}>{savingId === user._id ? '...' : user.isActive ? 'Block' : 'Unblock'}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {meta && <Pagination page={meta.page} totalPages={meta.totalPages} onChange={setPage} />}
      {showCreate && <CreateRiderModal warehouses={warehouses} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
    </>
  );
}

function CreateRiderModal({ warehouses, onClose, onSaved }: { warehouses: Shop[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', warehouse: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createRider({ ...form, email: form.email || undefined });
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Create rider" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBanner message={error} />
        <Field label="Full name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Phone"><input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="10-digit mobile number" /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Temporary password"><input required type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <Field label="Assign warehouse"><select required value={form.warehouse} onChange={(e) => setForm({ ...form, warehouse: e.target.value })}><option value="">Select warehouse...</option>{warehouses.map((warehouse) => <option key={warehouse._id} value={warehouse._id}>{warehouse.name}</option>)}</select></Field>
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create rider'}</Button></div>
      </form>
    </Modal>
  );
}
