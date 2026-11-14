import { checkOrigin, handle, json, readJson, requireApiUser, HttpError } from '@/lib/http';
import { ensureEventPartitions, pool } from '@/lib/db';
import { feedbackFor, type Feedback } from '@/lib/data';
import { validateClientEvent, type AppEvent } from '@/lib/core';

const MAX_BATCH = 200;

/**
 * Receives a batch of events from the device queue. user_id and tenant_id always come from the
 * session. Each event is stored at most once (re-sends after a dropped connection are ignored).
 * Answers are marked by the database from the stored key; feedback is returned for each one.
 */
export const POST = handle(async (req: Request) => {
  await ensureEventPartitions();
  checkOrigin(req);
  const u = await requireApiUser();
  const body = await readJson<{ events?: unknown }>(req, 1024 * 1024);
  if (!Array.isArray(body.events)) throw new HttpError(400, 'events must be an array');
  if (body.events.length > MAX_BATCH) throw new HttpError(413, `Send at most ${MAX_BATCH} events at a time`);

  const accepted: string[] = [];
  const duplicates: string[] = [];
  const rejected: { event_id: unknown; errors: string[] }[] = [];
  const answered: { item_id: string; item_version: number }[] = [];
  const now = Date.now();

  const c = await pool().connect();
  try {
    await c.query('BEGIN');
    for (const raw of body.events as Partial<AppEvent>[]) {
      const v = validateClientEvent(raw, now);
      if (!v.ok) { rejected.push({ event_id: raw?.event_id, errors: v.errors }); continue; }
      const e = raw as AppEvent;
      try {
        await c.query('SAVEPOINT ev');
        const r = await c.query(
          `INSERT INTO event (event_id, event_type, user_id, tenant_id, session_id, client_ts, app_version, mode, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (event_id, client_ts) DO NOTHING`,
          [e.event_id, e.event_type, u.id, u.tenantId, e.session_id, e.client_ts, e.app_version, e.mode, JSON.stringify(e.payload)]);
        await c.query('RELEASE SAVEPOINT ev');
        (r.rowCount ? accepted : duplicates).push(e.event_id);
        if (e.event_type === 'answer_submitted') {
          answered.push({ item_id: String(e.payload.item_id), item_version: Number(e.payload.item_version) });
        }
      } catch (err) {
        await c.query('ROLLBACK TO SAVEPOINT ev').catch(() => {});
        const msg = err instanceof Error && /unknown item version/.test(err.message) ? 'unknown question version' : 'could not be stored';
        if (msg === 'could not be stored') console.error('event insert failed', err);
        rejected.push({ event_id: e.event_id, errors: [msg] });
      }
    }
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    c.release();
  }

  const feedback: Feedback[] = [];
  for (const a of answered) {
    const f = await feedbackFor(u.id, a.item_id, a.item_version);
    if (f) feedback.push(f);
  }
  return json({ accepted, duplicates, rejected, feedback });
});
