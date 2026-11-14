import { randomUUID } from 'node:crypto';
import { handle, json, requireApiUser } from '@/lib/http';
import { selectablePool, selectionHistory, servedItems } from '@/lib/data';
import { selectSet } from '@/lib/core';

export const dynamic = 'force-dynamic';

/** A practice set chosen for this trainee: GET /api/sets/next?size=10&area=Emergency&mode=misconceptions */
export const GET = handle(async (req: Request) => {
  const u = await requireApiUser();
  const url = new URL(req.url);
  const size = Math.min(Math.max(Number(url.searchParams.get('size')) || 10, 1), 50);
  const area = url.searchParams.get('area') || null;
  const mode = url.searchParams.get('mode') === 'misconceptions' ? 'misconceptions' : 'mixed';
  const [pool, history] = await Promise.all([selectablePool(u.tenantId, u.id), selectionHistory(u.id)]);
  const picks = selectSet(pool, history, { size, learningArea: area, mode });
  const items = await servedItems(u.id, picks);
  return json({ set_id: randomUUID(), mode, items });
});
