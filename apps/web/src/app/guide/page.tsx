import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { guideRows, learningAreas } from '@/lib/data';
import { studyGuide, GUIDE_MIN_AREA, type GuideArea, type Reading } from '@/lib/core';
import { PrintButton } from './PrintButton';

export const metadata = { title: 'Study guide' };
export const dynamic = 'force-dynamic';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const practise = (area: string) => `/practice?size=10&area=${encodeURIComponent(area)}`;

function Readings({ items }: { items: Reading[] }) {
  if (!items.length) return null;
  return (
    <div className="readings">
      <p className="small" style={{ margin: '4px 0', fontWeight: 700 }}>Read</p>
      <ul>{items.map((r) => <li key={`${r.title}|${r.locator}`}>{r.title}{r.locator ? <span className="muted">: {r.locator}</span> : null}</li>)}</ul>
    </div>
  );
}

function Area({ a, kind }: { a: GuideArea; kind: 'misconception' | 'weak' | 'fragile' }) {
  return (
    <article className={`guide-area stack${kind === 'fragile' ? ' fragile' : ''}`}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3>{a.learning_area}</h3>
        <span className="small muted num">{a.n} answered, {pct(a.accuracy)} correct</span>
      </div>
      {a.items.length ? (
        <ul>
          {a.items.map((i) => <li key={i.item_id}><strong>{i.presentation}</strong>: {i.learning_point}</li>)}
        </ul>
      ) : null}
      <Readings items={a.readings} />
      <p className="noprint small"><Link href={practise(a.learning_area)}>Practise {a.learning_area}</Link></p>
    </article>
  );
}

export default async function GuidePage() {
  const u = await requirePageUser();
  const [rows, areas] = await Promise.all([guideRows(u.id), learningAreas(u.tenantId)]);
  const g = studyGuide(rows, new Set(areas.map((a) => a.learning_area)));
  const today = new Intl.DateTimeFormat('en-AU', { dateStyle: 'long', timeZone: 'Australia/Adelaide' }).format(new Date());
  const nothingYet = !g.misconceptions.length && !g.weakest.length && !g.fragile.length;

  return (
    <div className="page">
      <div className="stack">
        <h1>Your study guide</h1>
        <p className="muted">Built from your {g.answered} answers as of {today}. It updates every time you practise. The key points are from questions you&apos;ve already seen; the readings point to where to study them properly.</p>
        <div className="row noprint"><PrintButton /></div>
      </div>

      {g.answered === 0 ? (
        <section className="panel stack">
          <p>Answer a set of questions and your guide will start here: what to fix first, your weakest areas and what to read.</p>
          <Link className="btn" href="/practice?size=10">Start 10 questions</Link>
        </section>
      ) : null}

      {g.misconceptions.length ? (
        <section className="stack" aria-labelledby="fix">
          <h2 id="fix">1. Fix these first</h2>
          <p className="small muted">You got these wrong while fairly sure or certain. Confident errors are the ones most likely to cost marks, and to matter with a real patient. Each drops off once you get it right on a later attempt.</p>
          {g.misconceptions.map((a) => <Area key={a.learning_area} a={a} kind="misconception" />)}
          <Link className="btn noprint" href="/practice?mode=misconceptions&size=10">Revisit confident errors</Link>
        </section>
      ) : null}

      {g.weakest.length ? (
        <section className="stack" aria-labelledby="weak">
          <h2 id="weak">{g.misconceptions.length ? '2.' : '1.'} Your weakest areas</h2>
          <p className="small muted">Lowest accuracy among areas where you&apos;ve answered at least {GUIDE_MIN_AREA}. Listed: key points from questions you missed.</p>
          {g.weakest.map((a) => <Area key={a.learning_area} a={a} kind="weak" />)}
        </section>
      ) : null}

      {g.fragile.length ? (
        <section className="stack" aria-labelledby="fragile">
          <h2 id="fragile">Right, but unsure</h2>
          <p className="small muted">You got these right while guessing or unsure. Consolidate them so you can answer them with confidence.</p>
          {g.fragile.map((a) => <Area key={a.learning_area} a={a} kind="fragile" />)}
        </section>
      ) : null}

      {g.habits.length ? (
        <section className="stack" aria-labelledby="habits">
          <h2 id="habits">Answering habits</h2>
          {g.habits.map((h) => <p key={h} className="insight">{h}</p>)}
        </section>
      ) : null}

      {g.answered > 0 && nothingYet ? <p className="insight good">No confident errors or weak areas yet. Keep going: the guide fills in as you answer more.</p> : null}

      {g.notStarted.length && g.answered > 0 ? (
        <section className="stack" aria-labelledby="next">
          <h2 id="next">Not started yet</h2>
          <p className="small muted">Large parts of the curriculum you haven&apos;t tried.</p>
          <ul className="readings">{g.notStarted.map((a) => <li key={a.area}><Link href={practise(a.area)}>{a.area}</Link> <span className="muted small">({pct(a.share)} of the bank)</span></li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}
