import { requirePageUser } from '@/lib/auth';
import { FeedbackForm } from './FeedbackForm';

export const metadata = { title: 'Feedback' };

export default async function FeedbackPage() {
  await requirePageUser();
  return (
    <div className="page">
      <div className="stack">
        <h1>Tell us what to improve</h1>
        <p className="muted">This is a beta, so what you tell us shapes what gets built next. To report a problem with a specific question, use &ldquo;Report a problem&rdquo; under that question instead.</p>
      </div>
      <FeedbackForm />
    </div>
  );
}
