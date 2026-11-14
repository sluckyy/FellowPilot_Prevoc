import { checkOrigin, handle, json, readJson, requireApiUser, HttpError } from '@/lib/http';
import { one } from '@/lib/db';
import { toDraft } from '@/lib/core';
import { authorRole } from '@/lib/questions';

export const dynamic = 'force-dynamic';

/** Start a new question. Body: { content } (any partial draft). Returns { id }. */
export const POST = handle(async (req: Request) => {
  checkOrigin(req);
  const u = await requireApiUser();
  const b = await readJson<{ content?: unknown }>(req, 64 * 1024);
  const open = await one<{ n: string }>(`SELECT count(*) AS n FROM draft_item WHERE author_id = $1 AND status IN ('draft', 'changes_requested')`, [u.id]);
  if (Number(open?.n ?? 0) >= 20) throw new HttpError(429, 'You have 20 unfinished questions. Finish or discard some first.');
  const r = await one<{ id: string }>(
    `INSERT INTO draft_item (tenant_id, author_id, author_role, content) VALUES ($1, $2, $3, $4) RETURNING id`,
    [u.tenantId, u.id, authorRole(u), JSON.stringify(toDraft(b.content))]);
  return json({ id: r!.id }, 201);
});
