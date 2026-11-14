import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { answerRows, learningAreas } from '@/lib/data';
import { loadProgress, markAchievementsSeen } from '@/lib/progress';
import { CHALLENGE_LABELS, COVERAGE_LEVELS, FREEZE_EVERY, MASTERY_LEVELS, MAX_FREEZES, OUTCOME_DOMAINS, PAUSE_LABELS } from '@/lib/core';
import { GoalPicker } from './GoalPicker';
import { PauseForm } from './PauseForm';

export const metadata = { title: 'Progress' };
export const dynamic = 'force-dynamic';

const fmtWeek = (iso: string) => new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const fmtDate = (d: Date) => new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Adelaide' }).format(d);
const fmtIso = (iso: string) => new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const WEEK_LABEL = { met: 'goal met', frozen: 'freeze used', paused: 'paused', missed: 'goal missed', current: 'this week' } as const;

export default async function ProgressPage() {
  const u = await requirePageUser();
  const [rows, areas] = await Promise.all([answerRows(u.id), learningAreas(u.tenantId)]);
  const p = await loadProgress(u, rows);
  const available = new Set(areas.map((a) => a.learning_area));
  await markAchievementsSeen(u.id);
  const covered = p.map.filter((t) => t.n > 0).length;
  const evidenced = p.outcomes.filter((o) => o.evidence > 0).length;
  const done = p.achievements.filter((a) => a.done).length;
  const lv = p.level;

  return (
    <div className="page">
      <div className="stack">
        <h1>Progress</h1>
        <p className="muted">Steady weekly practice, coverage of the outcome statements, honest confidence, reflection and learning from mistakes. There is no daily streak to break, and nothing here is a score anyone else sees.</p>
      </div>

      <section className="stack" aria-labelledby="level">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 id="level">Level {lv.level}: {lv.title}</h2>
          <span className="small muted num">{lv.xp} XP</span>
        </div>
        <div className="meter" role="progressbar" aria-valuemin={lv.floor} aria-valuemax={lv.next ?? lv.xp} aria-valuenow={lv.xp} aria-label="Progress to the next level">
          <span style={{ width: `${Math.round(100 * lv.progress)}%` }} />
        </div>
        <p className="small muted num">{lv.next !== null ? `${lv.next - lv.xp} XP to level ${lv.level + 1}.` : 'Top level reached.'} XP comes from doing things: answering (right or wrong), honest confidence ratings, reflections, goals and challenges.</p>
      </section>

      {p.season ? (
        <section className="panel stack" aria-labelledby="season">
          <h2 id="season">{p.season.season.title}</h2>
          {p.season.season.theme ? <p>{p.season.season.theme}</p> : null}
          <p className="small muted">{fmtIso(p.season.season.starts_on)} to {fmtIso(p.season.season.ends_on)}. {CHALLENGE_LABELS[p.season.season.challenge.type](p.season.season.challenge)}.</p>
          <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={p.season.mine.target} aria-valuenow={p.season.mine.current} aria-label="Season challenge"><span style={{ width: `${Math.round((100 * p.season.mine.current) / p.season.mine.target)}%` }} /></div>
          <p className="small muted num">{p.season.mine.current} of {p.season.mine.target}{p.season.mine.done ? '. Challenge complete!' : '.'}
            {p.season.team ? ` Team: ${p.season.team.current} of ${p.season.team.target}.` : p.team ? '' : ' '}
            {!p.team ? <Link href="/team"> Join a team to add yours to a team total.</Link> : null}
          </p>
          {p.season.season.focus_areas.length ? <div className="chips">{p.season.season.focus_areas.map((a) => <Link key={a} className="chip" href={`/practice?size=10&area=${encodeURIComponent(a)}`}>{a}</Link>)}</div> : null}
        </section>
      ) : null}

      <section className="stack" aria-labelledby="goal">
        <h2 id="goal">Weekly goal</h2>
        <div className="stats">
          <div className="stat"><span className="n num">{p.thisWeek}<span className="muted" style={{ fontSize: '1rem', fontWeight: 400 }}> / {p.goal}</span></span><span className="small muted">questions this week</span></div>
          <div className="stat"><span className="n num">{p.streak.streak}</span><span className="small muted">week streak</span></div>
          <div className="stat"><span className="n num">{p.streak.freezes}</span><span className="small muted">freeze{p.streak.freezes === 1 ? '' : 's'} saved</span></div>
        </div>
        <div className="weeks" aria-label="Last 8 weeks">
          {p.streak.weeks.map((w) => (
            <div key={w.week} className={w.status} title={`${fmtWeek(w.week)}: ${w.answered} questions, ${WEEK_LABEL[w.status]}`}>
              <b aria-hidden>{w.status === 'frozen' ? '❄' : w.status === 'paused' ? '⏸' : w.answered}</b>
              <span>{fmtWeek(w.week)}</span>
              <span className="sr-only">{w.answered} questions, {WEEK_LABEL[w.status]}</span>
            </div>
          ))}
        </div>
        <p className="small muted">Every {FREEZE_EVERY} weeks you meet your goal earns a freeze (you can hold {MAX_FREEZES}), used automatically on a missed week. For rostered nights, leave or exams, pause the streak instead: a paused week never counts against you.</p>
        <GoalPicker goal={p.goal} />
        <PauseForm pauses={p.pauses} />
        {p.pauses.length ? <ul className="readings">{p.pauses.map((x) => <li key={x.id}>{fmtIso(x.starts_on)} to {fmtIso(x.ends_on)}: {PAUSE_LABELS[x.reason]}</li>)}</ul> : null}
      </section>

      <section className="stack" aria-labelledby="omap">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 id="omap">Outcome statements</h2>
          <span className="small muted num">{evidenced} of {p.outcomes.length} with evidence</span>
        </div>
        <p className="small muted">The 28 AMC prevocational outcome statements. Evidence is a question answered correctly on a first attempt plus a reflection you tagged to it. This is your own map; it is not an assessment and goes nowhere else.</p>
        {OUTCOME_DOMAINS.map((d) => (
          <div key={d.id} className="stack" style={{ gap: 6 }}>
            <h3>{d.id.replace('D', 'Domain ')}: {d.title}</h3>
            <div className="cmap">
              {p.outcomes.filter((o) => o.domain === d.id).map((o) => (
                <div key={o.code} className={`tile c${o.level}`} aria-label={`${o.code} ${o.short}: ${o.label}, ${o.correct} correct answers, ${o.reflections} reflections`} title={o.short}>
                  <span className="area"><span className="num">{o.code}</span> {o.short}</span>
                  <span className="lvl">{o.label}{o.evidence ? <span className="num"> · {o.correct}q {o.reflections}r</span> : null}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="mapkey" aria-hidden>
          {COVERAGE_LEVELS.map((l, i) => <span key={l}><i className={`tile c${i}`} style={{ minHeight: 0, padding: 0 }} />{l}</span>)}
        </div>
        <p className="small"><Link href="/logbook">Log a reflection</Link> to add evidence against the statements that questions rarely reach, like teamwork, wellbeing and cultural safety.</p>
      </section>

      <section className="stack" aria-labelledby="map">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 id="map">Learning areas</h2>
          <span className="small muted num">{covered} of {p.map.length} areas started</span>
        </div>
        <p className="small muted">The 20 learning areas, largest share of the question bank first. Levels need 5 answers to rate and 15 to reach Strong. Tap an area to practise it.</p>
        <div className="cmap">
          {p.map.map((t) => {
            const label = `${t.area}: ${t.label}${t.n ? `, ${t.n} answered, ${Math.round((t.accuracy ?? 0) * 100)}% correct` : ''}`;
            const body = (<><span className="area">{t.area}</span><span className="lvl">{available.has(t.area) ? t.label : 'No questions yet'}{t.n ? <span className="num"> · {t.n}</span> : null}</span></>);
            return available.has(t.area)
              ? <Link key={t.area} href={`/practice?size=10&area=${encodeURIComponent(t.area)}`} className={`tile l${t.level}`} aria-label={label}>{body}</Link>
              : <div key={t.area} className={`tile l${t.level}`} aria-label={`${label}, no questions yet`}>{body}</div>;
          })}
        </div>
        <div className="mapkey" aria-hidden>
          {MASTERY_LEVELS.map((l, i) => <span key={l}><i className={`tile l${i}`} style={{ minHeight: 0, padding: 0 }} />{l}</span>)}
        </div>
      </section>

      <section className="stack" aria-labelledby="ach">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 id="ach">Achievements</h2>
          <span className="small muted num">{done} of {p.achievements.length}</span>
        </div>
        <div className="badges">
          {p.achievements.map((a) => (
            <div key={a.def.id} className={`badge${a.done ? ' done' : ''}`}>
              <span className="medal" aria-hidden>{a.done ? '★' : '☆'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {a.isNew ? <span className="new">New</span> : null}
                <p style={{ margin: 0, fontWeight: 700 }}>{a.def.title}</p>
                <p className="small muted" style={{ margin: 0 }}>{a.def.description}</p>
                {a.done && a.earnedAt ? <p className="small" style={{ margin: '4px 0 0' }}>Earned {fmtDate(a.earnedAt)}</p> : (
                  <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={a.target} aria-valuenow={a.current} aria-label={`${a.def.title} progress`}>
                    <span style={{ width: `${Math.round((100 * a.current) / a.target)}%` }} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel stack">
        <h2>Team and goals</h2>
        <p>{p.team ? `You are in ${p.team.name}.` : 'Join your site or cohort team to take on season challenges together.'} {p.plans ? 'Your goal plan is set; revisit it at your six-month check-in.' : 'Set your goal plan to get a starting content set.'}</p>
        <div className="row">
          <Link className="btn secondary" href="/team">{p.team ? 'Your team' : 'Join a team'}</Link>
          <Link className="btn quiet" href="/onboarding">{p.plans ? 'Revise your goal plan' : 'Create your goal plan'}</Link>
        </div>
      </section>
    </div>
  );
}
