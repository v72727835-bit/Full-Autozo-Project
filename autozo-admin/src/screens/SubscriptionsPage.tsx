import React, { useCallback, useEffect, useState } from 'react';
import {
  Plan,
  PlanAudience,
  PlanInput,
  PlanMember,
  PlanOverview,
  PlanPayment,
  createPlan,
  deletePlan,
  endMemberPlan,
  fetchPlanMembers,
  fetchPlanOverview,
  fetchPlanPayments,
  grantPlanDays,
  setPlanSwitches,
  updatePlan,
} from '../api/admin';
import { getErrorMessage } from '../api/client';
import { Badge, Button, Card, CenterSpinner, ErrorBanner, Field, Modal, Pagination, Tabs, money } from '../components/ui';
import { PageMeta } from '../types';

const WHO: Record<PlanAudience, { one: string; many: string; locked: string }> = {
  rider: { one: 'Rider', many: 'Riders', locked: 'Without a plan a rider gets no new orders (a delivery already in hand can still be finished).' },
  seller: { one: 'Warehouse', many: 'Warehouses', locked: 'Without a plan a warehouse cannot see its orders or add new products.' },
  provider: { one: 'Service provider', many: 'Service providers', locked: 'Without a plan a provider cannot add services and is not rung for new bookings.' },
};

const dateOnly = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');

/**
 * Paid plans for riders and warehouses. The super admin switches each one on or off, sets the
 * plans (price in rupees and number of days), sees who has a running plan and can give free days.
 * Payments go through the Razorpay keys saved under Login & Payments.
 */
export default function SubscriptionsPage() {
  const [overview, setOverview] = useState<PlanOverview | null>(null);
  const [audience, setAudience] = useState<PlanAudience>('rider');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<PlanAudience | null>(null);

  const load = useCallback(() => {
    fetchPlanOverview()
      .then(setOverview)
      .catch((e) => setError(getErrorMessage(e)));
  }, []);
  useEffect(load, [load]);

  const toggle = async (a: PlanAudience, on: boolean) => {
    const activePlans = overview?.plans.filter((p) => p.audience === a && p.active).length ?? 0;
    if (on && !activePlans) {
      setError(`Add at least one ${WHO[a].one.toLowerCase()} plan before switching ${WHO[a].one.toLowerCase()} plans on.`);
      return;
    }
    const counts = overview?.[a];
    const without = counts ? counts.total - counts.active : 0;
    if (on && !confirm(`Switch on ${WHO[a].one.toLowerCase()} plans?\n\n${WHO[a].locked}\n${without} ${WHO[a].many.toLowerCase()} have no running plan right now.`)) return;
    setSaving(a);
    try {
      const switches = await setPlanSwitches({ [a]: on });
      setOverview((o) => (o ? { ...o, switches } : o));
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  if (!overview) return error ? <ErrorBanner message={error} /> : <CenterSpinner />;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Subscriptions</h1>
          <div className="page-subtitle">Paid plans for riders, warehouses and service providers. Prices are in rupees and paid online with your Razorpay keys.</div>
        </div>
      </div>
      <ErrorBanner message={error} />

      <div className="grid grid-3">
        {(['rider', 'seller', 'provider'] as PlanAudience[]).map((a) => (
          <div key={a} className="card card-pad">
            <label className="checkbox-row" style={{ fontSize: 15, fontWeight: 700 }}>
              <input type="checkbox" checked={overview.switches[a]} disabled={saving === a} onChange={(e) => toggle(a, e.target.checked)} />
              <span>{WHO[a].one} plans {overview.switches[a] ? 'ON' : 'OFF'}</span>
            </label>
            <div className="cell-muted" style={{ margin: '8px 0 10px' }}>
              {overview.switches[a] ? WHO[a].locked : `Off: every ${WHO[a].one.toLowerCase()} works for free.`}
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13.5 }}>
              <span>
                <b>{overview[a]?.active ?? 0}</b> of {overview[a]?.total ?? 0} with a running plan
              </span>
              <span>
                Collected <b>{money(overview[a]?.revenue ?? 0)}</b>
              </span>
            </div>
          </div>
        ))}
      </div>

      <Tabs
        value={audience}
        onChange={setAudience}
        options={[
          { value: 'rider', label: 'Rider plans' },
          { value: 'seller', label: 'Warehouse plans' },
          { value: 'provider', label: 'Service provider plans' },
        ]}
      />
      <div style={{ height: 16 }} />

      <PlansCard audience={audience} plans={overview.plans.filter((p) => p.audience === audience)} onChanged={load} onError={setError} />
      <MembersCard key={`m-${audience}`} audience={audience} onChanged={load} onError={setError} />
      <PaymentsCard key={`p-${audience}`} audience={audience} onError={setError} />
    </>
  );
}

