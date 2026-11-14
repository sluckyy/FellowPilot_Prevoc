import { BRAND } from '@/brand/generated/brand';
import { BrandLogo } from '@/components/BrandLogo';
import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { WelcomeForm } from './WelcomeForm';

export const metadata = { title: 'Welcome' };

export default async function WelcomePage() {
  const u = await requirePageUser({ allowNoConsent: true });
  if (u.hasConsent) redirect('/');
  return (
    <div className="page">
      <div className="stack">
        <BrandLogo width={380} />
        <h1>Welcome to the {BRAND.name} prevocational beta</h1>
        <p>Practise questions written for the work of a PGY1 or PGY2 doctor, keep a private reflective logbook, and watch your progress build against the AMC outcome statements. It is for your own learning. Nothing here feeds your term assessments or EPAs.</p>
      </div>
      <section className="panel stack" aria-labelledby="privacy">
        <h2 id="privacy">How your data is used</h2>
        <ul className="stack" style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li>Every answer, change of answer, confidence rating, reflection logged and goal set is recorded, so we can show you your patterns and improve the questions.</li>
          <li>Your data is stored in Australia. Analysis uses an anonymous ID, not your name or email.</li>
          <li>Reflections are private by default and stored encrypted. Only the outcome-statement tags you confirm are counted; the text is never scored or read for analysis.</li>
          <li>Nothing connects to your EPA, term assessment or employment records, by design. Supervisors and medical education staff see only cohort totals, never your individual activity, unless you choose to share a summary below.</li>
          <li>Questions are for learning, not clinical advice. During the beta, questions are written with AI and checked by an independent AI reviewer; clinical review is still to come, so some may contain errors. If something looks wrong, report it: the question comes out of practice until a reviewer checks it.</li>
          <li>You can ask for your data to be exported or deleted at any time.</li>
        </ul>
      </section>
      <WelcomeForm defaultName={u.name} />
    </div>
  );
}
