'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/client/api';
import type { Team } from '@/lib/teams';

export function TeamClient({ team }: { team: Team | null }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('site');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act(body: Record<string, unknown>) {
    setBusy(true); setError(null);
    try { await api('/api/teams', { body }); router.refresh(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  }
  if (team) {
    return (
      <section className="panel stack" aria-labelledby="mine">
        <h2 id="mine">{team.name} <span className="small muted">({team.kind})</span></h2>
        <p className="num">{team.size} member{team.size === 1 ? '' : 's'}: {team.members.join(', ')}</p>
        <p>Invite others with the code <strong className="num" style={{ letterSpacing: '0.15em' }}>{team.join_code}</strong></p>
        {error ? <p className="notice error" role="alert">{error}</p> : null}
        <button type="button" className="btn quiet" disabled={busy} onClick={() => confirm('Leave this team?') && act({ action: 'leave' })}>Leave the team</button>
      </section>
    );
  }
  return (
    <div className="stack">
      <form className="panel stack" onSubmit={(e) => { e.preventDefault(); void act({ action: 'join', code }); }} aria-labelledby="join">
        <h2 id="join">Join a team</h2>
        <label className="field" htmlFor="t-code">Team code <small>Six characters, from whoever set the team up.</small>
          <input id="t-code" type="text" value={code} autoCapitalize="characters" maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </label>
        <button className="btn" type="submit" disabled={busy || code.length !== 6}>Join</button>
      </form>
      <form className="panel stack" onSubmit={(e) => { e.preventDefault(); void act({ action: 'create', name, kind }); }} aria-labelledby="create">
        <h2 id="create">Start a team</h2>
        <label className="field" htmlFor="t-name">Team name <small>Your hospital, site or cohort, for example &ldquo;Port Pirie interns&rdquo;.</small>
          <input id="t-name" type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field" htmlFor="t-kind">Kind
          <select id="t-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="site">Site or hospital</option><option value="cohort">Cohort</option><option value="other">Something else</option>
          </select>
        </label>
        <button className="btn secondary" type="submit" disabled={busy || name.trim().length < 2}>Create and get a code</button>
      </form>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
    </div>
  );
}
