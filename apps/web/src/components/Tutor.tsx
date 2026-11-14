'use client';
import { useEffect, useRef, useState } from 'react';
import type { AppEvent, OptionId } from '@/lib/core';
import { enqueue, flush } from '@/client/queue';

interface Msg { role: 'user' | 'assistant'; content: string; rating?: boolean }

const MAX_QUESTIONS = 8;

/** "Ask why": a short conversation about the question just answered, streamed from the server. */
export function Tutor({ itemId, version, order, correct, sessionId, envelope }: {
  itemId: string; version: number; order: OptionId[]; correct: boolean; sessionId: string;
  envelope: Omit<AppEvent, 'event_id' | 'event_type' | 'client_ts' | 'payload'>;
}) {
  const [status, setStatus] = useState<{ available: boolean; remaining: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const asked = msgs.filter((m) => m.role === 'user').length;

  useEffect(() => {
    fetch(`/api/tutor/${itemId}`).then((r) => (r.ok ? r.json() : null)).then(setStatus).catch(() => setStatus(null));
    return () => abort.current?.abort();
  }, [itemId]);

  if (!status) return null;
  if (!status.available) return <p className="small muted">The &ldquo;Ask why&rdquo; tutor isn&apos;t switched on yet.</p>;

  const suggestions = [
    'Why is the best answer right?',
    correct ? 'Why are the other options wrong?' : 'Why was my answer wrong?',
    'What would change in a well-resourced city hospital?',
  ];

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const history: Msg[] = [...msgs, { role: 'user', content: text }];
    setMsgs([...history, { role: 'assistant', content: '' }]);
    setInput(''); setBusy(true); setError(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch(`/api/tutor/${itemId}`, {
        method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version, option_order: order, session_id: sessionId, messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'The tutor is unavailable right now.');
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs([...history, { role: 'assistant', content: acc }]);
      }
      setStatus((s) => (s ? { ...s, remaining: Math.max(0, s.remaining - 1) } : s));
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setMsgs(history.slice(0, -1));
      setInput(text);
      setError(navigator.onLine ? (e as Error).message : 'The tutor needs a connection. Try again when you are back online.');
    } finally {
      setBusy(false);
    }
  }

  function rate(i: number, helpful: boolean) {
    setMsgs((xs) => xs.map((m, j) => (j === i ? { ...m, rating: helpful } : m)));
    enqueue({ ...envelope, event_id: crypto.randomUUID(), event_type: 'tutor_answer_rated', client_ts: new Date().toISOString(),
      payload: { item_id: itemId, helpful, turn_index: Math.floor(i / 2) } } as AppEvent);
    void flush();
  }

  if (!open) {
    return (
      <button type="button" className="btn quiet" onClick={() => setOpen(true)}>Ask why</button>
    );
  }

  return (
    <section className="panel stack tutor" aria-labelledby="tutor-h">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id="tutor-h">Ask why</h2>
        <span className="small muted num">{status.remaining} left today</span>
      </div>
      <p className="small muted">AI tutor for this question. It can be wrong: check anything important against the references. Don&apos;t enter details of real patients.</p>

      {msgs.length ? (
        <ol className="tutor-log" aria-live="polite">
          {msgs.map((m, i) => (
            <li key={i} className={m.role === 'user' ? 'from-you' : 'from-tutor'}>
              <span className="sr-only">{m.role === 'user' ? 'You asked:' : 'Tutor:'}</span>
              <p style={{ whiteSpace: 'pre-wrap' }}>{m.content || (busy && i === msgs.length - 1 ? 'Thinking…' : '')}</p>
              {m.role === 'assistant' && m.content && !(busy && i === msgs.length - 1) ? (
                <div className="row small">
                  {m.rating === undefined ? (
                    <>
                      <span className="muted">Helpful?</span>
                      <button type="button" className="chip" onClick={() => rate(i, true)}>Yes</button>
                      <button type="button" className="chip" onClick={() => rate(i, false)}>No</button>
                    </>
                  ) : <span className="muted">Thanks for the feedback.</span>}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <div className="chips" role="group" aria-label="Suggested questions">
          {suggestions.map((s) => <button key={s} type="button" className="chip" onClick={() => ask(s)} disabled={busy}>{s}</button>)}
        </div>
      )}

      {error ? <p className="notice error" role="alert">{error}</p> : null}

      {asked < MAX_QUESTIONS && status.remaining > 0 ? (
        <form className="row" onSubmit={(e) => { e.preventDefault(); void ask(input); }}>
          <label className="sr-only" htmlFor="tutor-input">Your question</label>
          <input id="tutor-input" type="text" value={input} onChange={(e) => setInput(e.target.value)} maxLength={1200}
            placeholder={asked ? 'Ask a follow-up' : 'Or ask your own question'} style={{ flex: '1 1 12rem' }} disabled={busy} />
          <button className="btn" type="submit" disabled={busy || !input.trim()}>{busy ? 'Answering…' : 'Ask'}</button>
        </form>
      ) : (
        <p className="small muted">{status.remaining > 0 ? 'That’s the limit for one question. Move on, or report the question if something seems wrong.' : 'You’ve used today’s tutor questions. They reset at midnight.'}</p>
      )}
    </section>
  );
}
