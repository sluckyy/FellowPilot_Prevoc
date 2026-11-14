import { checkOrigin, handle, json, readJson, requireApiUser, HttpError } from '@/lib/http';
import { tx } from '@/lib/db';
import { PRIVACY_VERSION } from '@/lib/constants';

/** Saves consent and profile choices from the welcome page and settings. */
export const POST = handle(async (req: Request) => {
  checkOrigin(req);
  const u = await requireApiUser(undefined, { allowNoConsent: true });
  const b = await readJson<{ name?: unknown; pgyLevel?: unknown; settingPreference?: unknown; img?: unknown; agree?: unknown; supervisorView?: unknown }>(req, 4096);
  if (b.agree !== true) throw new HttpError(400, 'Tick the box to accept the privacy terms');
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
  if (!name) throw new HttpError(400, 'Enter your name');
  const pgy = b.pgyLevel === 1 || b.pgyLevel === 2 ? b.pgyLevel : b.pgyLevel === undefined || b.pgyLevel === null || b.pgyLevel === '' ? null : NaN;
  if (Number.isNaN(pgy)) throw new HttpError(400, 'Choose PGY1 or PGY2');
  const setting = ['rural', 'metro', 'any'].includes(b.settingPreference as string) ? (b.settingPreference as string) : 'any';
  await tx(async (c) => {
    await c.query('UPDATE user_profile SET display_name = $2 WHERE user_id = $1', [u.id, name]);
    await c.query('UPDATE app_user SET pgy_level = $2, setting_preference = $3, img = $4 WHERE id = $1', [u.id, pgy, setting, b.img === true]);
    await c.query(
      `INSERT INTO consent (user_id, privacy_version, supervisor_view) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET privacy_version = EXCLUDED.privacy_version, accepted_at = now(),
         supervisor_view = EXCLUDED.supervisor_view`,
      [u.id, PRIVACY_VERSION, b.supervisorView === true]);
  });
  return json({ ok: true });
});
