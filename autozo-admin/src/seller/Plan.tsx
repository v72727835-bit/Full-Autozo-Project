"use client";

import React, { useState } from 'react';
import { confirmMyPlanPayment, MyPlan, startMyPlanPayment } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { Badge, Button, ErrorBanner, money } from '../components/ui';
import { payWithRazorpay } from '../lib/razorpay';
import { NavLink } from '../navigation';

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

export const planLocked = (plan: MyPlan | null) => !!plan && plan.required && !plan.active;

/** The strip above every page while the warehouse has no running plan (or it ends within 3 days). */
export function PlanBanner({ plan }: { plan: MyPlan | null }) {
  if (!plan?.required) return null;
  if (plan.active && plan.daysLeft > 3) return null;
  return (
    <div className="error-banner" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ flex: 1 }}>
        {plan.active
          ? `Your plan ends in ${plan.daysLeft} day${plan.daysLeft === 1 ? '' : 's'}. Renew it to keep your orders running.`
          : 'Your plan is not active. Buy a plan to see orders and add products.'}
      </span>
      <NavLink to="/plan" className="btn btn-primary btn-sm">
        {plan.active ? 'Renew plan' : 'Buy plan'}
      </NavLink>
    </div>
  );
}

/** "My plan": the current plan, and the plans the super admin offers, each paid with Razorpay. */
export default function PlanView({ plan, me, onPaid }: { plan: MyPlan; me: { name: string; phone: string; email?: string }; onPaid: (p: MyPlan) => void }) {
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
          <div className="page-subtitle">A running plan keeps your orders and product listing open.</div>
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
            <span>{plan.until ? `Your plan ended on ${longDate(plan.until)}.` : 'You do not have a plan yet.'} Pick a plan below to see orders and add products.</span>
          </div>
        )}
      </div>

      {plan.plans.length === 0 ? (
        <div className="card"><div className="empty-state">No plans are offered right now. Please contact Autozo.</div></div>
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
            </div>
          ))}
        </div>
      )}
      {plan.plans.length > 0 && !plan.canPayOnline ? <div className="cell-muted" style={{ marginTop: 10 }}>Online payment is switched off right now. Please contact Autozo.</div> : null}
    </>
  );
}
