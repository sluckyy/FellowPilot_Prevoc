'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/client/api';
import { CHALLENGE_LABELS, CHALLENGE_TYPES, CURRICULUM, type Challenge } from '@/lib/core';

export interface SeasonRow { id: string; title: string; theme: string; starts_on: string; ends_on: string; challenge: Challenge; team_goal: number | null; focus_areas: string[]; active: boolean; updated_at: string }
type Form = { id: string; title: string; theme: string; starts_on: string; ends_on: string; type: Challenge['type']; n: string; area: string; team_goal: string; focus_areas: string[]; active: boolean };

const blank = (): Form => ({ id: '', title: '', theme: '', starts_on: '', ends_on: '', type: 'answered', n: '50', area: '', team_goal: '', focus_areas: [], active: true });
const fromRow = (s: SeasonRow): Form => ({ id: s.id, title: s.title, theme: s.theme, starts_on: s.starts_on, ends_on: s.ends_on, type: s.challenge.type, n: String(s.challenge.n), area: s.challenge.area ?? '', team_goal: s.team_goal === null ? '' : String(s.team_goal), focus_areas: s.focus_areas, active: s.active });
const TYPE_LABELS: Record<Challenge['type'], string> = { answered: 'Questions answered', reflections: 'Reflections logged', areas_covered: 'Learning areas practised', area_answered: 'Questions answered in one area' };

export function SeasonsEditor({ initial }: { initial: SeasonRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [f, setF] = useState<Form>(blank());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const start = (s: SeasonRow | 'new') => { setF(s === 'new' ? blank() : fromRow(s)); setEditing(s === 'new' ? 'new' : s.id); setErrors({}); setError(null); };

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null); setErrors({});
    const body = { id: f.id, title: f.title, theme: f.theme, starts_on: f.starts_on, ends_on: f.ends_on, team_goal: f.team_goal === '' ? null : Number(f.team_goal),
      focus_areas: f.focus_areas, active: f.active, challenge: { type: f.type, n: Number(f.n), ...(f.type === 'area_answered' ? { area: f.area } : {}) } };
    try {
      if (editing === 'new') await api('/api/admin/seasons', { body });
      else await api(`/api/admin/seasons/${editing}`, { method: 'PUT', body });
      setEditing(null); router.refresh();
    } catch (err) {
      if (err instanceof ApiError) { setError(err.message); setErrors((err.data.errors as Record<string, string>) ?? {}); } else setError('Could not save.');
    } finally { setBusy(false); }
  }

  const form = (name: string) => (
    <form className="panel stack" onSubmit={save} aria-label={name}>
      <h2>{name}</h2>
      {editing === 'new' ? <label className="field" htmlFor="s-id">ID <small>Short, lowercase, e.g. 2026-12-sepsis. Cannot change later.</small><input id="s-id" type="text" value={f.id} onChange={(e) => set('id', e.target.value)} />{errors.id ? <span className="notice error small">{errors.id}</span> : null}</label> : null}
      <label className="field" htmlFor="s-title">Title<input id="s-title" type="text" value={f.title} maxLength={60} onChange={(e) => set('title', e.target.value)} />{errors.title ? <span className="notice error small">{errors.title}</span> : null}</label>
      <label className="field" htmlFor="s-theme">Theme <small>One or two sentences trainees see.</small><textarea id="s-theme" value={f.theme} maxLength={300} style={{ minHeight: 64 }} onChange={(e) => set('theme', e.target.value)} /></label>
      <div className="row">
        <label className="field" htmlFor="s-start">Starts<input id="s-start" type="date" value={f.starts_on} onChange={(e) => set('starts_on', e.target.value)} /></label>
        <label className="field" htmlFor="s-end">Ends<input id="s-end" type="date" value={f.ends_on} onChange={(e) => set('ends_on', e.target.value)} /></label>
      </div>
      {errors.dates ? <p className="notice error small">{errors.dates}</p> : null}
      <label className="field" htmlFor="s-type">Challenge<select id="s-type" value={f.type} onChange={(e) => set('type', e.target.value as Challenge['type'])}>{CHALLENGE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</select></label>
      <div className="row">
        <label className="field" htmlFor="s-n">Target per person<input id="s-n" type="text" inputMode="numeric" value={f.n} onChange={(e) => set('n', e.target.value)} /></label>
        <label className="field" htmlFor="s-tg">Team target <small>Optional; otherwise target × members.</small><input id="s-tg" type="text" inputMode="numeric" value={f.team_goal} onChange={(e) => set('team_goal', e.target.value)} /></label>
      </div>
      {f.type === 'area_answered' ? <label className="field" htmlFor="s-area">Area<select id="s-area" value={f.area} onChange={(e) => set('area', e.target.value)}><option value="">Choose</option>{CURRICULUM.map((c) => <option key={c.area} value={c.area}>{c.area}</option>)}</select></label> : null}
      {errors.challenge ? <p className="notice error small">{errors.challenge}</p> : null}
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 700, marginBottom: 6 }}>Focus areas <small className="muted" style={{ fontWeight: 400 }}>Highlighted to trainees; up to 6.</small></legend>
        <div className="chips">{CURRICULUM.map((c) => <button key={c.area} type="button" className="chip small" aria-pressed={f.focus_areas.includes(c.area)} onClick={() => set('focus_areas', f.focus_areas.includes(c.area) ? f.focus_areas.filter((a) => a !== c.area) : [...f.focus_areas, c.area].slice(0, 6))}>{c.area}</button>)}</div>
      </fieldset>
      <label className="check" htmlFor="s-active"><input id="s-active" type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /><span>Switched on</span></label>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      <div className="row"><button className="btn" type="submit" disabled={busy}>{editing === 'new' ? 'Add season' : 'Save changes'}</button><button className="btn quiet" type="button" onClick={() => setEditing(null)}>Cancel</button></div>
    </form>
  );

  return (
    <div className="stack">
      {editing === 'new' ? form('New season') : <button type="button" className="btn" onClick={() => start('new')}>New season</button>}
      <ul className="qlist">
        {initial.map((s) => (
          <li key={s.id}>
            {editing === s.id ? form(`Edit ${s.title}`) : (
              <div className="badge">
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{s.title} <span className="small muted">{s.starts_on} to {s.ends_on}{s.active ? '' : ' · switched off'}</span></p>
                  <p className="small muted" style={{ margin: 0 }}>{CHALLENGE_LABELS[s.challenge.type](s.challenge)}{s.team_goal ? `; team ${s.team_goal}` : ''}. {s.theme}</p>
                </div>
                <button type="button" className="btn quiet" onClick={() => start(s)} aria-label={`Edit ${s.title}`}>Edit</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
