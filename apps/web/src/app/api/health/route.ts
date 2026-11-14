import { one } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const r = await one<{ ok: number; items: string }>("SELECT 1 AS ok, (SELECT count(*) FROM item WHERE status IN ('pretest','live')) AS items");
    return Response.json({ ok: r?.ok === 1, db: true, items: Number(r?.items ?? 0) });
  } catch (e) {
    console.error('health check failed', e);
    return Response.json({ ok: false, db: false }, { status: 503 });
  }
}
