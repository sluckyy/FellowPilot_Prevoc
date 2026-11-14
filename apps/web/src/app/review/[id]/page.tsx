import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { canReview, requirePageUser } from '@/lib/auth';
import { getDraft, STATUS_LABELS } from '@/lib/questions';
import { draftGates } from '@/lib/core';
import { QuestionPreview } from '@/components/QuestionPreview';
import { ReviewForm } from './ReviewForm';

export const metadata = { title: 'Review question' };
export const dynamic = 'force-dynamic';

export default async function ReviewQuestionPage({ params }: { params: { id: string } }) {
  const u = await requirePageUser();
  if (!canReview(u)) redirect('/');
  const d = await getDraft(params.id, u.tenantId);
  if (!d || d.status === 'draft' || d.status === 'withdrawn') notFound();
  const warnings = draftGates(d.content);
  return (
    <div className="page">
      <div className="stack">
        <p className="small"><Link href="/review">Review queue</Link></p>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1>{d.content.presentation}</h1>
          <span className={`status ${d.status}`}>{STATUS_LABELS[d.status]}</span>
        </div>
        <p className="small muted">Written by {d.author_name || 'a user'} ({d.author_role}). The author declared it is their own work, not recalled from an exam.</p>
      </div>
      <section className="panel"><QuestionPreview d={d.content} /></section>
      {warnings.length ? (
        <section className="stack" aria-labelledby="checks">
          <h2 id="checks">Automatic checks</h2>
          {warnings.map((g, i) => <p key={i} className={`gate ${g.level}`}>{g.message}</p>)}
        </section>
      ) : null}
      {d.coaching ? (
        <section className="stack" aria-labelledby="ai">
          <h2 id="ai">AI feedback the author last saw</h2>
          <p className="coach insight">{d.coaching.text}</p>
        </section>
      ) : null}
      {d.status === 'submitted' && d.author_id !== u.id ? <ReviewForm id={d.id} /> : null}
      {d.status === 'submitted' && d.author_id === u.id ? <p className="notice info">This is your own question, so someone else needs to review it.</p> : null}
      {d.review_note && d.status !== 'submitted' ? <div className="insight"><p className="small muted" style={{ margin: 0 }}>Note from {d.reviewer_name ?? 'the reviewer'}</p><p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{d.review_note}</p></div> : null}
    </div>
  );
}