function PlansCard({ audience, plans, onChanged, onError }: { audience: PlanAudience; plans: Plan[]; onChanged: () => void; onError: (m: string) => void }) {
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);

  const remove = async (p: Plan) => {
    if (!confirm(`Remove the plan "${p.name}"? Anyone who already bought it keeps their days.`)) return;
    try {
      const r = await deletePlan(p._id);
      if (r.hidden) alert('This plan was already bought, so it is hidden instead of deleted. Its history stays.');
      onChanged();
    } catch (e) {
      onError(getErrorMessage(e));
    }
  };

  return (
    <Card title={`${WHO[audience].one} plans`} action={<Button size="sm" onClick={() => setEditing('new')}>Add plan</Button>} pad={false}>
      {plans.length === 0 ? (
        <div className="empty-state">No {WHO[audience].one.toLowerCase()} plans yet. Add one, for example "Monthly · ₹199 · 30 days".</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Price</th>
                <th>Days</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p._id}>
                  <td className="cell-name">
                    {p.name}
                    {p.description ? <div className="cell-muted">{p.description}</div> : null}
                  </td>
                  <td>{money(p.price)}</td>
                  <td>{p.days}</td>
                  <td>{p.active ? <Badge tone="success">Offered</Badge> : <Badge tone="muted">Hidden</Badge>}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>Edit</Button>{' '}
                    <Button size="sm" variant="ghost" onClick={() => remove(p)}>Remove</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <PlanModal
          audience={audience}
          plan={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function PlanModal({ audience, plan, onClose, onSaved }: { audience: PlanAudience; plan: Plan | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(plan?.name ?? '');
  const [price, setPrice] = useState(plan ? String(plan.price) : '');
  const [days, setDays] = useState(plan ? String(plan.days) : '30');
  const [description, setDescription] = useState(plan?.description ?? '');
  const [active, setActive] = useState(plan?.active ?? true);
  const [sort, setSort] = useState(String(plan?.sort ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: PlanInput = { name: name.trim(), price: Number(price), days: Number(days), description: description.trim(), active, sort: Number(sort) || 0 };
    if (!(body.price >= 1)) return setError('Enter a price of at least ₹1.');
    if (!Number.isInteger(body.days) || body.days < 1) return setError('Enter the number of days as a whole number.');
    setBusy(true);
    try {
      if (plan) await updatePlan(plan._id, body);
      else await createPlan({ ...body, audience });
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={plan ? `Edit ${plan.name}` : `New ${WHO[audience].one.toLowerCase()} plan`} onClose={onClose}>
      <form onSubmit={save}>
        <ErrorBanner message={error} />
        <Field label="Plan name">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Monthly" required />
        </Field>
        <div className="field-row">
          <Field label="Price (₹)">
            <input type="number" min={1} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="199" required />
          </Field>
          <Field label="Days">
            <input type="number" min={1} step={1} value={days} onChange={(e) => setDays(e.target.value)} required />
          </Field>
        </div>
        <Field label="Short note (optional)">
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Best value" />
        </Field>
        <div className="field-row">
          <Field label="Order in the list">
            <input type="number" min={0} value={sort} onChange={(e) => setSort(e.target.value)} />
          </Field>
          <label className="checkbox-row" style={{ alignSelf: 'end', marginBottom: 14 }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>Offer this plan</span>
          </label>
        </div>
        {plan ? <div className="cell-muted" style={{ marginBottom: 10 }}>A new price applies to the next purchase. Plans already bought are not changed.</div> : null}
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save plan'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function MembersCard({ audience, onChanged, onError }: { audience: PlanAudience; onChanged: () => void; onError: (m: string) => void }) {
  const [status, setStatus] = useState<'all' | 'active' | 'expired' | 'never'>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PlanMember[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [granting, setGranting] = useState<PlanMember | null>(null);

  const load = useCallback(() => {
    fetchPlanMembers({ audience, status: status === 'all' ? undefined : status, q: q.trim() || undefined, page, limit: 20 })
      .then(({ items, meta: m }) => {
        setRows(items);
        setMeta(m);
      })
      .catch((e) => onError(getErrorMessage(e)));
  }, [audience, status, q, page, onError]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const end = async (m: PlanMember) => {
    if (!confirm(`End ${m.name}'s plan now?`)) return;
    try {
      await endMemberPlan(m._id);
      load();
      onChanged();
    } catch (e) {
      onError(getErrorMessage(e));
    }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <Card title={WHO[audience].many} pad={false}>
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="toolbar">
            <input className="search-input" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name, phone or id" />
            <Tabs
              value={status}
              onChange={(s) => { setStatus(s); setPage(1); }}
              options={[
                { value: 'all', label: 'All' },
                { value: 'active', label: 'Running' },
                { value: 'expired', label: 'Ended' },
                { value: 'never', label: 'Never bought' },
              ]}
            />
          </div>
        </div>
        {!rows ? (
          <CenterSpinner />
        ) : rows.length === 0 ? (
          <div className="empty-state">Nobody here.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{WHO[audience].one}</th>
                  <th>{audience === 'provider' ? 'Business' : 'Warehouse'}</th>
                  <th>Plan</th>
                  <th>Ends</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m._id}>
                    <td className="cell-name">
                      {m.name}
                      <div className="cell-muted">{m.phone}{m.sellerId ? ` · ${m.sellerId}` : ''}{m.providerId ? ` · ${m.providerId}` : ''}</div>
                    </td>
                    <td className="cell-muted">{audience === 'provider' ? [m.providerApplication?.firm, m.providerApplication?.city].filter(Boolean).join(', ') || '-' : (audience === 'rider' ? m.warehouses : m.sellerWarehouses)?.map((w) => w.name).join(', ') || '-'}</td>
                    <td>{m.planActive ? <Badge tone="success">Running</Badge> : m.subscriptionUntil ? <Badge tone="danger">Ended</Badge> : <Badge tone="muted">None</Badge>}</td>
                    <td>{dateOnly(m.subscriptionUntil)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Button size="sm" variant="secondary" onClick={() => setGranting(m)}>Give days</Button>{' '}
                      {m.planActive ? <Button size="sm" variant="ghost" onClick={() => end(m)}>End plan</Button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta ? <div className="card-pad"><Pagination page={meta.page} totalPages={meta.totalPages} onChange={setPage} /></div> : null}
      </Card>
      {granting && (
        <GrantModal
          member={granting}
          onClose={() => setGranting(null)}
          onDone={() => {
            setGranting(null);
            load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function GrantModal({ member, onClose, onDone }: { member: PlanMember; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = useState('7');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1) return setError('Enter the number of days as a whole number.');
    setBusy(true);
    try {
      await grantPlanDays(member._id, n, note.trim() || undefined);
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Give free days to ${member.name}`} onClose={onClose}>
      <form onSubmit={save}>
        <ErrorBanner message={error} />
        <div className="cell-muted" style={{ marginBottom: 12 }}>
          {member.planActive ? `Added after the current plan ends (${dateOnly(member.subscriptionUntil)}).` : 'The plan starts now.'}
        </div>
        <Field label="Days">
          <input type="number" min={1} step={1} value={days} onChange={(e) => setDays(e.target.value)} required />
        </Field>
        <Field label="Note (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Free trial" />
        </Field>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Give days'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function PaymentsCard({ audience, onError }: { audience: PlanAudience; onError: (m: string) => void }) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PlanPayment[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);

  useEffect(() => {
    fetchPlanPayments({ audience, page, limit: 20 })
      .then(({ items, meta: m }) => {
        setRows(items);
        setMeta(m);
      })
      .catch((e) => onError(getErrorMessage(e)));
  }, [audience, page, onError]);

  return (
    <div style={{ marginTop: 16 }}>
      <Card title="Payments" pad={false}>
        {!rows ? (
          <CenterSpinner />
        ) : rows.length === 0 ? (
          <div className="empty-state">No plan payments yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>{WHO[audience].one}</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Period</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p._id}>
                    <td className="cell-muted">{dateOnly(p.createdAt)}</td>
                    <td className="cell-name">
                      {p.user?.name ?? 'Deleted account'}
                      <div className="cell-muted">{p.user?.phone}</div>
                    </td>
                    <td>
                      {p.planName} · {p.days} days
                      {p.note ? <div className="cell-muted">{p.note}</div> : null}
                    </td>
                    <td>{p.source === 'admin' ? <Badge tone="info">Free</Badge> : money(p.amount)}</td>
                    <td className="cell-muted">
                      {dateOnly(p.startsAt)} to {dateOnly(p.endsAt)}
                      {p.paymentId ? <div>{p.paymentId}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta ? <div className="card-pad"><Pagination page={meta.page} totalPages={meta.totalPages} onChange={setPage} /></div> : null}
      </Card>
    </div>
  );
}
