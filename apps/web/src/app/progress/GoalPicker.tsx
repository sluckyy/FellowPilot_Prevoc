'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { WEEKLY_GOAL_CHOICES } from '@/lib/core';
import { api, ApiError } from '@/client/api';

export function GoalPicker({ goal }: { goal: number }) {
  const [value, setValue] = useState(goal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  async function choose(n: number) {
    setValue(n); setBusy(true); setError(null);
    try { await api('/api/me/goal', { method: 'PUT', body: { weekly_goal: n } }); router.refresh(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save'); setValue(goal); }
    finally { setBusy(false); }
  }
  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="small" style={{ fontWeight: 700, marginBottom: 8 }}>Questions per week</legend>
      <div className="chips">
        {WEEKLY_GOAL_CHOICES.map((n) => (
          <button key={n} type="button" className="chip num" aria-pressed={value === n} disabled={busy} onClick={() => choose(n)}>{n}</button>
        ))}
      </div>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
    </fieldset>
  );
}
