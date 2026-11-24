import { ManualPayment } from '../models/ManualPayment';
import { adminConfig, decide, partnerRole, publicConfig, saveConfig, submitManualPayment, SubmitInput } from '../services/manualPayment.service';
import { asyncHandler } from '../utils/asyncHandler';
import { created, ok, pageMeta } from '../utils/response';

/* ---------- rider / provider / warehouse ---------- */

/** Where to pay (QR, UPI, bank), if the admin switched manual payment on. */
export const info = asyncHandler(async (req, res) => {
  partnerRole(req.user!.role);
  ok(res, await publicConfig());
});

/** Send a payment made outside the app; it waits for the office (Pending) until confirmed. */
export const submit = asyncHandler(async (req, res) => {
  const role = partnerRole(req.user!.role);
  created(res, await submitManualPayment(req.user!.id, role, req.body as SubmitInput));
});

/** My manual payments, newest first, each Pending / Successful / Rejected. */
export const mine = asyncHandler(async (req, res) => {
  partnerRole(req.user!.role);
  ok(res, await ManualPayment.find({ user: req.user!.id }).sort({ createdAt: -1 }).limit(30).lean());
});

/* ---------- admin ---------- */

export const getConfig = asyncHandler(async (_req, res) => ok(res, await adminConfig()));

export const putConfig = asyncHandler(async (req, res) => ok(res, await saveConfig(req.body)));

export const list = asyncHandler(async (req, res) => {
  const { status, page, limit } = req.query as unknown as { status?: string; page: number; limit: number };
  const filter = status ? { status } : {};
  const [rows, total, pending] = await Promise.all([
    ManualPayment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('user', 'name phone role providerId').lean(),
    ManualPayment.countDocuments(filter),
    ManualPayment.countDocuments({ status: 'pending' }),
  ]);
  ok(res, rows, { ...pageMeta(page, limit, total), pending });
});

export const confirm = asyncHandler(async (req, res) => {
  ok(res, await decide(String(req.params.id), req.user!.id, 'confirmed', (req.body as { note?: string })?.note));
});

export const reject = asyncHandler(async (req, res) => {
  ok(res, await decide(String(req.params.id), req.user!.id, 'rejected', (req.body as { reason?: string })?.reason));
});
