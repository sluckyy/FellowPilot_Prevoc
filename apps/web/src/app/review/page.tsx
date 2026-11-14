import Link from 'next/link';
import { redirect } from 'next/navigation';
import { canReview, requirePageUser } from '@/lib/auth';
import { recentlyReviewed, reviewQueue, STATUS_LABELS } from '@/lib/questions';

export const metadata = { title: 'Review questions' };
export const dynamic = 'force-dynamic';

const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Adelaide' }).format(d) : '');

export default async function ReviewPage() {
  const u = await requirePageUser();
  if (!canReview(u)) redirect('/');
  const [queue, done] = await Promise.all([reviewQueue(u.tenantId), recentlyReviewed(u.tenantId)]);
  return (
    <div className="page">
      <div className="stack">
        <h1>Review questions</h1>
        <p className="muted">Questions written by trainees and supervisors. Accepted questions join the bank as trial questions for this state. Request changes when a question is close; the author gets your note by email.</p>
      </div>
      <section className="stack" aria-labelledby="waiting">
        <h2 id="waiting">Waiting for review ({queue.length})</h2>
        {!queue.length ? <p className="muted">Nothing waiting.</p> : (
          <ul className="qlist">
            {queue.map((d) => (
              <li key={d.id}>
                <Link href={`/review/${d.id}`}>
                  <strong>{d.content.presentation}</strong>
                  <span className="small muted">{d.content.learning_area} · {d.author_role} {d.author_id === u.id ? '(you)' : d.author_name} · sent {fmt(d.submitted_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {done.length ? (
        <section className="stack" aria-labelledby="recent">
          <h2 id="recent">Recently reviewed</h2>
          <ul className="qlist">
            {done.map((d) => (
              <li key={d.id}>
                <Link href={`/review/${d.id}`}>
                  <span className="row" style={{ justifyContent: 'space-between' }}><strong>{d.content.presentation}</strong><span className={`status ${d.status}`}>{STATUS_LABELS[d.status]}</span></span>
                  <span className="small muted">{d.content.learning_area} · {d.author_name} · reviewed by {d.reviewer_name ?? 'someone'} {fmt(d.reviewed_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
