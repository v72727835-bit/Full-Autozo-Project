import React, { useEffect, useState } from 'react';
import { AdminInput, createAdmin, deleteAdmin, fetchAdmins, fetchPermissionDefs, updateAdmin } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { IconPlus, IconShield } from '../components/icons';
import { Badge, Button, CenterSpinner, ErrorBanner, Field, Modal, formatDate } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { PermissionDef, TeamMember } from '../types';

export default function TeamPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<TeamMember[]>([]);
  const [perms, setPerms] = useState<PermissionDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<{ admin?: TeamMember } | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([fetchAdmins(), fetchPermissionDefs()])
      .then(([a, p]) => {
        setAdmins(a);
        setPerms(p);
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const remove = async (a: TeamMember) => {
    if (!confirm(`Remove ${a.name}'s admin access for good?`)) return;
    try {
      await deleteAdmin(a._id);
      load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const toggleActive = async (a: TeamMember) => {
    try {
      await updateAdmin(a._id, { isActive: !a.isActive });
      load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const labelFor = (key: string) => perms.find((p) => p.key === key)?.label ?? key;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Team &amp; Access</h1>
          <div className="page-subtitle">
            Create sub-admin accounts and choose which sections each can use. Super admins can do everything, including managing the team.
            A sub-admin only sees — and can only change — the sections you tick.
          </div>
        </div>
        <Button onClick={() => setForm({})}>
          <IconPlus size={16} /> Add sub-admin
        </Button>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <CenterSpinner />
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Login</th>
                <th>Role</th>
                <th>Access</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a._id}>
                  <td style={{ fontWeight: 600 }}>
                    {a.name}
                    {a._id === user?._id && <span className="cell-muted"> (you)</span>}
                  </td>
                  <td className="cell-muted">{a.email || a.phone}</td>
                  <td>
                    {a.isSuperAdmin ? (
                      <Badge tone="brand">
                        <IconShield size={12} /> Super admin
                      </Badge>
                    ) : (
                      <Badge tone="info">Sub-admin</Badge>
                    )}
                  </td>
                  <td style={{ maxWidth: 320 }}>
                    {a.isSuperAdmin ? (
                      <span className="cell-muted">Everything</span>
                    ) : a.permissions.length === 0 ? (
                      <span className="cell-muted">No sections yet</span>
                    ) : (
                      <span className="row-flex" style={{ gap: 4, flexWrap: 'wrap' }}>
                        {a.permissions.map((k) => (
                          <Badge key={k} tone="muted">
                            {labelFor(k)}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </td>
                  <td>{a.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Suspended</Badge>}</td>
                  <td>
                    {a.isSuperAdmin ? (
                      <span className="cell-muted" style={{ fontSize: 12 }}>—</span>
                    ) : (
                      <span className="row-flex" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setForm({ admin: a })}>Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(a)}>
                          {a.isActive ? 'Suspend' : 'Activate'}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => remove(a)}>Delete</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <AdminForm
          admin={form.admin}
          perms={perms}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}
    </>
  );
}

function AdminForm({
  admin,
  perms,
  onClose,
  onSaved,
}: {
  admin?: TeamMember;
  perms: PermissionDef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(admin?.name ?? '');
  const [phone, setPhone] = useState(admin?.phone ?? '');
  const [email, setEmail] = useState(admin?.email ?? '');
  const [password, setPassword] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(admin?.permissions ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggle = (key: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const allOn = perms.length > 0 && perms.every((p) => selected.has(p.key));
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(perms.map((p) => p.key)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const permissions = [...selected];
    try {
      if (admin) {
        const body: Partial<AdminInput> = { name, phone, email, permissions };
        if (password) body.password = password;
        await updateAdmin(admin._id, body);
      } else {
        await createAdmin({ name, phone, email: email || undefined, password, permissions });
      }
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={admin ? `Edit ${admin.name}` : 'Add sub-admin'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <ErrorBanner message={error} />
        <div className="field-row">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Front desk" required />
          </Field>
          <Field label="Phone (login)">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={15} placeholder="10-digit mobile" required />
          </Field>
        </div>
        <div className="field-row">
          <Field label="Email (optional, also a login)">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} placeholder="name@autozo.org" />
          </Field>
          <Field label={admin ? 'New password (leave blank to keep)' : 'Password'}>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} placeholder="At least 6 characters" required={!admin} />
          </Field>
        </div>

        <div className="field">
          <label className="row-flex" style={{ justifyContent: 'space-between' }}>
            <span>Sections this sub-admin can use</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={toggleAll}>
              {allOn ? 'Clear all' : 'Select all'}
            </button>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
            {perms.map((p) => (
              <label key={p.key} className="checkbox-row" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', marginBottom: 0 }}>
                <input type="checkbox" checked={selected.has(p.key)} onChange={() => toggle(p.key)} />
                <span>{p.label}</span>
              </label>
            ))}
          </div>
        </div>

        {admin && (
          <div className="cell-muted" style={{ fontSize: 12 }}>
            Added {formatDate(admin.createdAt)}
            {admin.lastLoginAt ? ` · last signed in ${formatDate(admin.lastLoginAt)}` : ' · never signed in'}
          </div>
        )}

        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : admin ? 'Save changes' : 'Create sub-admin'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
