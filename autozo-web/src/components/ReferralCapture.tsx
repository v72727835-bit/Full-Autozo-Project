'use client';

import { useEffect } from 'react';
import { rememberReferral } from '../lib/referral';

/** Picks `?ref=CODE` off any page the visitor lands on. Renders nothing. */
export function ReferralCapture() {
  useEffect(() => {
    rememberReferral(new URLSearchParams(window.location.search).get('ref'));
  }, []);
  return null;
}
