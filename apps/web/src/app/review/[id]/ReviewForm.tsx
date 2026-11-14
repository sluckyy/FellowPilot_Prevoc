'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/client/api';

const DECISIONS = [
  { value: 'accept', label: 'Accept', hint: 'Correct, one best answer, fair and useful. It joins the bank as a trial question.' },
  { value: 'changes', label: 'Request changes', hint: 'Close, but needs fixing. The author can edit and resend it.' },
  { value: 'reject', label: 'Don\'t accept', hint: 'Not suitable for the bank (for example, recalled from an exam or off-curriculum).' },
] as const;

export function ReviewForm({ id }: { id: string }) {
  const [decision, setDecision] = useState<'accept' | 'changes' | 'reject' | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api(`/api/questions/${id}`, { body: { action: 'review', decision, note } });
      router.push('/review');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the review');
      setBusy(false);
    }
  }
  const needsNote = decision === 'changes' || decision === 'reject';
  return (
    <form className="panel stack" onSubmit={submit} aria-labelledby="decide">
      <h2 id="decide">Your review</h2>
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sr-only">Decision</legend>
        {DECISIONS.map((x) => (
          <label key={x.value} className="check">
            <input type="radio" name="decision" value={x.value} checked={decision === x.value} onChange={() => setDecision(x.value)} />
            <span><strong>{x.label}</strong><br /><span className="small muted">{x.hint}</span></span>
          </label>
        ))}
      </fieldset>
      <label className="field" htmlFor="rv-note">Note to the author {needsNote ? <small>Required: what to change, or why</small> : <small>Optional</small>}
        <textarea id="rv-note" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      <button className="btn" type="submit" disabled={busy || !decision || (needsNote && note.trim().length < 10)}>{busy ? 'Saving…' : 'Save review'}</button>
    </form>
  );
}
