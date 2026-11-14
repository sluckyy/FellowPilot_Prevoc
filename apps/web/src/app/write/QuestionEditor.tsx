'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CONTEXTS, CURRICULUM, DRAFT_LIMITS, DRAFT_OPTIONS, curriculumArea, draftGates,
  type DraftQuestion, type OptionId,
} from '@/lib/core';
import { CONTEXT_LABELS } from '@/lib/constants';
import { api, ApiError } from '@/client/api';

type Busy = null | 'save' | 'coach' | 'submit' | 'discard';

export function QuestionEditor({ id: initialId, initial, declared: initialDeclared, coaching: initialCoaching, reviewNote, coachAvailable }: {
  id: string | null; initial: DraftQuestion; declared: boolean; coaching: string | null; reviewNote: string; coachAvailable: boolean;
}) {
  const router = useRouter();
  const [id, setId] = useState(initialId);
  const [d, setD] = useState<DraftQuestion>(initial);
  const [declared, setDeclared] = useState(initialDeclared);
  const [coaching, setCoaching] = useState(initialCoaching);
  const [busy, setBusy] = useState<Busy>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [tried, setTried] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const gates = useMemo(() => draftGates(d), [d]);
  const errors = gates.filter((g) => g.level === 'error');
  const warnings = gates.filter((g) => g.level === 'warning');
  const forField = (f: string) => gates.filter((g) => g.field === f && (g.level === 'warning' || tried));
  const area = curriculumArea(d.learning_area);

  const set = <K extends keyof DraftQuestion>(k: K, v: DraftQuestion[K]) => { setD((x) => ({ ...x, [k]: v })); setDirty(true); };
  const setOpt = (which: 'options' | 'explanations', k: OptionId, v: string) => { setD((x) => ({ ...x, [which]: { ...x[which], [k]: v } })); setDirty(true); };
  const setRef = (i: number, field: 'title' | 'locator', v: string) => {
    setD((x) => ({ ...x, references: x.references.map((r, j) => (j === i ? { ...r, [field]: v } : r)) })); setDirty(true);
  };

  /** Saves and returns the question's id (creating it on first save). */
  async function save(): Promise<string> {
    if (!id) {
      const r = await api<{ id: string }>('/api/questions', { body: { content: d } });
      await api(`/api/questions/${r.id}`, { method: 'PUT', body: { content: d, recall_declared: declared } });
      setId(r.id);
      window.history.replaceState(null, '', `/write/${r.id}`);
      setDirty(false);
      return r.id;
    }
    await api(`/api/questions/${id}`, { method: 'PUT', body: { content: d, recall_declared: declared } });
    setDirty(false);
    return id;
  }

  async function run(kind: Exclude<Busy, null>, fn: () => Promise<void>) {
    setBusy(kind); setMessage(null);
    try { await fn(); } catch (e) {
      setMessage({ tone: 'error', text: e instanceof ApiError ? e.message : 'Something went wrong. Try again.' });
    } finally { setBusy(null); }
  }

  const onSave = () => run('save', async () => { await save(); setMessage({ tone: 'info', text: 'Saved.' }); });
  const onCoach = () => run('coach', async () => {
    const qid = await save();
    const r = await api<{ coaching: { text: string } }>(`/api/questions/${qid}`, { body: { action: 'coach' } });
    setCoaching(r.coaching.text);
  });
  const onSubmit = () => run('submit', async () => {
    setTried(true);
    if (errors.length) { setMessage({ tone: 'error', text: `Fix ${errors.length} problem${errors.length === 1 ? '' : 's'} marked below first.` }); return; }
    if (!declared) { setMessage({ tone: 'error', text: 'Confirm that you wrote this question yourself.' }); return; }
    const qid = await save();
    await api(`/api/questions/${qid}`, { body: { action: 'submit' } });
    router.push(`/write/${qid}`);
    router.refresh();
  });
  const onDiscard = () => run('discard', async () => {
    if (id) await api(`/api/questions/${id}`, { body: { action: 'discard' } });
    router.push('/write');
    router.refresh();
  });

  const Gates = ({ field }: { field: string }) => (
    <>{forField(field).map((g, i) => <p key={i} className={`gate ${g.level}`}>{g.message}</p>)}</>
  );
  const invalid = (field: string) => (tried && gates.some((g) => g.field === field && g.level === 'error') ? 'invalid' : undefined);

  return (
    <div className="page">
      <div className="stack">
        <p className="small"><Link href="/write">Your questions</Link></p>
        <h1>{initialId ? 'Edit your question' : 'New question'}</h1>
        {reviewNote ? (
          <div className="notice warn"><p style={{ margin: 0, fontWeight: 700 }}>The reviewer asked for changes</p><p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{reviewNote}</p></div>
        ) : null}
      </div>

      <form className="stack" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
        <section className="stack" aria-labelledby="topic">
          <h2 id="topic">Topic</h2>
          <label className="field" htmlFor="q-area">Learning area
            <select id="q-area" className={invalid('learning_area')} value={d.learning_area} onChange={(e) => set('learning_area', e.target.value)}>
              <option value="">Choose…</option>
              {CURRICULUM.map((c) => <option key={c.area} value={c.area}>{c.area}</option>)}
            </select>
          </label>
          <Gates field="learning_area" />
          <label className="field" htmlFor="q-pres">Presentation <small>The clinical problem, for example &ldquo;sepsis&rdquo; or &ldquo;febrile infant&rdquo;</small>
            <input id="q-pres" type="text" list="q-pres-list" className={invalid('presentation')} value={d.presentation} maxLength={120} onChange={(e) => set('presentation', e.target.value)} />
          </label>
          <datalist id="q-pres-list">{(area?.presentations ?? []).map((p) => <option key={p} value={p} />)}</datalist>
          <Gates field="presentation" />
          <label className="field" htmlFor="q-ctx">Setting
            <select id="q-ctx" value={d.context} onChange={(e) => set('context', e.target.value)}>
              {CONTEXTS.map((c) => <option key={c} value={c}>{CONTEXT_LABELS[c]}</option>)}
            </select>
          </label>
        </section>

        <section className="stack" aria-labelledby="case">
          <h2 id="case">The question</h2>
          <label className="field" htmlFor="q-stem">Clinical vignette <small>{DRAFT_LIMITS.stemMin} to {DRAFT_LIMITS.stemMax} words: age, sex, setting, the key findings and relevant negatives. Australian units and drug names.</small>
            <textarea id="q-stem" className={invalid('stem')} value={d.stem} maxLength={4000} style={{ minHeight: 180 }} onChange={(e) => set('stem', e.target.value)} />
          </label>
          <Gates field="stem" />
          <label className="field" htmlFor="q-lead">Lead-in question
            <input id="q-lead" type="text" className={invalid('lead_in')} value={d.lead_in} maxLength={300} onChange={(e) => set('lead_in', e.target.value)} />
          </label>
          <Gates field="lead_in" />
        </section>

        <section className="stack" aria-labelledby="opts">
          <h2 id="opts">Options</h2>
          <p className="small muted">Four options, one clearly best. Mark the best answer. Options are shuffled for each trainee, so explain each one without referring to letters.</p>
          {DRAFT_OPTIONS.map((k) => (
            <div key={k} className={`optrow${d.key === k ? ' key' : ''}`}>
              <span className="letter" aria-hidden>{k}</span>
              <div className="fields">
                <label className="field" htmlFor={`q-opt-${k}`}><span className="sr-only">Option {k}</span>
                  <input id={`q-opt-${k}`} type="text" placeholder={`Option ${k}`} className={invalid(`options.${k}`)} value={d.options[k]} maxLength={DRAFT_LIMITS.optionMax} onChange={(e) => setOpt('options', k, e.target.value)} />
                </label>
                <Gates field={`options.${k}`} />
                <label className="field" htmlFor={`q-exp-${k}`}><small>{d.key === k ? 'Why this is the best answer' : 'Why this is not the best answer'}</small>
                  <textarea id={`q-exp-${k}`} className={invalid(`explanations.${k}`)} value={d.explanations[k]} maxLength={DRAFT_LIMITS.explanationMax} style={{ minHeight: 64 }} onChange={(e) => setOpt('explanations', k, e.target.value)} />
                </label>
                <Gates field={`explanations.${k}`} />
                <label className="keypick"><input type="radio" name="q-key" checked={d.key === k} onChange={() => set('key', k)} /> Best answer</label>
              </div>
            </div>
          ))}
          <Gates field="key" />
        </section>

        <section className="stack" aria-labelledby="teach">
          <h2 id="teach">Teaching</h2>
          <label className="field" htmlFor="q-lp">Key point <small>The one thing to remember, in a sentence</small>
            <textarea id="q-lp" className={invalid('learning_point')} value={d.learning_point} maxLength={DRAFT_LIMITS.textMax} style={{ minHeight: 64 }} onChange={(e) => set('learning_point', e.target.value)} />
          </label>
          <Gates field="learning_point" />
          <label className="field" htmlFor="q-rural">Setting note <small>Optional: what changes in a regional hospital, with no ICU or CT overnight, retrieval to Adelaide or one doctor on sits</small>
            <textarea id="q-rural" value={d.rural_note} maxLength={DRAFT_LIMITS.textMax} style={{ minHeight: 64 }} onChange={(e) => set('rural_note', e.target.value)} />
          </label>
          <Gates field="rural_note" />
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 700, marginBottom: 6 }}>References <small className="muted" style={{ fontWeight: 400 }}>Title, and where in it (chapter or section)</small></legend>
            {d.references.map((r, i) => (
              <div key={i} className="row">
                <input type="text" aria-label={`Reference ${i + 1} title`} placeholder="e.g. Therapeutic Guidelines: Antibiotic" value={r.title} maxLength={200} style={{ flex: '2 1 14rem' }} onChange={(e) => setRef(i, 'title', e.target.value)} />
                <input type="text" aria-label={`Reference ${i + 1} section`} placeholder="Section" value={r.locator} maxLength={200} style={{ flex: '1 1 8rem' }} onChange={(e) => setRef(i, 'locator', e.target.value)} />
              </div>
            ))}
            {d.references.length < DRAFT_LIMITS.references ? (
              <button type="button" className="linkbtn small" style={{ alignSelf: 'flex-start' }} onClick={() => { setD((x) => ({ ...x, references: [...x.references, { title: '', locator: '' }] })); setDirty(true); }}>Add another reference</button>
            ) : null}
            <Gates field="references" />
          </fieldset>
        </section>

        {coachAvailable ? (
          <section className="panel stack" aria-labelledby="coach">
            <h2 id="coach">AI feedback</h2>
            <p className="small muted">An AI reviewer checks your draft against item-writing good practice and current Australian guidance and suggests improvements. It won&apos;t rewrite it for you. It can be wrong: you and the human reviewer decide.</p>
            {coaching ? <p className="coach" aria-live="polite">{coaching}</p> : null}
            <button type="button" className="btn quiet" onClick={onCoach} disabled={busy !== null}>{busy === 'coach' ? 'Reading your draft…' : coaching ? 'Ask again' : 'Get AI feedback'}</button>
          </section>
        ) : null}

        <section className="stack" aria-labelledby="send">
          <h2 id="send">Send for review</h2>
          {errors.length || warnings.length ? (
            <div className="stack" aria-live="polite">
              {errors.length ? <p className="gate error" style={{ fontWeight: 700 }}>{errors.length} thing{errors.length === 1 ? '' : 's'} to fix before you can send it</p> : null}
              {warnings.length ? <p className="gate warning">{warnings.length} suggestion{warnings.length === 1 ? '' : 's'} marked above</p> : null}
            </div>
          ) : <p className="gate" style={{ color: 'var(--correct)' }}>Passes the automatic checks.</p>}
          <label className="check" htmlFor="q-declare">
            <input id="q-declare" type="checkbox" checked={declared} onChange={(e) => { setDeclared(e.target.checked); setDirty(true); }} />
            <span>I wrote this question myself. It is not recalled or copied from an examination or another question bank.</span>
          </label>
          {message ? <p className={`notice ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p> : null}
          <div className="row">
            <button type="button" className="btn" onClick={onSubmit} disabled={busy !== null}>{busy === 'submit' ? 'Sending…' : 'Send for review'}</button>
            <button type="submit" className="btn secondary" disabled={busy !== null || (!dirty && !!id)}>{busy === 'save' ? 'Saving…' : dirty || !id ? 'Save draft' : 'Saved'}</button>
            {id && !confirmDiscard ? <button type="button" className="btn quiet" onClick={() => setConfirmDiscard(true)} disabled={busy !== null}>Discard</button> : null}
            {id && confirmDiscard ? (
              <span className="row">
                <button type="button" className="btn quiet" onClick={onDiscard} disabled={busy !== null}>Yes, discard it</button>
                <button type="button" className="linkbtn small" onClick={() => setConfirmDiscard(false)}>Keep it</button>
              </span>
            ) : null}
          </div>
        </section>
      </form>
    </div>
  );
}

