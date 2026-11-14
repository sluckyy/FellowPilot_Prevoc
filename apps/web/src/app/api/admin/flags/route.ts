import { checkOrigin, handle, json, readJson, requireApiUser, HttpError } from '@/lib/http';
import { q, tx } from '@/lib/db';
import { APP_VERSION } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/** Open flags, wrong-key first, then oldest first (48-hour target for wrong keys). */
export const GET = handle(async () => {
  await requireApiUser('editor');
  const flags = await q(
    `SELECT f.id, f.item_id, f.item_version, f.reason, f.comment, f.created_at, v.learning_area, v.presentation,
            left(v.stem, 160) AS stem, v.key, p.display_name AS raised_by
       FROM flag f JOIN item_version v ON v.item_id = f.item_id AND v.version = f.item_version
       JOIN user_profile p ON p.user_id = f.user_id
      WHERE f.status = 'open'
      ORDER BY (f.reason = 'wrong_key') DESC, f.created_at`);
  return json({ flags });
});

/**
 * Resolve a flag.
 *   upheld + retired   the question is retired for good
 *   upheld + none      it stays out of practice until a corrected version is loaded
 *   not upheld / duplicate   it goes back into practice, once no other report on it is open or upheld-pending
 */
export const POST = handle(async (req: Request) => {
  checkOrigin(req);
  const ed = await requireApiUser('editor');
  const b = await readJson<{ flag_id?: unknown; outcome?: unknown; action?: unknown }>(req, 2048);
  if (typeof b.flag_id !== 'string') throw new HttpError(400, 'Missing flag');
  if (!['upheld', 'not_upheld', 'duplicate'].includes(b.outcome as string)) throw new HttpError(400, 'Choose an outcome');
  const action = ['retired', 'none'].includes(b.action as string) ? (b.action as string) : 'none';
  await tx(async (c) => {
    const f = await c.query<{ item_id: string; item_version: number; user_id: string }>(
      `UPDATE flag SET status = 'resolved', outcome = $2, action = $3, resolver_id = $4, resolved_at = now()
        WHERE id = $1 AND status = 'open' RETURNING item_id, item_version, user_id`,
      [b.flag_id, b.outcome, action, ed.id]);
    if (!f.rowCount) throw new HttpError(404, 'Flag not found or already resolved');
    const itemId = f.rows[0].item_id;
    if (action === 'retired') {
      await c.query(`UPDATE item SET status = 'retired', retired_reason = $2, status_before_review = NULL, updated_at = now() WHERE id = $1`,
        [itemId, `Flag upheld (${b.outcome})`]);
    } else {
      // Back into practice when nothing else holds it out.
      await c.query(
        `UPDATE item SET status = status_before_review, status_before_review = NULL, updated_at = now()
          WHERE id = $1 AND status = 'under_review' AND status_before_review IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM flag WHERE item_id = $1 AND (status = 'open' OR (outcome = 'upheld' AND action = 'none')))`,
        [itemId]);
    }
    await c.query(
      `INSERT INTO event (event_id, event_type, user_id, tenant_id, session_id, client_ts, app_version, mode, payload)
       VALUES (gen_random_uuid(), 'item_flag_resolved', $1, $2, gen_random_uuid(), now(), $3, 'none', $4)`,
      [ed.id, ed.tenantId, APP_VERSION, JSON.stringify({ flag_id: b.flag_id, outcome: b.outcome, action, item_id: itemId })]);
  });
  return json({ ok: true });
});

/** A question held out after an upheld report: put it back once fixed, or retire it. Body: { item_id, action } */
export const PUT = handle(async (req: Request) => {
  checkOrigin(req);
  const ed = await requireApiUser('editor');
  const b = await readJson<{ item_id?: unknown; action?: unknown }>(req, 1024);
  if (typeof b.item_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.item_id)) throw new HttpError(400, 'Missing question');
  if (b.action !== 'reinstate' && b.action !== 'retire') throw new HttpError(400, 'Choose reinstate or retire');
  const r = b.action === 'reinstate'
    ? await q(`UPDATE item SET status = COALESCE(status_before_review, 'live'), status_before_review = NULL, updated_at = now()
                WHERE id = $1 AND status = 'under_review' AND NOT EXISTS (SELECT 1 FROM flag WHERE item_id = $1 AND status = 'open')
                RETURNING id`, [b.item_id])
    : await q(`UPDATE item SET status = 'retired', retired_reason = 'Report upheld, not fixed', status_before_review = NULL, updated_at = now()
                WHERE id = $1 AND status = 'under_review' RETURNING id`, [b.item_id]);
  if (!r.length) throw new HttpError(409, 'That question is not waiting for a fix');
  await q('INSERT INTO audit_log (actor_id, action, target, detail) VALUES ($1, $2, $3, $4)',
    [ed.id, b.action === 'reinstate' ? 'item_reinstated' : 'item_retired', b.item_id, '{}']);
  return json({ ok: true });
});
