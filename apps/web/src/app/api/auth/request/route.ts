import { checkOrigin, handle, isEmail, json, readJson, HttpError } from '@/lib/http';
import { newToken, sha256, tenantSlug } from '@/lib/auth';
import { one, q, tx } from '@/lib/db';
import { sendMail, signInMail } from '@/lib/email';

const MAX_LINKS_PER_15_MIN = 5;

/**
 * Sends a sign-in link to a registered (invited) email. The reply is the same whether or not the
 * email is registered, so the form can't be used to discover who is on the beta.
 * The first admin is created on first sign-in from ADMIN_EMAIL.
 */
export const POST = handle(async (req: Request) => {
  checkOrigin(req);
  const body = await readJson<{ email?: unknown }>(req, 2048);
  if (!isEmail(body.email)) throw new HttpError(400, 'Enter a valid email address');
  const email = body.email.trim().toLowerCase();

  let user = await one<{ id: string }>(
    `SELECT u.id FROM user_profile p JOIN app_user u ON u.id = p.user_id
      WHERE lower(p.email) = $1 AND u.deleted_at IS NULL`, [email]);

  const admin = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (!user && admin && email === admin) {
    user = await tx(async (c) => {
      const t = await c.query<{ id: string }>('SELECT id FROM tenant WHERE slug = $1', [tenantSlug()]);
      if (!t.rows.length) throw new Error(`Tenant ${tenantSlug()} is missing; run the migrations`);
      const u = await c.query<{ id: string }>(
        `INSERT INTO app_user (tenant_id, roles) VALUES ($1, ARRAY['admin','editor','trainee']) RETURNING id`, [t.rows[0].id]);
      await c.query('INSERT INTO user_profile (user_id, email, display_name) VALUES ($1, $2, $3)', [u.rows[0].id, email, '']);
      await c.query(`INSERT INTO audit_log (actor_id, action, target) VALUES ($1, 'bootstrap_admin', $2)`, [u.rows[0].id, email]);
      return u.rows[0];
    });
  }

  if (user) {
    const recent = await one<{ n: string }>(
      `SELECT count(*) AS n FROM login_token WHERE user_id = $1 AND created_at > now() - interval '15 minutes'`, [user.id]);
    if (Number(recent?.n ?? 0) < MAX_LINKS_PER_15_MIN) {
      const token = newToken();
      await q('INSERT INTO login_token (token_hash, user_id) VALUES ($1, $2)', [sha256(token), user.id]);
      const base = process.env.APP_URL ?? new URL(req.url).origin;
      await sendMail(signInMail(email, `${base}/auth/confirm?token=${token}`));
    }
  }
  return json({ ok: true, message: 'If that email is registered for the beta, a sign-in link is on its way.' });
});
