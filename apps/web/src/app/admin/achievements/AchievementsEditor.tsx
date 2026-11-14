'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ACHIEVEMENT_RULES, ACHIEVEMENT_RULE_TYPES, type AchievementRule } from '@/lib/core';
import type { AdminAchievement } from '@/lib/achievements';
import { api, ApiError } from '@/client/api';

type RuleType = AchievementRule['type'];
interface FormState { id: string; title: string; description: string; type: RuleType; n: string; points: string; sort: string; active: boolean; national: boolean }

const toForm = (a: AdminAchievement): FormState => ({
  id: a.id, title: a.title, description: a.description, type: a.rule.type, n: String(a.rule.n),
  points: a.rule.type === 'calibrated' ? String(Math.round(a.rule.maxBias * 100)) : '5',
  sort: String(a.sort), active: a.active, national: a.national,
});
const blank = (sort: number): FormState => ({ id: '', title: '', description: '', type: 'answered', n: '50', points: '5', sort: String(sort), active: true, national: false });
const ruleOf = (f: FormState): AchievementRule =>
  (f.type === 'calibrated' ? { type: f.type, n: Number(f.n), maxBias: Number(f.points) / 100 } : { type: f.type, n: Number(f.n) }) as AchievementRule;

export function AchievementsEditor({ initial, people }: { initial: AdminAchievement[]; people: number }) {
  const [editing, setEditing] = useState<string | null>(null);   // id, or 'new'
  const nextSort = Math.max(0, ...initial.map((a) => a.sort)) + 10;
  return (
    <div className="stack">
      {editing === 'new'
        ? <AchievementForm isNew start={blank(nextSort)} onDone={() => setEditing(null)} />
        : <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing('new')}>New achievement</button>}
      <ul className="qlist" aria-label="Achievements">
        {initial.map((a) => (
          <li key={a.id}>
            {editing === a.id ? <AchievementForm isNew={false} start={toForm(a)} earned={a.earned} onDone={() => setEditing(null)} /> : (
              <div className={`badge${a.active ? ' done' : ''}`} style={{ opacity: a.active ? 1 : 0.6 }}>
                <span className="medal" aria-hidden>{a.active ? '★' : '☆'}</span>
                <div style={{ flex: 1, minWidth: 0 }} className="stack">
                  <div>
                    <p style={{ margin: 0, fontWeight: 700 }}>{a.title}{!a.active ? <span className="small muted"> (switched off)</span> : null}</p>
                    <p className="small muted" style={{ margin: 0 }}>{a.description}</p>
                  </div>
                  <p className="small" style={{ margin: 0 }}>
                    {ACHIEVEMENT_RULES[a.rule.type].label}: <span className="num">{a.rule.n}</span>
                    {a.rule.type === 'calibrated' ? <>, within <span className="num">{Math.round(a.rule.maxBias * 100)}</span> points</> : null}
                    <span className="muted"> · {a.national ? 'All states' : 'This state only'} · earned by <span className="num">{a.earned}</span> of {people} · order {a.sort} · <code>{a.id}</code></span>
                  </p>
                </div>
                <button type="button" className="btn quiet" onClick={() => setEditing(a.id)} aria-label={`Edit ${a.title}`}>Edit</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AchievementForm({ isNew, start, earned = 0, onDone }: { isNew: boolean; start: FormState; earned?: number; onDone: () => void }) {
  const router = useRouter();
  const [f, setF] = useState(start);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));
  const info = ACHIEVEMENT_RULES[f.type];
  const suggestion = info.example(Number(f.n) || 0, Number(f.points) / 100);
  const ruleChanged = !isNew && (f.type !== start.type || f.n !== start.n || f.points !== start.points);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErrors({}); setError(null);
    const body = { id: f.id, title: f.title, description: f.description, rule: ruleOf(f), sort: Number(f.sort), active: f.active, national: f.national };
    try {
      if (isNew) await api('/api/admin/achievements', { body });
      else await api(`/api/admin/achievements/${f.id}`, { method: 'PUT', body });
      onDone();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
      // Validation failures come back with field-level messages.
      if (err instanceof ApiError && err.data.errors && typeof err.data.errors === 'object') setErrors(err.data.errors as Record<string, string>);
      setBusy(false);
    }
  }

  const Err = ({ k }: { k: string }) => (errors[k] ? <p className="gate error">{errors[k]}</p> : null);
  const fid = (k: string) => `ach-${isNew ? 'new' : f.id}-${k}`;

  return (
    <form className="panel stack" onSubmit={save} aria-label={isNew ? 'New achievement' : `Edit ${start.title}`}>
      <h2 style={{ fontSize: '1.15rem' }}>{isNew ? 'New achievement' : `Edit “${start.title}”`}</h2>
      {isNew ? (
        <label className="field" htmlFor={fid('id')}>ID <small>Permanent. Lowercase letters, numbers and hyphens, e.g. &ldquo;night-owl&rdquo;</small>
          <input id={fid('id')} type="text" value={f.id} maxLength={40} onChange={(e) => set('id', e.target.value.toLowerCase())} />
        </label>
      ) : null}
      <Err k="id" />
      <label className="field" htmlFor={fid('title')}>Title
        <input id={fid('title')} type="text" value={f.title} maxLength={60} onChange={(e) => set('title', e.target.value)} />
      </label>
      <Err k="title" />
      <label className="field" htmlFor={fid('type')}>Rewards
        <select id={fid('type')} value={f.type} onChange={(e) => set('type', e.target.value as RuleType)}>
          {ACHIEVEMENT_RULE_TYPES.map((t) => <option key={t} value={t}>{ACHIEVEMENT_RULES[t].label}</option>)}
        </select>
      </label>
      <Err k="rule" />
      <div className="row">
        <label className="field" htmlFor={fid('n')} style={{ flex: '1 1 8rem' }}>{info.count}
          <input id={fid('n')} type="text" inputMode="numeric" value={f.n} onChange={(e) => set('n', e.target.value.replace(/\D/g, ''))} />
        </label>
        {f.type === 'calibrated' ? (
          <label className="field" htmlFor={fid('points')} style={{ flex: '1 1 8rem' }}>Within (points)
            <input id={fid('points')} type="text" inputMode="numeric" value={f.points} onChange={(e) => set('points', e.target.value.replace(/\D/g, ''))} />
          </label>
        ) : null}
        <label className="field" htmlFor={fid('sort')} style={{ flex: '1 1 8rem' }}>Order <small>Lower shows first</small>
          <input id={fid('sort')} type="text" inputMode="numeric" value={f.sort} onChange={(e) => set('sort', e.target.value.replace(/\D/g, ''))} />
        </label>
      </div>
      <Err k="n" /><Err k="maxBias" /><Err k="sort" />
      <label className="field" htmlFor={fid('desc')}>How to earn it <small>Shown to trainees</small>
        <textarea id={fid('desc')} value={f.description} maxLength={200} style={{ minHeight: 64 }} onChange={(e) => set('description', e.target.value)} />
      </label>
      {f.description.trim() !== suggestion ? (
        <p className="small muted" style={{ margin: 0 }}>Suggested: &ldquo;{suggestion}&rdquo; <button type="button" className="linkbtn small" onClick={() => set('description', suggestion)}>Use this</button></p>
      ) : null}
      <Err k="description" />
      <label className="check" htmlFor={fid('national')}>
        <input id={fid('national')} type="checkbox" checked={f.national} onChange={(e) => set('national', e.target.checked)} />
        <span>All states <span className="small muted">(otherwise only people in this state see it)</span></span>
      </label>
      <label className="check" htmlFor={fid('active')}>
        <input id={fid('active')} type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
        <span>Switched on <span className="small muted">(trainees can see and earn it)</span></span>
      </label>
      {ruleChanged && earned > 0 ? <p className="notice warn">{earned} {earned === 1 ? 'person has' : 'people have'} already earned this and will keep it under the new rule.</p> : null}
      <div className="stack">
        <p className="small" style={{ margin: 0, fontWeight: 700 }}>How trainees will see it</p>
        <div className="badge">
          <span className="medal" aria-hidden>☆</span>
          <div><p style={{ margin: 0, fontWeight: 700 }}>{f.title || 'Title'}</p><p className="small muted" style={{ margin: 0 }}>{f.description || 'How to earn it'}</p></div>
        </div>
      </div>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      <div className="row">
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Add achievement' : 'Save changes'}</button>
        <button className="btn quiet" type="button" onClick={onDone} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

