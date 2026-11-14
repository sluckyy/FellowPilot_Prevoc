'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/client/api';

const ROLE_CHOICES = [
  { value: 'trainee', label: 'Trainee' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'reviewer', label: 'Reviewer (can review questions trainees and supervisors write)' },
  { value: 'editor', label: 'Editor (can resolve question reports)' },
  { value: 'admin', label: 'Admin (can invite people)' },
];

export function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roles, setRoles] = useState<string[]>(['trainee']);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const toggle = (r: string) => setRoles((xs) => (xs.includes(r) ? xs.filter((x) => x !== r) : [...xs, r]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api('/api/admin/users', { body: { email, name, roles } });
      setMsg({ kind: 'info', text: `Invitation sent to ${email}. The link in it works for 7 days.` });
      setEmail(''); setName(''); setRoles(['trainee']);
      router.refresh();
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not send the invitation.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <label className="field" htmlFor="inv-email">Email
        <input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="field" htmlFor="inv-name">Name <small>Optional. They can change it.</small>
        <input id="inv-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 700, marginBottom: 6 }}>Roles</legend>
        {ROLE_CHOICES.map((r) => (
          <label key={r.value} className="check" htmlFor={`role-${r.value}`}>
            <input id={`role-${r.value}`} type="checkbox" checked={roles.includes(r.value)} onChange={() => toggle(r.value)} />
            <span>{r.label}</span>
          </label>
        ))}
      </fieldset>
      {msg ? <p className={`notice ${msg.kind}`} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p> : null}
      <button className="btn" type="submit" disabled={busy || !email || !roles.length}>{busy ? 'Sending…' : 'Send invitation'}</button>
    </form>
  );
}

export function FlagActions({ flagId }: { flagId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function resolve(outcome: string, action: string) {
    setBusy(true); setError(null);
    try {
      await api('/api/admin/flags', { body: { flag_id: flagId, outcome, action } });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the report.');
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <div className="row">
        <button className="btn quiet" type="button" disabled={busy} onClick={() => resolve('upheld', 'retired')}>Upheld: retire the question</button>
        <button className="btn quiet" type="button" disabled={busy} onClick={() => resolve('upheld', 'none')}>Upheld: keep it out until fixed</button>
        <button className="btn quiet" type="button" disabled={busy} onClick={() => resolve('not_upheld', 'none')}>Not upheld: put it back</button>
      </div>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
    </div>
  );
}

export function HeldActions({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act(action: 'reinstate' | 'retire') {
    setBusy(true); setError(null);
    try { await api('/api/admin/flags', { method: 'PUT', body: { item_id: itemId, action } }); router.refresh(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not update the question.'); setBusy(false); }
  }
  return (
    <div className="stack">
      <div className="row">
        <button className="btn quiet" type="button" disabled={busy} onClick={() => act('reinstate')}>Fixed: put it back</button>
        <button className="btn quiet" type="button" disabled={busy} onClick={() => act('retire')}>Retire it</button>
      </div>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
    </div>
  );
}
