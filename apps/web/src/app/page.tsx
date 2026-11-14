import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { answerRows, learningAreas, thisWeek } from '@/lib/data';
import { quadrants, totalPoints } from '@/lib/core';
import { loadProgress } from '@/lib/progress';
import { currentPlan } from '@/lib/plan';
import { AreaPicker } from './AreaPicker';

export const dynamic = 'force-dynamic';

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat('en-AU', { hour: 'numeric', hour12: false, timeZone: 'Australia/Adelaide' }).format(new Date()));
  if (h < 5) return 'Hello';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default async function Home() {
  const u = await requirePageUser();
  const [week, rows, areas, plan] = await Promise.all([thisWeek(u.id), answerRows(u.id), learningAreas(u.tenantId), currentPlan(u.id)]);
  const progress = await loadProgress(u, rows);
  const goal = progress.goal;
  const { streak, freezes } = progress.streak;
  const total = areas.reduce((s, a) => s + a.n, 0);
  const misconceptions = quadrants(rows).misconception;
  const first = u.name.split(' ')[0];
  const goalPct = Math.min(100, Math.round((100 * week.answered) / goal));
  const today = new Date().toISOString().slice(0, 10);
  const checkinDue = plan && plan.checkin_due <= today;

  return (
    <div className="page">
      <div className="stack">
        <h1>{greeting()}{first ? `, ${first}` : ''}</h1>
        <p className="muted num">Level {progress.level.level}, {progress.level.title}. {progress.level.next !== null ? `${progress.level.next - progress.level.xp} XP to the next level.` : ''}</p>
      </div>

      {!plan ? (
        <section className="panel stack">
          <h2>Start with your goal plan</h2>
          <p>Ten minutes to set three or four goals for the next six months, linked to the outcome statements. It picks your starting content and earns your first badge.</p>
          <Link className="btn" href="/onboarding">Create my goal plan</Link>
        </section>
      ) : checkinDue ? (
        <section className="panel stack">
          <h2>Your six-month check-in is due</h2>
          <p>Look back at your goals, see what the last six months built, and set the next ones.</p>
          <Link className="btn" href="/onboarding">Do my check-in</Link>
        </section>
      ) : null}

      {progress.season ? (
        <p className="insight"><strong>{progress.season.season.title}</strong>: {progress.season.mine.current} of {progress.season.mine.target}{progress.season.mine.done ? ', complete.' : '.'} <Link href="/progress">Season</Link></p>
      ) : null}

      <section className="stack" aria-labelledby="week">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 id="week">This week</h2>
          <span className="num muted">{week.answered} of {goal} questions</span>
        </div>
        <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={week.answered} aria-label="Weekly goal">
          <span style={{ width: `${goalPct}%` }} />
        </div>
        <p className="small muted num">
          {week.points} points this week, {totalPoints(rows)} in total.
          {streak ? ` ${streak}-week streak${freezes ? `, ${freezes} freeze${freezes === 1 ? '' : 's'} saved` : ''}.` : ''}
          {' '}<Link href="/progress">Progress</Link>
        </p>
        {progress.unseen.length ? (
          <p className="insight good">
            Achievement{progress.unseen.length === 1 ? '' : 's'} unlocked: {progress.unseen.map((a) => a.def.title).join(', ')}. <Link href="/progress">See them</Link>
          </p>
        ) : progress.next && progress.next.current > 0 ? (
          <p className="small muted">Next achievement: <strong>{progress.next.def.title}</strong>, {progress.next.current} of {progress.next.target}.</p>
        ) : null}
      </section>

      {total === 0 ? (
        <section className="panel stack">
          <h2>Questions are on their way</h2>
          <p>The first questions are being loaded. They appear here as soon as they&apos;re in.</p>
        </section>
      ) : (
        <section className="stack" aria-labelledby="practise">
          <h2 id="practise">Practise</h2>
          <Link className="btn block" href="/practice?size=10">Quick set: 10 questions</Link>
          <Link className="btn secondary block" href="/practice?size=25">Longer set: 25 questions</Link>
          {misconceptions > 0 ? (
            <Link className="btn quiet block" href="/practice?mode=misconceptions&size=10">
              Revisit questions you got wrong while sure ({misconceptions})
            </Link>
          ) : null}
          <AreaPicker areas={areas} />
          <p className="small muted">{total} questions in the beta, written with AI and checked by an independent AI reviewer. Clinical review is still to come: if a question looks wrong, report it and it comes out of practice until it&apos;s checked.</p>
        </section>
      )}

      <section className="stack" aria-labelledby="more">
        <h2 id="more">Reflect and learn</h2>
        <Link className="btn quiet block" href="/logbook">Log a reflection{progress.reflections ? ` (${progress.reflections} so far)` : ''}</Link>
        {rows.length ? <Link className="btn quiet block" href="/guide">Your study guide</Link> : null}
        {rows.length ? <Link className="btn quiet block" href="/write">Write a question on something you&apos;ve studied</Link> : null}
      </section>

      <p className="small"><Link href="/feedback">Tell us what to improve</Link></p>
    </div>
  );
}
