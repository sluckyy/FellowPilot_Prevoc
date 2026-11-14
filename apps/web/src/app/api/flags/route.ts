import { randomUUID } from 'node:crypto';
import { checkOrigin, handle, json, readJson, requireApiUser, HttpError } from '@/lib/http';
import { one, tx } from '@/lib/db';
import { FLAG_REASONS, APP_VERSION, FLAG_COMMENT_MIN, FLAG_SUSPEND_WEEKLY_CAP } from '@/lib/constants';

/**
 * A trainee flags a question. Recorded as a flag and an event, and the question is taken out of
 * practice for everyone until a reviewer resolves it, unless this trainee has already taken out
 * FLAG_SUSPEND_WEEKLY_CAP questions this week (then it's recorded and queued only).
 */
export const POST = handle(async (req: Request) => {
  checkOrigin(req);
  const u = await requireApiUser();
  const b = await readJson<{ item_id?: unknown; item_version?: unknown; reason?: unknown; comment?: unknown; session_id?: unknown }>(req, 8192);
  if (typeof b.item_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.item_id) || !Number.isInteger(b.item_version)) throw new HttpError(400, 'Bad question reference');
  if (!FLAG_REASONS.some((r) => r.value === b.reason)) throw new HttpError(400, 'Choose a reason');
  const comment = typeof b.comment === 'string' ? b.comment.trim().slice(0, 2000) : '';
  if (comment.length < FLAG_COMMENT_MIN) throw new HttpError(400, 'Say briefly what looks wrong, so a reviewer can check it');
  const exists = await one('SELECT 1 FROM item_version WHERE item_id = $1 AND version = $2', [b.item_id, b.item_version]);
  if (!exists) throw new HttpError(404, 'Question not found');
  const sessionId = typeof b.session_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.session_id) ? b.session_id : randomUUID();
  const { flagId, suspended } = await tx(async (c) => {
    const recent = await c.query<{ n: string }>(
      `SELECT count(*) AS n FROM flag WHERE user_id = $1 AND suspended_item AND created_at > now() - interval '7 days'`, [u.id]);
    const withinCap = Number(recent.rows[0].n) < FLAG_SUSPEND_WEEKLY_CAP;
    const out = withinCap ? await c.query(
      `UPDATE item SET status_before_review = status, status = 'under_review', updated_at = now()
        WHERE id = $1 AND status IN ('pretest', 'live')`, [b.item_id]) : { rowCount: 0 };
    const suspended = (out.rowCount ?? 0) > 0;
    const f = await c.query<{ id: string }>(
      'INSERT INTO flag (item_id, item_version, user_id, reason, comment, suspended_item) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [b.item_id, b.item_version, u.id, b.reason, comment, suspended]);
    await c.query(
      `INSERT INTO event (event_id, event_type, user_id, tenant_id, session_id, client_ts, app_version, mode, payload)
       VALUES (gen_random_uuid(), 'item_flag_raised', $1, $2, $3, now(), $4, 'none', $5)`,
      [u.id, u.tenantId, sessionId, APP_VERSION, JSON.stringify({ flag_id: f.rows[0].id, item_id: b.item_id, item_version: b.item_version, reason: b.reason, suspended })]);
    return { flagId: f.rows[0].id, suspended };
  });
  return json({ ok: true, flag_id: flagId, suspended });
});
