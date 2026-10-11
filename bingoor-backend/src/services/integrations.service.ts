import { env } from '../config/env';
import { Integrations } from '../models/Integrations';
import { open } from '../utils/secretBox';

/** What the server uses right now: the admin panel's values, falling back to the .env file. */
export interface LiveIntegrations {
  googleClientId?: string;
  facebookAppId?: string;
  facebookAppSecret?: string;
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  razorpayEnabled: boolean;
}

const TTL_MS = 15_000;
let cache: { at: number; value: LiveIntegrations } | null = null;

const safeOpen = (s?: string) => {
  try {
    return s ? open(s) : undefined;
  } catch {
    return undefined; // a secret that cannot be read is treated as not set
  }
};

export function invalidateIntegrations() {
  cache = null;
}

export async function getIntegrations(): Promise<LiveIntegrations> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const doc = await Integrations.findOne({ key: 'global' }).lean();
  const value: LiveIntegrations = {
    googleClientId: doc?.google?.clientId || env.GOOGLE_CLIENT_ID,
    facebookAppId: doc?.facebook?.appId || env.FACEBOOK_APP_ID,
    facebookAppSecret: safeOpen(doc?.facebook?.appSecretEnc) || env.FACEBOOK_APP_SECRET,
    razorpayKeyId: doc?.razorpay?.keyId || env.RAZORPAY_KEY_ID,
    razorpayKeySecret: safeOpen(doc?.razorpay?.keySecretEnc) || env.RAZORPAY_KEY_SECRET,
    razorpayEnabled: doc?.razorpay?.enabled ?? true,
  };
  cache = { at: Date.now(), value };
  return value;
}
