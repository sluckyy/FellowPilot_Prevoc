'use client';
import { useEffect } from 'react';
import { startBackgroundSync } from '@/client/queue';

/** Registers the service worker (offline shell) and starts sending queued events. */
export function Background({ signedIn }: { signedIn: boolean }) {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    }
    if (signedIn) startBackgroundSync();
  }, [signedIn]);
  return null;
}
