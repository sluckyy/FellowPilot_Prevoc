import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { listAchievements } from '@/lib/achievements';
import { one } from '@/lib/db';
import { AchievementsEditor } from './AchievementsEditor';

export const metadata = { title: 'Achievements' };
export const dynamic = 'force-dynamic';

export default async function AchievementsAdminPage() {
  const u = await requirePageUser({ role: 'admin' });
  const [list, people] = await Promise.all([
    listAchievements(u.tenantId),
    one<{ n: string }>(`SELECT count(*) AS n FROM app_user u JOIN consent c ON c.user_id = u.id WHERE u.tenant_id = $1 AND u.deleted_at IS NULL`, [u.tenantId]),
  ]);
  return (
    <div className="page">
      <div className="stack">
        <p className="small"><Link href="/admin">Admin</Link></p>
        <h1>Achievements</h1>
        <p className="muted">What trainees can earn on their Progress page. Changes apply straight away. Anyone who has already earned an achievement keeps it, even if you make the rule harder, so it&apos;s safer to add a new one than to change one people have earned. Switch an achievement off to hide it; it can&apos;t be deleted.</p>
        <p className="small muted">Keep rewards about steady practice, coverage, honest confidence and learning from mistakes rather than raw scores, so nobody is rewarded for overstating their confidence.</p>
      </div>
      <AchievementsEditor initial={JSON.parse(JSON.stringify(list))} people={Number(people?.n ?? 0)} />
    </div>
  );
}
