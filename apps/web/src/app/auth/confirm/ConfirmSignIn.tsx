'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/client/api';

export function ConfirmSignIn({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : 'This sign-in link is incomplete. Request a new one.');

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/confirm', { body: { token } });
      window.location.assign('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sign you in. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {error ? <p className="notice error" role="alert">{error} <Link href="/login">Request a new link</Link></p> : null}
      <button className="btn" type="button" onClick={go} disabled={busy || !token}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </div>
  );
}
