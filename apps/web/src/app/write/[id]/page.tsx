import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { editable, getDraft, STATUS_LABELS } from '@/lib/questions';
import { tutorAvailable } from '@/lib/tutor';
import { QuestionPreview } from '@/components/QuestionPreview';
import { QuestionEditor } from '../QuestionEditor';
import { WithdrawButton } from './WithdrawButton';

export const metadata = { title: 'Your question' };
export const dynamic = 'force-dynamic';

export default async function QuestionPage({ params }: { params: { id: string } }) {
  const u = await requirePageUser();
  const d = await getDraft(params.id, u.tenantId);
  if (!d || d.author_id !== u.id || d.status === 'withdrawn') notFound();
  if (editable(d.status)) {
    return <QuestionEditor id={d.id} initial={d.content} declared={d.recall_declared} coaching={d.coaching?.text ?? null}
      reviewNote={d.status === 'changes_requested' ? d.review_note : ''} coachAvailable={tutorAvailable()} />;
  }
  return (
    <div className="page">
      <div className="stack">
        <p className="small"><Link href="/write">Your questions</Link></p>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1>{d.content.presentation || 'Your question'}</h1>
          <span className={`status ${d.status}`}>{STATUS_LABELS[d.status]}</span>
        </div>
        {d.status === 'submitted' ? <p className="notice info">A reviewer will look at this soon. You&apos;ll get an email when they do. If you want to change something first, take it back to edit.</p> : null}
        {d.status === 'accepted' ? <p className="notice info">Accepted{d.reviewer_name ? ` by ${d.reviewer_name}` : ''}. It&apos;s now in the bank as a trial question. Thank you.</p> : null}
        {d.status === 'rejected' ? <p className="notice warn">Not accepted this time.</p> : null}
        {d.review_note ? <div className="insight"><p className="small muted" style={{ margin: 0 }}>Reviewer&apos;s note</p><p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{d.review_note}</p></div> : null}
        {d.status === 'submitted' ? <WithdrawButton id={d.id} /> : null}
      </div>
      <section className="panel"><QuestionPreview d={d.content} /></section>
    </div>
  );
}
