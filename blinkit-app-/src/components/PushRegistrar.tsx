import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { registerPush } from '../firebase/push';
import { useToast } from '../ui/Toast';

/** Once the customer is signed in, registers this phone for order notifications and shows messages that arrive while the app is open. */
export function PushRegistrar() {
  const { user } = useAuth();
  const toast = useToast();
  const userId = user?._id;

  useEffect(() => {
    if (!userId) return;
    let stop: () => void = () => undefined;
    let cancelled = false;
    registerPush('customer', (title, body) => toast.show(body ? `${title}: ${body}` : title)).then((off) => {
      if (cancelled) off();
      else stop = off;
    });
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return null;
}
