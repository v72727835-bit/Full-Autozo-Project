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
  /** Firebase: phone OTP (sign-up / login) and push notifications. */
  firebase?: {
    webConfig?: { apiKey?: string; authDomain?: string; projectId?: string; appId?: string; messagingSenderId?: string; storageBucket?: string; vapidKey?: string };
    serviceAccountEnc?: string;
    otpOnSignup?: boolean;
    otpOnLogin?: boolean;
    pushEnabled?: boolean;
  };
}

const schema = new Schema<IIntegrations>(
  {
    key: { type: String, default: 'global', unique: true },
    google: { clientId: { type: String, trim: true } },
    facebook: { appId: { type: String, trim: true }, appSecretEnc: String },
    razorpay: { keyId: { type: String, trim: true }, keySecretEnc: String, enabled: { type: Boolean, default: true } },
    firebase: {
      webConfig: {
        apiKey: { type: String, trim: true },
        authDomain: { type: String, trim: true },
        projectId: { type: String, trim: true },
        appId: { type: String, trim: true },
        messagingSenderId: { type: String, trim: true },
        storageBucket: { type: String, trim: true },
        vapidKey: { type: String, trim: true },
      },
      serviceAccountEnc: String,
      otpOnSignup: { type: Boolean, default: false },
      otpOnLogin: { type: Boolean, default: false },
      pushEnabled: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

export const Integrations = model<IIntegrations>('Integrations', schema);
