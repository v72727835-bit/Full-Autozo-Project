import { Schema, model } from 'mongoose';

/**
 * Sign-in and payment keys the super admin types into the admin panel. Secrets
 * are kept encrypted (`...Enc`) and are never sent back to a browser.
 */
export interface IIntegrations {
  key: 'global';
  google?: { clientId?: string };
  facebook?: { appId?: string; appSecretEnc?: string };
  razorpay?: { keyId?: string; keySecretEnc?: string; enabled?: boolean };
}

const schema = new Schema<IIntegrations>(
  {
    key: { type: String, default: 'global', unique: true },
    google: { clientId: { type: String, trim: true } },
    facebook: { appId: { type: String, trim: true }, appSecretEnc: String },
    razorpay: { keyId: { type: String, trim: true }, keySecretEnc: String, enabled: { type: Boolean, default: true } },
  },
  { timestamps: true },
);

export const Integrations = model<IIntegrations>('Integrations', schema);
