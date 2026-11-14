import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { myDrafts, STATUS_LABELS } from '@/lib/questions';

export const metadata = { title: 'Write a question' };
export const dynamic = 'force-dynamic';

const fmt = (d: Date) => new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Adelaide' }).format(d);

export default async function WritePage() {
  const u = await requirePageUser();
  const drafts = await myDrafts(u.id);
  const accepted = drafts.filter((d) => d.status === 'accepted').length;
  return (
    <div className="page">
      <div className="stack">
        <h1>Write a question</h1>
        <p>Writing a question on something you&apos;ve just studied is one of the best ways to remember it. Write it as a single-best-answer question like the ones you practise: a short case, a clear question, four options and why each is right or wrong.</p>
        <p className="small muted">You can ask for AI feedback while you write. A reviewer then checks it, and accepted questions join the bank for everyone in the beta as trial questions. Your name isn&apos;t shown to trainees, and you won&apos;t be served your own questions.</p>
        <Link className="btn" href="/write/new">Start a new question</Link>
      </div>
      {drafts.length ? (
        <section className="stack" aria-labelledby="mine">
          <h2 id="mine">Your questions{accepted ? <span className="small muted num"> · {accepted} accepted</span> : null}</h2>
          <ul className="qlist">
            {drafts.map((d) => (
              <li key={d.id}>
                <Link href={`/write/${d.id}`}>
                  <span className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>{d.content.presentation || 'Untitled question'}</strong>
                    <span className={`status ${d.status}`}>{STATUS_LABELS[d.status]}</span>
                  </span>
                  <span className="small muted">{d.content.learning_area || 'No learning area yet'} · updated {fmt(d.updated_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
