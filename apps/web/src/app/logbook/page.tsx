import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { listReflections } from '@/lib/reflections';
import { Logbook } from './Logbook';

export const metadata = { title: 'Logbook' };
export const dynamic = 'force-dynamic';

export default async function LogbookPage() {
  const u = await requirePageUser();
  const entries = await listReflections(u.id);
  return (
    <div className="page">
      <div className="stack">
        <h1>Reflective logbook</h1>
        <p className="muted">A private place to write down what happened and what you took from it. A few sentences is plenty. Tag each entry with the outcome statements it shows, and it counts on your <Link href="/progress">progress map</Link>.</p>
        <p className="small muted">Entries are stored encrypted and never shared or scored. Only the tags you confirm are counted. Keep patients unidentifiable: no names, dates of birth, unit record numbers or anything else that could identify someone.</p>
      </div>
      <Logbook initial={entries.map((e) => ({ ...e, created_at: e.created_at.toISOString() }))} />
    </div>
  );
}
