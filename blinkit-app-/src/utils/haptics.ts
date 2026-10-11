import { Vibration } from 'react-native';

/**
 * A short buzz on the taps that matter.
 *
 * Vibration rather than a haptics library: the app already depends on enough
 * native modules, and all this needs is a few milliseconds of motor. Every
 * call is wrapped because an emulator or a phone with the motor disabled
 * throws, and a missing buzz must never take a screen down with it.
 */
function buzz(ms: number) {
  try {
    Vibration.vibrate(ms);
  } catch {
    /* no motor on this device */
  }
}

/** Switching tabs - the lightest tick there is. */
export const tapTab = () => buzz(10);

/** Confirming something the customer chose, e.g. the delivery time. */
export const tapConfirm = () => buzz(20);
