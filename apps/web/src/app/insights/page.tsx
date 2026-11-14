import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { answerRows } from '@/lib/data';
import {
  areaStats, calibration, calibrationSummary, changeStats, insights, quadrants, totalPoints,
  MIN_FOR_CALIBRATION, MIN_PER_AREA,
} from '@/lib/core';

export const metadata = { title: 'Insights' };
export const dynamic = 'force-dynamic';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const REASON_LABELS: Record<string, string> = {
  reread_stem: 'After re-reading the question', recalled_fact: 'After remembering a fact', gut_feeling: 'On a gut feeling',
  ran_out_of_time: 'When rushed', other: 'Other reasons', not_given: 'No reason given',
};

export default async function InsightsPage() {
  const u = await requirePageUser();
  const rows = await answerRows(u.id);
  const firsts = rows.filter((r) => r.attempt_number === 1);

  if (!firsts.length) {
    return (
      <div className="page stack">
        <h1>Insights</h1>
        <p>Answer a set of questions and your patterns will start to appear here: how well your confidence matches your accuracy, whether changing answers helps you, and your weakest areas.</p>
        <Link className="btn" href="/practice?size=10">Start 10 questions</Link>
      </div>
    );
  }

  const cal = calibration(rows);
  const sum = calibrationSummary(rows);
  const ch = changeStats(rows);
  const quad = quadrants(rows);
  const areas = areaStats(rows);
  const notes = insights(rows);
  const correct = firsts.filter((r) => r.correct).length;

  return (
    <div className="page">
      <div className="stack">
        <h1>Insights</h1>
        <p className="num">{firsts.length} questions answered, {pct(correct / firsts.length)} correct, {totalPoints(rows)} points.</p>
      </div>

      {notes.length ? (
        <section className="stack" aria-label="Takeaways">
          {notes.map((n) => <p key={n.id} className={`insight ${n.tone}`}>{n.text}</p>)}
        </section>
      ) : null}

      <section className="stack" aria-labelledby="calib">
        <h2 id="calib">Confidence against accuracy</h2>
        <p className="small muted">Each bar is how often you were right at that confidence. The line is where a well-calibrated answer would sit.</p>
        <div className="calib">
          {cal.map((b) => (
            <div key={b.confidence} style={{ display: 'contents' }}>
              <span>{b.label}</span>
              <div className="track" role="img" aria-label={b.accuracy === null ? `${b.label}: no answers yet` : `${b.label}: ${pct(b.accuracy)} correct over ${b.n} answers, expected ${pct(b.expected)}`}>
                {b.accuracy !== null ? <div className="fill" style={{ width: pct(b.accuracy) }} /> : null}
                <div className="target" style={{ left: `calc(${pct(b.expected)} - 1px)` }} />
              </div>
              <span className="num small" style={{ textAlign: 'right' }}>{b.accuracy === null ? <span className="empty">none</span> : pct(b.accuracy)}</span>
            </div>
          ))}
        </div>
        <div className="legend">
          <span><span className="sw" style={{ background: 'var(--primary)' }} />Your accuracy</span>
          <span><span className="sw" style={{ background: 'var(--ink)', width: 3 }} />Expected at that confidence</span>
          {sum.n >= MIN_FOR_CALIBRATION && sum.brier !== null ? <span className="num">Calibration score {sum.brier.toFixed(3)} (lower is better)</span> : null}
        </div>
      </section>

      <section className="stack" aria-labelledby="quad">
        <h2 id="quad">What you know, and how sure you were</h2>
        <div className="quad">
          <div><div className="n">{quad.secure}</div><div className="small">Right and sure</div></div>
          <div className={quad.misconception ? 'hot' : undefined}><div className="n">{quad.misconception}</div><div className="small">Wrong but sure. Review these first</div></div>
          <div><div className="n">{quad.fragile}</div><div className="small">Right but unsure</div></div>
          <div><div className="n">{quad.knownGap}</div><div className="small">Wrong and unsure</div></div>
        </div>
        {quad.misconception ? <Link className="btn quiet" href="/practice?mode=misconceptions&size=10">Revisit confident errors</Link> : null}
      </section>

      <section className="stack" aria-labelledby="changes">
        <h2 id="changes">Changing your answer</h2>
        {ch.changed === 0 ? <p className="muted">You haven&apos;t changed an answer yet.</p> : (
          <>
            <p className="num">
              Changed {ch.changed} of {ch.answered}: {ch.wrongToRight} wrong to right, {ch.rightToWrong} right to wrong, {ch.wrongToWrong} wrong to wrong.
              Net <strong className={`points ${ch.netGain >= 0 ? 'gain' : 'loss'}`}>{ch.netGain >= 0 ? '+' : ''}{ch.netGain}</strong> mark{Math.abs(ch.netGain) === 1 ? '' : 's'}.
            </p>
            <div className="tablewrap">
              <table>
                <thead><tr><th>When you changed</th><th className="num">Changes</th><th className="num">Net marks</th></tr></thead>
                <tbody>
                  <tr><td>First answer felt unsure</td><td className="num">{ch.byFirstConfidence.low.changed}</td><td className="num">{ch.byFirstConfidence.low.netGain}</td></tr>
                  <tr><td>First answer felt sure</td><td className="num">{ch.byFirstConfidence.high.changed}</td><td className="num">{ch.byFirstConfidence.high.netGain}</td></tr>
                  {Object.entries(ch.byReason).map(([k, v]) => (
                    <tr key={k}><td>{REASON_LABELS[k] ?? k}</td><td className="num">{v.changed}</td><td className="num">{v.netGain}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="stack" aria-labelledby="areas">
        <h2 id="areas">By learning area</h2>
        <p className="small muted">Weakest first. Areas with fewer than {MIN_PER_AREA} answers are still settling.</p>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Learning area</th><th className="num">Answered</th><th className="num">Correct</th><th className="num">Confidence gap</th><th /></tr></thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a.learning_area}>
                  <td>{a.learning_area}{a.n < MIN_PER_AREA ? <span className="muted small"> (few answers)</span> : null}</td>
                  <td className="num">{a.n}</td>
                  <td className="num">{pct(a.accuracy)}</td>
                  <td className="num">{a.bias > 0 ? '+' : ''}{Math.round(a.bias * 100)}</td>
                  <td><Link href={`/practice?size=10&area=${encodeURIComponent(a.learning_area)}`}>Practise</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">Confidence gap: positive means you rated yourself surer than your results.</p>
      </section>
    </div>
  );
}
