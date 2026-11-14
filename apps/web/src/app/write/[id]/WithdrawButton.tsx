'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/client/api';

export function WithdrawButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  async function go() {
    setBusy(true); setError(null);
    try { await api(`/api/questions/${id}`, { body: { action: 'withdraw' } }); router.refresh(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not take it back'); setBusy(false); }
  }
  return (
    <div className="stack">
      <button type="button" className="btn quiet" onClick={go} disabled={busy}>Take back to edit</button>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
    </div>
  );
}
