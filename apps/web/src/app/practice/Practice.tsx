'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AnswerTracker, CONFIDENCE_LABELS, shuffleOptions,
  type AppEvent, type ChangeReason, type Confidence, type OptionId,
} from '@/lib/core';
import type { Feedback, ServedItem } from '@/lib/data';
import { APP_VERSION, CONTEXT_LABELS, FLAG_COMMENT_MIN, FLAG_REASONS } from '@/lib/constants';
import { enqueue, flush } from '@/client/queue';
import { api, ApiError } from '@/client/api';
import { ConfidenceScale } from '@/components/ConfidenceScale';
import { Tutor } from '@/components/Tutor';

type Phase = 'loading' | 'answering' | 'sending' | 'feedback' | 'saved-offline' | 'done' | 'empty' | 'error';
interface SetResponse { set_id: string; mode: string; items: ServedItem[] }
interface Outcome { correct: boolean | null; points: number | null; confidence: Confidence; area: string }

const CACHE_KEY = 'mcq.offline-set.v1';
const REASONS: { value: ChangeReason; label: string }[] = [
  { value: 'reread_stem', label: 'Re-read the question' },
  { value: 'recalled_fact', label: 'Remembered a fact' },
  { value: 'gut_feeling', label: 'Gut feeling' },
  { value: 'ran_out_of_time', label: 'Rushed' },
  { value: 'other', label: 'Something else' },
];

