import { checkOrigin, handle, json, readJson, requireApiUser, HttpError } from '@/lib/http';
import { q } from '@/lib/db';
import { WEEKLY_GOAL_CHOICES } from '@/lib/core';

export const dynamic = 'force-dynamic';

/** Set the trainee's weekly question goal. Body: { weekly_goal: 25 | 50 | 100 | 150 | 200 } */
export const PUT = handle(async (req: Request) => {
  checkOrigin(req);
  const u = await requireApiUser();
  const b = await readJson<{ weekly_goal?: unknown }>(req, 1024);
  if (!(WEEKLY_GOAL_CHOICES as readonly unknown[]).includes(b.weekly_goal)) throw new HttpError(400, `Choose one of ${WEEKLY_GOAL_CHOICES.join(', ')}`);
  await q('UPDATE app_user SET weekly_goal = $2 WHERE id = $1', [u.id, b.weekly_goal]);
  return json({ ok: true, weekly_goal: b.weekly_goal });
});
