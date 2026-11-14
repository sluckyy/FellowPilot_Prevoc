'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/client/api';
import { OUTCOME_DOMAINS, OUTCOME_STATEMENTS, GOAL_LIMITS, type Goal } from '@/lib/core';
import { SETTING_LABELS } from '@/lib/constants';

interface Prev { career_intent: string; strengths: string; concerns: string; learning_prefs: string; goals: Goal[] }
interface Done { version: number; recommended: string[]; checkinDue: string }

const EXAMPLES = [
  'Be confident recognising and escalating a deteriorating patient on my own overnight',
  'Prescribe fluids, electrolytes and anticoagulants safely without needing to check every time',
  'Give a clear ISBAR handover and speak up when something is not right',
  'Work in a culturally safe way with Aboriginal patients and their families',
];

export function PlanForm({ pgyLevel, settingPreference, img, previous }: { pgyLevel: number | null; settingPreference: string; img: boolean; previous: Prev | null }) {
  const [pgy, setPgy] = useState<number | null>(pgyLevel);
  const [setting, setSetting] = useState(settingPreference);
  const [isImg, setImg] = useState(img);
  const [intent, setIntent] = useState(previous?.career_intent ?? '');
  const [strengths, setStrengths] = useState(previous?.strengths ?? '');
  const [concerns, setConcerns] = useState(previous?.concerns ?? '');
  const [prefs, setPrefs] = useState(previous?.learning_prefs ?? '');
  const [goals, setGoals] = useState<Goal[]>(previous?.goals.length ? previous.goals : [{ text: '', outcomes: [] }]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const setGoal = (i: number, patch: Partial<Goal>) => setGoals((gs) => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const setOutcome = (i: number, slot: number, code: string) => setGoals((gs) => gs.map((g, j) => {
    if (j !== i) return g;
    const out = [...g.outcomes]; out[slot] = code;
    return { ...g, outcomes: [...new Set(out.filter(Boolean))] };
  }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setErrors({});
    try {
      const r = await api<Done>('/api/plan', { body: { pgy_level: pgy, setting_preference: setting, img: isImg, career_intent: intent, strengths, concerns, learning_prefs: prefs, goals } });
      setDone(r);
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiError) { setError(err.message); setErrors((err.data.errors as Record<string, string>) ?? {}); }
      else setError('Could not save. Try again.');
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <section className="panel stack" role="status">
        <h2>{done.version === 1 ? 'Plan saved' : 'Check-in complete'}</h2>
        <p>Your next check-in is due around {new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${done.checkinDue}T00:00:00Z`))}. We will remind you on your home page.</p>
        {done.recommended.length ? (
          <>
            <p><strong>A good place to start</strong>, from the outcome statements your goals point at:</p>
            <div className="stack">
              {done.recommended.map((a) => <Link key={a} className="btn secondary block" href={`/practice?size=10&area=${encodeURIComponent(a)}`}>Practise {a}</Link>)}
            </div>
          </>
        ) : null}
        <Link className="btn block" href="/">Home</Link>
      </section>
    );
  }

  const Select = ({ i, slot, label }: { i: number; slot: number; label: string }) => (
    <label className="field small" htmlFor={`g-${i}-o-${slot}`}>{label}
      <select id={`g-${i}-o-${slot}`} value={goals[i].outcomes[slot] ?? ''} onChange={(e) => setOutcome(i, slot, e.target.value)}>
        <option value="">{slot === 0 ? 'Choose an outcome statement' : 'None'}</option>
        {OUTCOME_DOMAINS.map((d) => (
          <optgroup key={d.id} label={`${d.id.replace('D', 'Domain ')}: ${d.title}`}>
            {OUTCOME_STATEMENTS.filter((o) => o.domain === d.id).map((o) => <option key={o.code} value={o.code}>{o.code} {o.short}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <section className="panel stack" aria-labelledby="about">
        <h2 id="about">About you</h2>
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>Your year</legend>
          <div className="chips" role="group" aria-label="Your year">
            {[1, 2].map((n) => <button key={n} type="button" className="chip" aria-pressed={pgy === n} onClick={() => setPgy(n)}>PGY{n}</button>)}
          </div>
          {errors.pgy_level ? <p className="notice error small" role="alert">{errors.pgy_level}</p> : null}
        </fieldset>
        <label className="field" htmlFor="p-setting">Where you mostly work
          <select id="p-setting" value={setting} onChange={(e) => setSetting(e.target.value)}>
            {Object.entries(SETTING_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="check" htmlFor="p-img"><input id="p-img" type="checkbox" checked={isImg} onChange={(e) => setImg(e.target.checked)} /><span>I trained overseas (international medical graduate pathway)</span></label>
        <label className="field" htmlFor="p-intent">Where are you heading? <small>Optional. A specialty, general practice, rural generalism, not sure yet: all fine.</small>
          <input id="p-intent" type="text" value={intent} maxLength={GOAL_LIMITS.careerIntent} onChange={(e) => setIntent(e.target.value)} />
        </label>
        <label className="field" htmlFor="p-strengths">What do you already do well? <small>Optional</small>
          <textarea id="p-strengths" value={strengths} maxLength={GOAL_LIMITS.strengths} onChange={(e) => setStrengths(e.target.value)} style={{ minHeight: 72 }} />
        </label>
        <label className="field" htmlFor="p-concerns">What worries you most about the next six months? <small>Optional. Nights alone, prescribing, difficult conversations, whatever it is.</small>
          <textarea id="p-concerns" value={concerns} maxLength={GOAL_LIMITS.concerns} onChange={(e) => setConcerns(e.target.value)} style={{ minHeight: 72 }} />
        </label>
        <label className="field" htmlFor="p-prefs">How do you like to learn? <small>Optional. Short bursts on the bus, a block on the weekend, with others, by writing it down.</small>
          <input id="p-prefs" type="text" value={prefs} maxLength={GOAL_LIMITS.learningPrefs} onChange={(e) => setPrefs(e.target.value)} />
        </label>
      </section>

      <section className="panel stack" aria-labelledby="goals">
        <h2 id="goals">Your goals for the next six months</h2>
        <p className="small muted">One to four. Make each one something you could notice yourself doing. For example: {EXAMPLES[0].toLowerCase()}.</p>
        {errors.goals ? <p className="notice error small" role="alert">{errors.goals}</p> : null}
        {goals.map((g, i) => (
          <div key={i} className="stack" style={{ borderLeft: '4px solid var(--primary)', paddingLeft: 12 }}>
            <label className="field" htmlFor={`g-${i}`}>Goal {i + 1}
              <input id={`g-${i}`} type="text" value={g.text} maxLength={GOAL_LIMITS.goalText} placeholder={EXAMPLES[i % EXAMPLES.length]} onChange={(e) => setGoal(i, { text: e.target.value })} />
            </label>
            {errors[`goals.${i}`] ? <p className="notice error small" role="alert">{errors[`goals.${i}`]}</p> : null}
            <Select i={i} slot={0} label="Which outcome statement is this mostly about?" />
            {g.outcomes[0] ? <Select i={i} slot={1} label="And another, if it fits" /> : null}
            {goals.length > 1 ? <button type="button" className="linkbtn small" onClick={() => setGoals((gs) => gs.filter((_, j) => j !== i))}>Remove this goal</button> : null}
          </div>
        ))}
        {goals.length < GOAL_LIMITS.goals ? <button type="button" className="btn quiet" onClick={() => setGoals((gs) => [...gs, { text: '', outcomes: [] }])}>Add another goal</button> : null}
      </section>

      {error ? <p className="notice error" role="alert">{error}</p> : null}
      <button className="btn" type="submit" disabled={busy || !goals.some((g) => g.text.trim())}>{busy ? 'Saving…' : previous ? 'Save my revised plan' : 'Save my plan'}</button>
    </form>
  );
}
