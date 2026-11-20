import crypto from 'crypto';
import { Types } from 'mongoose';
import { User } from '../models/User';

/* Upper case, no 0/O/1/I/L look-alikes: easy to read out and type. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const makeCode = (len = 6) => Array.from(crypto.randomBytes(len), (b) => ALPHABET[b % ALPHABET.length]).join('');

/** A person's share code, made the first time it is asked for and the same ever after. */
export async function ensureReferralCode(userId: Types.ObjectId | string): Promise<string> {
  const existing = await User.findById(userId).select('referralCode').lean();
  if (existing?.referralCode) return existing.referralCode;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeCode(attempt < 4 ? 6 : 8);
    try {
      const done = await User.findOneAndUpdate({ _id: userId, referralCode: { $exists: false } }, { $set: { referralCode: code } }, { new: true }).select('referralCode').lean();
      if (done?.referralCode) return done.referralCode;
      // Lost a race with another request for the same user: use what they saved.
      const now = await User.findById(userId).select('referralCode').lean();
      if (now?.referralCode) return now.referralCode;
    } catch (err: any) {
      if (err?.code !== 11000) throw err; // code taken by someone else: try another
    }
  }
  throw new Error('Could not make a referral code');
}

/** Whose code is this? Anything blank, odd or unknown is simply "nobody". */
export async function findReferrer(raw: unknown): Promise<Types.ObjectId | undefined> {
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return undefined;
  const owner = await User.findOne({ referralCode: code }).select('_id').lean();
  return owner?._id;
}

export const countReferred = (userId: Types.ObjectId | string) => User.countDocuments({ referredBy: userId });
