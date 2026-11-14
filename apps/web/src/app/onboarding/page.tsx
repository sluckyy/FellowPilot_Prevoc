import { requirePageUser } from '@/lib/auth';
import { currentPlan } from '@/lib/plan';
import { PlanForm } from './PlanForm';

export const metadata = { title: 'Your goal plan' };
export const dynamic = 'force-dynamic';

const fmt = (iso: string) => new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

export default async function OnboardingPage() {
  const u = await requirePageUser();
  const plan = await currentPlan(u.id);
  const checkin = !!plan;
  return (
    <div className="page">
      <div className="stack">
        <h1>{checkin ? 'Six-month check-in' : 'Your goal plan'}</h1>
        {checkin ? (
          <p className="muted">Your last plan was set on {fmt(plan!.created_at.toISOString().slice(0, 10))}, with a check-in due {fmt(plan!.checkin_due)}. Look back at those goals, keep what still matters, and set the next six months. Everything you have done since is already on your progress map.</p>
        ) : (
          <p className="muted">Ten minutes, once. A few questions about where you are heading and what you want from the next six months, then three or four goals linked to the outcome statements. It sets your starting content and the progress map you will build against. You can revise it any time.</p>
        )}
        <p className="small muted">This plan is yours. It is not shared with your supervisor or the medical education unit, and it never feeds a formal assessment.</p>
      </div>
      <PlanForm
        pgyLevel={u.pgyLevel} settingPreference={u.settingPreference} img={u.img}
        previous={plan ? { career_intent: plan.career_intent, strengths: plan.strengths, concerns: plan.concerns, learning_prefs: plan.learning_prefs, goals: plan.goals } : null}
      />
    </div>
  );
}
