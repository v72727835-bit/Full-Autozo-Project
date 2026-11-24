import { Types } from 'mongoose';
import { IManualPaymentConfig, ManualPaymentConfig } from '../models/ManualPaymentConfig';
import { ManualMethod, ManualPayment, ManualPurpose } from '../models/ManualPayment';
import { ProviderTxn } from '../models/ProviderTxn';
import { SubscriptionPayment } from '../models/SubscriptionPayment';
import { SubscriptionPlan } from '../models/SubscriptionPlan';
import { WalletTxn } from '../models/WalletTxn';
import { ApiError } from '../utils/ApiError';
import { pushToUsers } from './firebase.service';
import { providerWalletSummary, refreshProviderDue } from './providerPay.service';
import { awaitingCash, payableCod, settleRiderCod } from './rider.service';
import { addPlanDays } from './subscription.service';

const round2 = (n: number) => Math.round(n * 100) / 100;

export type PartnerRole = 'rider' | 'provider' | 'seller';
export const partnerRole = (role?: string): PartnerRole => {
  if (role === 'rider' || role === 'provider' || role === 'seller') return role;
  throw new ApiError(403, 'Manual payment is for riders, service providers and warehouses.');
};

const PURPOSES: Record<PartnerRole, ManualPurpose[]> = {
  rider: ['rider_cash', 'subscription'],
  provider: ['provider_dues', 'subscription'],
  seller: ['subscription'],
};

/** What partners may see: where to pay. Nothing is shown until the admin switches it on. */
export async function publicConfig() {
  const c = (await ManualPaymentConfig.findOne({ key: 'global' }).lean()) as IManualPaymentConfig | null;
  const on = !!c?.enabled && !!(c.upiId || c.qrImage || c.bankNumber);
  if (!on || !c) return { enabled: false };
  const { payeeName, upiId, qrImage, bankHolder, bankName, bankNumber, bankIfsc, note } = c;
  return { enabled: true, payeeName, upiId, qrImage, bankHolder, bankName, bankNumber, bankIfsc, note };
}

export async function saveConfig(body: Partial<IManualPaymentConfig>) {
  const doc = await ManualPaymentConfig.findOneAndUpdate({ key: 'global' }, { $set: body }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  return doc;
}

export async function adminConfig() {
  return (await ManualPaymentConfig.findOne({ key: 'global' }).lean()) ?? { key: 'global', enabled: false };
}

/** What a partner can still pay for this purpose, in rupees (cash owed, commission due, or the plan's price). */
async function limitFor(userId: string, purpose: ManualPurpose, planId?: string, role?: PartnerRole) {
  if (purpose === 'rider_cash') {
    const { owed } = await payableCod(userId);
    const left = round2(owed - (await awaitingCash(userId)));
    if (left <= 0) throw new ApiError(400, 'You have no cash to pay right now.');
    return { max: left };
  }
  if (purpose === 'provider_dues') {
    const s = await providerWalletSummary(userId);
    const left = round2(Math.max(0, s.due - s.duePending));
    if (left <= 0) throw new ApiError(400, s.duePending > 0 ? 'Your payment is waiting for the office to confirm.' : 'You have no commission due.');
    return { max: left };
  }
  if (!planId || !Types.ObjectId.isValid(planId)) throw new ApiError(400, 'Choose a plan.');
  const plan = await SubscriptionPlan.findOne({ _id: planId, audience: role, active: true }).lean();
  if (!plan) throw new ApiError(404, 'This plan is not available any more. Pick another plan.');
  return { max: plan.price, plan };
}

export interface SubmitInput { purpose: ManualPurpose; amount: number; method: ManualMethod; reference: string; proof?: string; note?: string; planId?: string }

export async function submitManualPayment(userId: string, role: PartnerRole, input: SubmitInput) {
  const cfg = await publicConfig();
  if (!cfg.enabled) throw new ApiError(400, 'Manual payment is not switched on. Please contact autozo.');
  if (!PURPOSES[role].includes(input.purpose)) throw new ApiError(403, 'This payment is not for your account type.');
  // One at a time per purpose: wait for the office before sending the next one.
  if (await ManualPayment.exists({ user: userId, purpose: input.purpose, status: 'pending' })) {
    throw new ApiError(409, 'Your earlier payment is still waiting for the office to confirm.');
  }
  const { max, plan } = await limitFor(userId, input.purpose, input.planId, role);
  const amount = plan ? plan.price : round2(input.amount);
  if (!plan && amount > max + 0.5) throw new ApiError(400, `You can pay at most ₹${max} right now.`);
  return ManualPayment.create({
    user: userId, role, purpose: input.purpose, amount, method: input.method, reference: input.reference, proof: input.proof, note: input.note,
    ...(plan ? { plan: plan._id, planName: plan.name, days: plan.days } : {}),
  });
}

/** Applies a confirmed payment: clears the cash / commission or adds the plan days. */
async function apply(p: { _id: Types.ObjectId; user: Types.ObjectId; purpose: ManualPurpose; amount: number; method: string; reference: string; plan?: Types.ObjectId; planName?: string; days?: number; role: PartnerRole }) {
  const note = `Paid by ${p.method.toUpperCase()} (${p.reference}), confirmed by the office`;
  if (p.purpose === 'rider_cash') {
    await settleRiderCod(p.user, p.amount);
    await WalletTxn.create({ rider: p.user, kind: 'cash_submit', amount: p.amount, status: 'confirmed', reference: p.reference, note });
  } else if (p.purpose === 'provider_dues') {
    await ProviderTxn.create({ provider: p.user, kind: 'commission_paid', amount: p.amount, method: p.method === 'bank' ? 'bank' : 'upi', reference: p.reference, status: 'confirmed', note });
    await refreshProviderDue(p.user);
  } else {
    const period = await addPlanDays(p.user, p.days ?? 0);
    await SubscriptionPayment.create({ user: p.user, audience: p.role, source: 'admin', plan: p.plan, planName: p.planName ?? 'Plan', days: p.days ?? 0, amount: p.amount, status: 'paid', paymentId: p.reference, note: 'Manual payment', ...period });
  }
}

/** The admin decides. Only one caller can move a payment out of `pending`, so it is applied exactly once. */
export async function decide(id: string, adminId: string, status: 'confirmed' | 'rejected', adminNote?: string) {
  const p = await ManualPayment.findOneAndUpdate(
    { _id: id, status: 'pending' },
    { $set: { status, handledBy: adminId, handledAt: new Date(), ...(adminNote ? { adminNote } : {}) } },
    { new: true },
  ).lean();
  if (!p) {
    if (await ManualPayment.exists({ _id: id })) throw new ApiError(409, 'This payment was already handled.');
    throw new ApiError(404, 'Payment not found');
  }
  if (status === 'confirmed') await apply(p as never);
  void pushToUsers([String(p.user)], {
    title: status === 'confirmed' ? 'Payment received' : 'Payment not received',
    body: status === 'confirmed'
      ? `The office confirmed your ₹${p.amount} payment.`
      : `The office could not find your ₹${p.amount} payment${adminNote ? ` (${adminNote})` : ''}. Please check and pay again.`,
    data: { type: 'manual_payment', url: '/wallet' },
  });
  return p;
}
