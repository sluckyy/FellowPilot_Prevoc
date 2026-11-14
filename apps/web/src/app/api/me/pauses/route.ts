import { checkOrigin, handle, json, readJson, requireApiUser, HttpError } from '@/lib/http';
import { q } from '@/lib/db';
import { APP_VERSION } from '@/lib/constants';
import { listPauses } from '@/lib/progress';
import { PAUSE_REASONS, MAX_PAUSE_DAYS } from '@/lib/core';

export const dynamic = 'force-dynamic';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const GET = handle(async () => json({ pauses: await listPauses((await requireApiUser()).id) }));

/** Pause the streak for rostered nights, leave or exams. Body: { starts_on, ends_on, reason } */
export const POST = handle(async (req: Request) => {
  checkOrigin(req);
  const u = await requireApiUser();
  const b = await readJson<{ starts_on?: unknown; ends_on?: unknown; reason?: unknown }>(req, 2048);
  const s = typeof b.starts_on === 'string' ? b.starts_on : '', e = typeof b.ends_on === 'string' ? b.ends_on : '';
  if (!DATE.test(s) || !DATE.test(e) || Number.isNaN(Date.parse(s)) || Number.isNaN(Date.parse(e))) throw new HttpError(400, 'Enter a start and end date');
  if (e < s) throw new HttpError(400, 'The end date is before the start date');
  if ((Date.parse(e) - Date.parse(s)) / 86_400_000 > MAX_PAUSE_DAYS) throw new HttpError(400, `A pause can cover up to ${MAX_PAUSE_DAYS} days`);
  if (!(PAUSE_REASONS as readonly unknown[]).includes(b.reason)) throw new HttpError(400, 'Choose a reason');
  const open = await q<{ n: string }>(`SELECT count(*) AS n FROM streak_pause WHERE user_id = $1 AND ends_on >= (now() AT TIME ZONE 'Australia/Adelaide')::date`, [u.id]);
  if (Number(open[0].n) >= 6) throw new HttpError(400, 'You already have several pauses set. Remove one first.');
  const r = await q<{ id: string }>('INSERT INTO streak_pause (user_id, starts_on, ends_on, reason) VALUES ($1, $2, $3, $4) RETURNING id', [u.id, s, e, b.reason]);
  await q(`INSERT INTO event (event_id, event_type, user_id, tenant_id, session_id, client_ts, app_version, mode, payload)
           VALUES (gen_random_uuid(), 'streak_pause_set', $1, $2, gen_random_uuid(), now(), $3, 'none', $4)`,
    [u.id, u.tenantId, APP_VERSION, JSON.stringify({ pause_id: r[0].id, starts_on: s, ends_on: e, reason: b.reason })]);
  return json({ ok: true, id: r[0].id });
});
