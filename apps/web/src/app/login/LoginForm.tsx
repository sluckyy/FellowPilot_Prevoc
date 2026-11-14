'use client';
import { useState } from 'react';
import { api, ApiError } from '@/client/api';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState('sending');
    try {
      await api('/api/auth/request', { body: { email } });
      setState('sent');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the link. Try again.');
      setState('idle');
    }
  }

  if (state === 'sent') {
    return (
      <div className="notice info stack" role="status">
        <strong>Check your email</strong>
        <p>If {email} is registered for the beta, a sign-in link is on its way. It works once and expires in 15 minutes. Check your junk folder if it hasn&apos;t arrived in a couple of minutes.</p>
        <button type="button" className="linkbtn" onClick={() => setState('idle')}>Use a different email</button>
      </div>
    );
  }
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <label className="field" htmlFor="email">Email
        <input id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      <button className="btn" type="submit" disabled={state === 'sending' || !email}>
        {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
      </button>
    </form>
  );
}
