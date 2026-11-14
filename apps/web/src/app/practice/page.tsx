import { requirePageUser } from '@/lib/auth';
import { Practice } from './Practice';

export const metadata = { title: 'Practice' };
export const dynamic = 'force-dynamic';

export default async function PracticePage({ searchParams }: { searchParams: { size?: string; area?: string; mode?: string } }) {
  const u = await requirePageUser();
  const size = searchParams.size === '25' ? 25 : 10;
  return (
    <Practice
      size={size}
      area={searchParams.area ?? ''}
      mode={searchParams.mode === 'misconceptions' ? 'misconceptions' : 'mixed'}
      userId={u.id}
      tenantId={u.tenantId}
    />
  );
}
