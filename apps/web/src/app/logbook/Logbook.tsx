'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/client/api';
import { OUTCOME_STATEMENTS, REFLECTION_PROMPTS, REFLECTION_LIMITS, suggestTags, wordCount, type ReflectionPromptId } from '@/lib/core';

export interface Entry { id: string; body: string; words: number; tags: string[]; prompt_id: string; created_at: string }

const short = (code: string) => OUTCOME_STATEMENTS.find((o) => o.code === code)?.short ?? code;
const fmt = (iso: string) => new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Adelaide' }).format(new Date(iso));
const IDENTIFIER = /\b(\d{6,})\b|\bURN\b|\bMRN\b|\bDOB\b/i;

export function Logbook({ initial }: { initial: Entry[] }) {
  const router = useRouter();
  const [entries, setEntries] = useState(initial);
  const [body, setBody] = useState('');
  const [prompt, setPrompt] = useState<ReflectionPromptId | ''>('');
  const [tags, setTags] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggested = useMemo(() => (body.length >= 40 ? suggestTags(body) : []), [body]);
  const words = wordCount(body);
  const toggle = (c: string) => setTags((xs) => (xs.includes(c) ? xs.filter((x) => x !== c) : xs.length < 6 ? [...xs, c] : xs));
  const identifiers = IDENTIFIER.test(body);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ id: string }>('/api/reflections', { body: { body, tags, prompt_id: prompt || undefined } });
      setEntries((xs) => [{ id: r.id, body, words, tags, prompt_id: prompt, created_at: new Date().toISOString() }, ...xs]);
      setBody(''); setTags([]); setPrompt('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save. Your text is still here; try again.');
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    try { await api(`/api/reflections/${id}`, { method: 'DELETE' }); setEntries((xs) => xs.filter((x) => x.id !== id)); router.refresh(); }
    catch { setError('Could not delete that entry.'); }
  }

  async function retag(id: string, next: string[]) {
    setEntries((xs) => xs.map((x) => (x.id === id ? { ...x, tags: next } : x)));
    try { await api(`/api/reflections/${id}`, { method: 'PUT', body: { tags: next } }); router.refresh(); }
    catch { setError('Could not save the tags.'); }
  }

  const visible = showAll ? OUTCOME_STATEMENTS.map((o) => o.code) : [...new Set([...suggested, ...tags])];

  return (
    <>
      <form className="panel stack" onSubmit={save} aria-labelledby="new">
        <h2 id="new">New entry</h2>
        <div className="chips" role="group" aria-label="A prompt, if you want one">
          {REFLECTION_PROMPTS.map((p) => <button key={p.id} type="button" className="chip" aria-pressed={prompt === p.id} onClick={() => setPrompt(prompt === p.id ? '' : p.id)}>{p.text}</button>)}
        </div>
        <label className="field" htmlFor="r-body">What happened, and what you take from it
          <textarea id="r-body" value={body} maxLength={REFLECTION_LIMITS.max} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 160 }} />
        </label>
        <p className="small muted num">{words} word{words === 1 ? '' : 's'}. About five minutes of writing is a few hundred.</p>
        {identifiers ? <p className="notice warn small">That looks like it could include a record number or date of birth. Keep entries free of anything that identifies a patient.</p> : null}
        <div className="stack">
          <p className="small" style={{ fontWeight: 700, margin: 0 }}>Outcome statements this shows {suggested.length ? <span className="muted" style={{ fontWeight: 400 }}>(suggested from your words; confirm or change them)</span> : null}</p>
          <div className="chips" role="group" aria-label="Outcome statement tags">
            {visible.map((c) => <button key={c} type="button" className="chip" aria-pressed={tags.includes(c)} onClick={() => toggle(c)}>{c} {short(c)}</button>)}
            <button type="button" className="chip" onClick={() => setShowAll((s) => !s)}>{showAll ? 'Fewer' : 'All 28…'}</button>
          </div>
        </div>
        {error ? <p className="notice error" role="alert">{error}</p> : null}
        <button className="btn" type="submit" disabled={busy || body.trim().length < REFLECTION_LIMITS.min || identifiers}>{busy ? 'Saving…' : 'Save entry'}</button>
      </form>

      <section className="stack" aria-labelledby="entries">
        <h2 id="entries">Your entries <span className="small muted num">({entries.length})</span></h2>
        {!entries.length ? <p className="muted">Nothing logged yet. Your first entry earns the First reflection badge.</p> : null}
        {entries.map((e) => (
          <article key={e.id} className="panel stack">
            <p className="small muted">{fmt(e.created_at)}{e.prompt_id ? ` · ${REFLECTION_PROMPTS.find((p) => p.id === e.prompt_id)?.text ?? ''}` : ''}</p>
            <p style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-reading)' }}>{e.body}</p>
            <div className="chips" role="group" aria-label="Tags">
              {[...new Set([...e.tags, ...suggestTags(e.body)])].map((c) => <button key={c} type="button" className="chip small" aria-pressed={e.tags.includes(c)} onClick={() => retag(e.id, e.tags.includes(c) ? e.tags.filter((x) => x !== c) : [...e.tags, c].slice(0, 6))}>{c} {short(c)}</button>)}
            </div>
            <button type="button" className="linkbtn small" onClick={() => remove(e.id)}>Delete</button>
          </article>
        ))}
      </section>
    </>
  );
}
