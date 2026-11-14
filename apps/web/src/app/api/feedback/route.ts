import { checkOrigin, handle, json, readJson, requireApiUser, HttpError } from '@/lib/http';
import { q } from '@/lib/db';

const AREAS = ['questions', 'practice', 'insights', 'design', 'idea', 'problem', 'other'];

/** Product feedback from the beta testers. */
export const POST = handle(async (req: Request) => {
  checkOrigin(req);
  const u = await requireApiUser();
  const b = await readJson<{ area?: unknown; body?: unknown; screen?: unknown }>(req, 16 * 1024);
  const text = typeof b.body === 'string' ? b.body.trim() : '';
  if (text.length < 3) throw new HttpError(400, 'Write a few words of feedback first');
  const area = AREAS.includes(b.area as string) ? (b.area as string) : 'other';
  await q('INSERT INTO product_feedback (user_id, area, body, screen) VALUES ($1, $2, $3, $4)',
    [u.id, area, text.slice(0, 5000), typeof b.screen === 'string' ? b.screen.slice(0, 200) : null]);
  return json({ ok: true });
});
