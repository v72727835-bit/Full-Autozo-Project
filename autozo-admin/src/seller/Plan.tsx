"use client";

import React, { useState } from 'react';
import { confirmMyPlanPayment, MyPlan, startMyPlanPayment } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { Badge, Button, ErrorBanner, money } from '../components/ui';
import ManualPay from '../components/ManualPay';
import { payWithRazorpay } from '../lib/razorpay';
import { NavLink } from '../navigation';

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

export const planLocked = (plan: MyPlan | null) => !!plan && plan.required && !plan.active;

/** Who the plan screens are for: a warehouse (default) or a service provider. */
type PlanKind = 'warehouse' | 'provider';
const COPY: Record<PlanKind, { keep: string; locked: string; sub: string; pick: string }> = {
  warehouse: {
    keep: 'keep your orders running',
    locked: 'Your plan is not active. Buy a plan to see orders and add products.',
    sub: 'A running plan keeps your orders and product listing open.',
    pick: 'Pick a plan below to see orders and add products.',
  },
  provider: {
    keep: 'keep getting bookings',
    locked: 'Your plan is not active. Buy a plan to add services and get new bookings.',
    sub: 'A running plan lets you add services and get new bookings.',
    pick: 'Pick a plan below to add services and get bookings.',
  },
};

/** The strip above every page while the warehouse has no running plan (or it ends within 3 days). */
export function PlanBanner({ plan, kind = 'warehouse' }: { plan: MyPlan | null; kind?: PlanKind }) {
  if (!plan?.required) return null;
  if (plan.active && plan.daysLeft > 3) return null;
  return (
    <div className="error-banner" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ flex: 1 }}>
        {plan.active
          ? `Your plan ends in ${plan.daysLeft} day${plan.daysLeft === 1 ? '' : 's'}. Renew it to ${COPY[kind].keep}.`
          : COPY[kind].locked}
      </span>
      <NavLink to="/plan" className="btn btn-primary btn-sm">
        {plan.active ? 'Renew plan' : 'Buy plan'}
      </NavLink>
    </div>
  );
}

/** "My plan": the current plan, and the plans the super admin offers, each paid with Razorpay. */
export default function PlanView({ plan, me, onPaid, kind = 'warehouse' }: { plan: MyPlan; me: { name: string; phone: string; email?: string }; onPaid: (p: MyPlan) => void; kind?: PlanKind }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const buy = async (planId: string) => {
    setBusy(planId);
    setError('');
    setDone('');
    try {
      const order = await startMyPlanPayment(planId);
      const paid = await payWithRazorpay({ keyId: order.keyId, orderId: order.razorpayOrderId, amountPaise: order.amount, name: me.name, phone: me.phone, email: me.email, description: `${order.planName} plan` });
      const next = await confirmMyPlanPayment(paid);
      onPaid(next);
      setDone(`Payment received. Your plan runs until ${next.until ? longDate(next.until) : ''}.`);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">My plan</h1>
          <div className="page-subtitle">{COPY[kind].sub}</div>
        </div>
      </div>
      <ErrorBanner message={error} />
      {done ? <div className="card card-pad" style={{ marginBottom: 16, color: 'var(--ok)', fontWeight: 600 }}>{done}</div> : null}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        {!plan.required ? (
          <div>Plans are switched off right now. Everything is free to use.</div>
        ) : plan.active ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Badge tone="success">Running</Badge>
            <span>
              Your plan runs until <b>{longDate(plan.until!)}</b> ({plan.daysLeft} day{plan.daysLeft === 1 ? '' : 's'} left). Buying again adds the days after this date.
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Badge tone="danger">{plan.until ? 'Ended' : 'No plan'}</Badge>
            <span>{plan.until ? `Your plan ended on ${longDate(plan.until)}.` : 'You do not have a plan yet.'} {COPY[kind].pick}</span>
          </div>
        )}
      </div>

      {plan.plans.length === 0 ? (
        <div className="card"><div className="empty-state">No plans are offered right now. Please contact autozo.</div></div>
      ) : (
        <div className="grid grid-3">
          {plan.plans.map((p) => (
            <div key={p._id} className="card card-pad">
              <div style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</div>
              <div style={{ fontSize: 26, fontWeight: 800, margin: '6px 0 2px' }}>{money(p.price)}</div>
              <div className="cell-muted">for {p.days} days</div>
              {p.description ? <div style={{ marginTop: 8 }}>{p.description}</div> : null}
              <div style={{ marginTop: 14 }}>
                <Button disabled={!!busy || !plan.canPayOnline} onClick={() => buy(p._id)}>
                  {busy === p._id ? 'Opening payment…' : plan.active ? 'Renew with this plan' : 'Buy now'}
                </Button>
              </div>
              <ManualPay purpose="subscription" planId={p._id} planName={p.name} amount={p.price} onDone={() => void 0} />
            </div>
          ))}
        </div>
      )}
      {plan.plans.length > 0 && !plan.canPayOnline ? <div className="cell-muted" style={{ marginTop: 10 }}>Online payment is switched off right now. Please contact autozo.</div> : null}
    </>
  );
}