export function Practice({ size, area, mode, userId, tenantId }: {
  size: number; area: string; mode: 'mixed' | 'misconceptions'; userId: string; tenantId: string;
}) {
  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const [set, setSet] = useState<SetResponse | null>(null);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [offlineSet, setOfflineSet] = useState(false);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const tracker = useRef<AnswerTracker | null>(null);
  const sentEvents = useRef(0);
  const [order, setOrder] = useState<OptionId[]>(['A', 'B', 'C', 'D']);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [reason, setReason] = useState<ChangeReason | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [flagOpen, setFlagOpen] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const envelope = useMemo(() => ({ user_id: userId, tenant_id: tenantId, session_id: sessionId, app_version: APP_VERSION, mode: 'learning' as const }), [userId, tenantId, sessionId]);
  const item = set?.items[idx] ?? null;

  /** Puts the tracker's new events into the device queue. */
  const pushEvents = useCallback(() => {
    const t = tracker.current;
    if (!t) return;
    const fresh = t.events.slice(sentEvents.current);
    sentEvents.current = t.events.length;
    enqueue(...fresh);
  }, []);

  const logSession = useCallback((type: 'session_started' | 'session_ended', payload: Record<string, unknown>) => {
    const e: AppEvent = { ...envelope, event_id: crypto.randomUUID(), event_type: type, client_ts: new Date().toISOString(), payload };
    enqueue(e);
  }, [envelope]);

  // Load a set (or the cached one when offline), and cache another for offline use.
  useEffect(() => {
    const params = new URLSearchParams({ size: String(size), mode });
    if (area) params.set('area', area);
    let cancelled = false;
    (async () => {
      try {
        const s = await api<SetResponse>(`/api/sets/next?${params}`);
        if (cancelled) return;
        if (!s.items.length) { setPhase('empty'); return; }
        setSet(s);
        setPhase('answering');
        logSession('session_started', { set_id: s.set_id, set_size: s.items.length, area: area || null, mode, online: true });
        api<SetResponse>(`/api/sets/next?size=10`).then((n) => {
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(n)); } catch { /* ignore */ }
        }).catch(() => {});
      } catch (e) {
        if (cancelled) return;
        let cached: SetResponse | null = null;
        try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null'); } catch { /* ignore */ }
        if (e instanceof ApiError && e.status === 0 && cached?.items.length) {
          setSet(cached); setOfflineSet(true); setPhase('answering');
          logSession('session_started', { set_id: cached.set_id, set_size: cached.items.length, mode, online: false });
        } else {
          setError(e instanceof ApiError ? e.message : 'Could not load questions.');
          setPhase('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [size, area, mode, logSession]);

  // New tracker for each question.
  useEffect(() => {
    if (!set || !item) return;
    const o = shuffleOptions();
    setOrder(o);
    sentEvents.current = 0;
    tracker.current = new AnswerTracker({
      envelope, itemId: item.item_id, itemVersion: item.version, optionOrder: o,
      positionInSet: idx + 1, setId: set.set_id, isPretest: item.is_pretest, attemptNumber: item.attempt_number,
    });
    pushEvents();
    setFeedback(null);
    setReason(null);
    setFlagOpen(false);
    rerender();
    topRef.current?.scrollIntoView({ block: 'start' });
  }, [set, idx, item, envelope, pushEvents]);

  const select = (o: OptionId) => { if (phase !== 'answering') return; tracker.current?.select(o); pushEvents(); rerender(); };
  const setConfidence = (c: Confidence) => { if (phase !== 'answering') return; tracker.current?.setConfidence(c); pushEvents(); rerender(); };

  async function submit() {
    const t = tracker.current;
    if (!t?.canSubmit || !item) return;
    t.submit();
    pushEvents();
    setPhase('sending');
    const r = await flush();
    const f = r.feedback.find((x) => x.item_id === item.item_id && x.item_version === item.version) ?? null;
    if (f) {
      setFeedback(f);
      setOutcomes((xs) => [...xs, { correct: f.correct, points: f.points, confidence: t.confidence!, area: item.learning_area }]);
      setPhase('feedback');
    } else {
      // Offline, or the server is busy: the answer is safe in the queue.
      setOutcomes((xs) => [...xs, { correct: null, points: null, confidence: t.confidence!, area: item.learning_area }]);
      setPhase('saved-offline');
    }
  }

  function chooseReason(r: ChangeReason) {
    if (reason) return;
    setReason(r);
    tracker.current?.giveChangeReason(r);
    pushEvents();
    void flush();
  }

  function next() {
    if (!set) return;
    if (idx + 1 >= set.items.length) {
      logSession('session_ended', { set_id: set.set_id, answered: outcomes.length });
      void flush();
      setPhase('done');
      window.scrollTo({ top: 0 });
      return;
    }
    setIdx(idx + 1);
    setPhase('answering');
  }

  // Keyboard: A-D choose, 1-4 confidence, Enter submits or moves on.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Enter' && e.target instanceof HTMLButtonElement) return; // the button handles its own Enter
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      if (phase === 'answering') {
        const pos = ['A', 'B', 'C', 'D'].indexOf(k);
        if (pos >= 0) { select(order[pos]); return; }
        if (['1', '2', '3', '4'].includes(k)) { setConfidence(Number(k) as Confidence); return; }
        if (k === 'ENTER' && tracker.current?.canSubmit) void submit();
      } else if ((phase === 'feedback' || phase === 'saved-offline') && k === 'ENTER') next();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (phase === 'loading') return <div className="page"><p className="muted">Choosing your questions…</p></div>;
  if (phase === 'error') return <div className="page"><p className="notice error" role="alert">{error}</p><Link className="btn" href="/">Back to home</Link></div>;
  if (phase === 'empty') {
    return (
      <div className="page stack">
        <h1>Nothing to practise here yet</h1>
        <p>{mode === 'misconceptions' ? 'No confident errors are due for review. They come back two days after you get them wrong.' : 'There are no reviewed questions for this choice yet.'}</p>
        <Link className="btn" href="/">Back to home</Link>
      </div>
    );
  }
  if (phase === 'done') return <Summary outcomes={outcomes} />;
  if (!item || !tracker.current) return null;

  const t = tracker.current;
  const answered = phase === 'feedback' || phase === 'saved-offline';
  const optionText = (id: OptionId) => item.options.find((o) => o.id === id)?.text ?? '';
  const changed = (t.events.filter((e) => e.event_type === 'option_selected').length > 1);

  return (
    <div className="page" ref={topRef} style={{ scrollMarginTop: 80 }}>
      <div className="qhead">
        <span className="num muted">Question {idx + 1} of {set!.items.length}</span>
        <div className="tags"><span className="tag">{item.learning_area}</span><span className="tag">{CONTEXT_LABELS[item.context] ?? item.context}</span>{item.pgy_level !== 'both' ? <span className="tag">{item.pgy_level}</span> : null}{item.review_level === 'none' ? <span className="tag warn" title="Written with AI and checked by an independent AI reviewer. Clinical review is still to come.">AI-reviewed, not yet clinically reviewed</span> : null}</div>
      </div>
      {offlineSet ? <p className="notice warn small">You&apos;re offline. Answers are saved on this device and sent when you reconnect.</p> : null}

      <article className="stack" aria-labelledby="leadin">
        <p className="stem">{item.stem}</p>
        <p className="leadin" id="leadin">{item.lead_in}</p>
        <ul className="options" aria-label="Answer options">
          {order.map((id, pos) => {
            const isKey = !!feedback && feedback.key === id;
            const isWrongPick = !!feedback && feedback.final_option === id && !feedback.correct;
            const cls = ['option', isKey ? 'is-key' : '', isWrongPick ? 'is-wrong' : ''].join(' ');
            return (
              <li key={id}>
                <button type="button" className={cls} aria-pressed={t.selected === id} disabled={answered || phase === 'sending'} onClick={() => select(id)}>
                  <span className="letter" aria-hidden>{'ABCD'[pos]}</span>
                  <span>{optionText(id)}</span>
                  {feedback ? (
                    <>
                      {isKey ? <span className="verdict">Best answer</span> : isWrongPick ? <span className="verdict">Your answer</span> : null}
                      <span className="why">{feedback.explanations[id]}</span>
                    </>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </article>

      {!answered ? (
        <ConfidenceScale value={t.confidence} onChange={setConfidence} disabled={phase === 'sending'} />
      ) : null}

      {phase === 'saved-offline' ? (
        <p className="notice warn" role="status">Answer saved on this device. You&apos;ll see the explanation and points once you&apos;re back online.</p>
      ) : null}

      {feedback ? (
        <section className="stack reveal" aria-live="polite">
          <div className="result">
            <strong>{feedback.correct ? 'Correct' : 'Not this time'}</strong>
            <span className={`points ${feedback.points >= 0 ? 'gain' : 'loss'}`}>{feedback.points >= 0 ? '+' : ''}{feedback.points} points</span>
            <span className="muted small">You were {CONFIDENCE_LABELS[feedback.final_confidence].toLowerCase()}.</span>
          </div>
          {!feedback.correct && feedback.points > 0 ? (
            <p className="small muted">You still earn points for honestly saying you weren&apos;t sure. Rating your confidence accurately always scores best over time.</p>
          ) : null}
          {!feedback.correct && feedback.final_confidence >= 3 ? (
            <p className="notice warn small">You felt sure about this one. Confident errors are the most valuable to review; it will come back in a couple of days.</p>
          ) : null}
          <div className="stack">
            <h2>Key point</h2>
            <p>{feedback.learning_point}</p>
          </div>
          {feedback.rural_note ? <div className="stack"><h2>In a regional hospital</h2><p>{feedback.rural_note}</p></div> : null}
          {feedback.references?.length ? (
            <div className="stack">
              <h2>Read more</h2>
              <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                {feedback.references.map((r, i) => <li key={i}>{[r.title, r.locator].filter(Boolean).join(', ')}</li>)}
              </ul>
            </div>
          ) : null}
          {changed ? (
            <div className="stack">
              <p className="small"><strong>You changed your answer.</strong> What made you change? <span className="muted">Optional</span></p>
              <div className="chips" role="group" aria-label="Reason for changing">
                {REASONS.map((r) => <button key={r.value} type="button" className="chip" aria-pressed={reason === r.value} disabled={!!reason} onClick={() => chooseReason(r.value)}>{r.label}</button>)}
              </div>
            </div>
          ) : null}
          <Tutor key={item.item_id} itemId={item.item_id} version={item.version} order={order} correct={feedback.correct} sessionId={sessionId} envelope={envelope} />
          {flagOpen ? <FlagForm item={item} sessionId={sessionId} onDone={() => setFlagOpen(false)} /> : (
            <button type="button" className="linkbtn small" onClick={() => setFlagOpen(true)}>Report a problem with this question</button>
          )}
        </section>
      ) : null}

      <div className="actionbar">
        <div className="actionbar-inner">
          {answered ? (
            <button type="button" className="btn" onClick={next}>{idx + 1 >= set!.items.length ? 'Finish set' : 'Next question'}</button>
          ) : (
            <button type="button" className="btn" onClick={submit} disabled={!t.canSubmit || phase === 'sending'}>
              {phase === 'sending' ? 'Checking…' : !t.selected ? 'Choose an answer' : !t.confidence ? 'Rate your confidence' : 'Submit answer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FlagForm({ item, sessionId, onDone }: { item: ServedItem; sessionId: string; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [suspended, setSuspended] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState('sending'); setError(null);
    try {
      const r = await api<{ suspended: boolean }>('/api/flags', { body: { item_id: item.item_id, item_version: item.version, reason, comment, session_id: sessionId } });
      setSuspended(!!r.suspended);
      setState('sent');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the report.');
      setState('idle');
    }
  }
  if (state === 'sent') {
    return (
      <p className="notice info small" role="status">
        {suspended
          ? 'Thanks. We\'ve taken this question out of practice for everyone until a reviewer checks it, and you\'ll be told the outcome.'
          : 'Thanks. A reviewer will look at this question, and you\'ll be told the outcome.'}
      </p>
    );
  }
  return (
    <form className="panel stack" onSubmit={send}>
      <h2>Report a problem</h2>
      <label className="field" htmlFor="flag-reason">What&apos;s wrong?
        <select id="flag-reason" value={reason} onChange={(e) => setReason(e.target.value)} required>
          <option value="">Choose a reason</option>
          {FLAG_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </label>
      <label className="field" htmlFor="flag-comment">What looks wrong? <small>A sentence is enough. A guideline reference helps.</small>
        <textarea id="flag-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} required />
      </label>
      <p className="small muted" style={{ margin: 0 }}>Reporting takes the question out of practice for everyone until a reviewer checks it.</p>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      <div className="row">
        <button className="btn" type="submit" disabled={!reason || comment.trim().length < FLAG_COMMENT_MIN || state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send report'}</button>
        <button className="btn quiet" type="button" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

interface ProgressNews { streak: number; met_this_week: boolean; this_week: number; goal: number; new_achievements: { id: string; title: string; description: string }[] }

function Summary({ outcomes }: { outcomes: Outcome[] }) {
  const marked = outcomes.filter((o) => o.correct !== null);
  const correct = marked.filter((o) => o.correct).length;
  const points = marked.reduce((s, o) => s + (o.points ?? 0), 0);
  const confidentErrors = marked.filter((o) => !o.correct && o.confidence >= 3).length;
  const pending = outcomes.length - marked.length;
  // The area this set covered most, as a suggestion for writing a question.
  const counts = new Map<string, number>();
  for (const o of outcomes) counts.set(o.area, (counts.get(o.area) ?? 0) + 1);
  const topArea = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const [news, setNews] = useState<ProgressNews | null>(null);
  useEffect(() => { api<ProgressNews>('/api/progress').then(setNews).catch(() => {}); }, []);
  return (
    <div className="page">
      <div className="stack">
        <h1>Set complete</h1>
        <p className="num" style={{ fontSize: '1.2rem' }}>{correct} of {marked.length} correct, <span className={`points ${points >= 0 ? 'gain' : 'loss'}`}>{points >= 0 ? '+' : ''}{points} points</span></p>
        {confidentErrors ? <p>{confidentErrors} {confidentErrors === 1 ? 'was a confident error' : 'were confident errors'}. They&apos;ll come back for review in a couple of days, and they&apos;re at the top of your study guide.</p> : null}
        {pending ? <p className="muted">{pending} answer{pending === 1 ? ' is' : 's are'} saved on this device and will be marked when you reconnect.</p> : null}
        {news ? (
          <p className="small muted num">
            {news.this_week} of {news.goal} questions this week{news.met_this_week ? ': weekly goal met.' : '.'}
            {news.streak ? ` ${news.streak}-week streak.` : ''}
          </p>
        ) : null}
        {news?.new_achievements.map((a) => (
          <div key={a.id} className="badge done" role="status">
            <span className="medal" aria-hidden>★</span>
            <div><p className="small" style={{ margin: 0, fontWeight: 700 }}>Achievement unlocked</p><p style={{ margin: 0, fontWeight: 700 }}>{a.title}</p><p className="small muted" style={{ margin: 0 }}>{a.description}</p></div>
          </div>
        ))}
      </div>
      <div className="stack">
        <Link className="btn block" href="/practice?size=10">Another 10 questions</Link>
        <Link className="btn secondary block" href="/guide">Your study guide</Link>
        <Link className="btn quiet block" href="/insights">See your insights</Link>
        <Link className="btn quiet block" href="/logbook">Log a reflection on this set</Link>
        {topArea ? <Link className="btn quiet block" href={`/write/new?area=${encodeURIComponent(topArea)}`}>Write a question on {topArea}</Link> : null}
        <Link className="btn quiet block" href="/">Home</Link>
      </div>
    </div>
  );
}
