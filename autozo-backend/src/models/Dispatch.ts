import { Schema, Types, model } from 'mongoose';

/**
 * A "ring session": the engine that finds someone to take a job. It is used by
 * two flows:
 *   - `service_booking` — rings nearby, approved, online service providers.
 *   - `order` — rings nearby riders of the order's warehouse.
 *
 * The session rings every live candidate at once (a loud, repeating push the
 * app keeps playing until the person answers). If nobody accepts within
 * `ringSeconds`, a sweep widens the search (next round, more candidates) and
 * rings again, so the bell "keeps ringing until someone accepts". When the
 * person who had it cancels, that candidate is excluded and the session goes
 * back to active so the next nearest people are rung instead.
 */
export const DISPATCH_KINDS = ['service_booking', 'order'] as const;
export type DispatchKind = (typeof DISPATCH_KINDS)[number];

export const DISPATCH_STATUSES = ['active', 'assigned', 'exhausted', 'cancelled'] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

export const CANDIDATE_STATES = ['ringing', 'declined', 'timed_out', 'won', 'skipped'] as const;
export type CandidateState = (typeof CANDIDATE_STATES)[number];

export interface IDispatchCandidate {
  user: Types.ObjectId;
  distanceKm: number;
  /** Which round they were first rung in. */
  round: number;
  notifiedAt?: Date;
  state: CandidateState;
}

export interface IDispatch {
  kind: DispatchKind;
  booking?: Types.ObjectId;
  order?: Types.ObjectId;
  status: DispatchStatus;
  /** Everyone considered so far, nearest first. */
  candidates: IDispatchCandidate[];
  /** People who must never be rung again for this job (e.g. the one who cancelled). */
  excluded: Types.ObjectId[];
  assignedTo?: Types.ObjectId;
  /** How many widening rounds have run. */
  round: number;
  /** Seconds a candidate is given to answer before the sweep moves on. */
  ringSeconds: number;
  /** The radius (km) the last round searched; grows each round. */
  radiusKm: number;
  /** When the current round's ring should be re-evaluated by the sweep. */
  nextSweepAt: Date;
  /** The job location the search centres on: [lng, lat]. */
  center: { type: 'Point'; coordinates: [number, number] };
  createdAt: Date;
  updatedAt: Date;
}

const candidateSchema = new Schema<IDispatchCandidate>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    distanceKm: { type: Number, default: 0 },
    round: { type: Number, default: 0 },
    notifiedAt: Date,
    state: { type: String, enum: CANDIDATE_STATES, default: 'ringing' },
  },
  { _id: false },
);

const dispatchSchema = new Schema<IDispatch>(
  {
    kind: { type: String, enum: DISPATCH_KINDS, required: true },
    booking: { type: Schema.Types.ObjectId, ref: 'ServiceBooking' },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    status: { type: String, enum: DISPATCH_STATUSES, default: 'active', index: true },
    candidates: { type: [candidateSchema], default: [] },
    excluded: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    round: { type: Number, default: 0 },
    ringSeconds: { type: Number, default: 30 },
    radiusKm: { type: Number, default: 5 },
    nextSweepAt: { type: Date, default: Date.now, index: true },
    center: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
  },
  { timestamps: true },
);

// The sweep queries active sessions whose round has timed out.
dispatchSchema.index({ status: 1, nextSweepAt: 1 });

export const Dispatch = model<IDispatch>('Dispatch', dispatchSchema);
