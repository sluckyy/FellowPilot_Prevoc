import { requirePageUser } from '@/lib/auth';
import { listSeasons } from '@/lib/seasons';
import { SeasonsEditor } from './SeasonsEditor';

export const metadata = { title: 'Seasons' };
export const dynamic = 'force-dynamic';

export default async function SeasonsPage() {
  const u = await requirePageUser({ role: 'admin' });
  const seasons = await listSeasons(u.tenantId);
  return (
    <div className="page">
      <div className="stack">
        <h1>Seasons</h1>
        <p className="muted">A season is a dated, themed challenge (for example &ldquo;Sepsis September&rdquo;). It shows on every trainee&apos;s home and progress pages while it runs, adds up across teams, and earns XP when completed. No code changes needed.</p>
      </div>
      <SeasonsEditor initial={seasons.map((s) => ({ ...s, updated_at: s.updated_at.toISOString() }))} />
    </div>
  );
}
