'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/client/api';
import { PAUSE_LABELS, PAUSE_REASONS, type PauseReason } from '@/lib/core';
import type { Pause } from '@/lib/progress';

export function PauseForm({ pauses }: { pauses: Pause[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState<PauseReason>('nights');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api('/api/me/pauses', { body: { starts_on: start, ends_on: end, reason } }); setOpen(false); setStart(''); setEnd(''); router.refresh(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not save'); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    try { await api(`/api/me/pauses/${id}`, { method: 'DELETE' }); router.refresh(); } catch { setError('Could not remove that pause'); }
  }
  return (
    <div className="stack">
      {!open ? <button type="button" className="linkbtn small" onClick={() => setOpen(true)}>Pause my streak for nights, leave or exams</button> : (
        <form className="panel stack" onSubmit={save} aria-label="Pause the streak">
          <div className="row">
            <label className="field" htmlFor="ps">From<input id="ps" type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
            <label className="field" htmlFor="pe">To<input id="pe" type="date" value={end} onChange={(e) => setEnd(e.target.value)} required /></label>
          </div>
          <div className="chips" role="group" aria-label="Reason">
            {PAUSE_REASONS.map((r) => <button key={r} type="button" className="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>{PAUSE_LABELS[r]}</button>)}
          </div>
          {error ? <p className="notice error small" role="alert">{error}</p> : null}
          <div className="row">
            <button className="btn" type="submit" disabled={busy || !start || !end}>Save pause</button>
            <button className="btn quiet" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      {pauses.length ? <div className="chips">{pauses.map((x) => <button key={x.id} type="button" className="chip small" onClick={() => remove(x.id)} title="Remove this pause">Remove pause {x.starts_on} ✕</button>)}</div> : null}
    </div>
  );
}
