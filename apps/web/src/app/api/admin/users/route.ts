import { BRAND } from '@/brand/generated/brand';
import { checkOrigin, handle, isEmail, json, readJson, requireApiUser, HttpError } from '@/lib/http';
import { newToken, sha256, type Role } from '@/lib/auth';
import { one, q, tx } from '@/lib/db';
import { sendMail, signInMail } from '@/lib/email';

const ROLES: Role[] = ['trainee', 'supervisor', 'reviewer', 'editor', 'admin'];

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const u = await requireApiUser('admin');
  const users = await q(
    `SELECT u.id, p.email, p.display_name AS name, u.roles, u.created_at, u.last_sign_in_at,
            c.user_id IS NOT NULL AS consented,
            (SELECT count(*) FROM answer a WHERE a.user_id = u.id)::int AS answered
       FROM app_user u JOIN user_profile p ON p.user_id = u.id LEFT JOIN consent c ON c.user_id = u.id
      WHERE u.tenant_id = $1 AND u.deleted_at IS NULL
      ORDER BY u.created_at DESC`, [u.tenantId]);
  return json({ users });
});

/** Invite someone: creates their account and emails them a sign-in link. */
export const POST = handle(async (req: Request) => {
  checkOrigin(req);
  const admin = await requireApiUser('admin');
  const b = await readJson<{ email?: unknown; name?: unknown; roles?: unknown }>(req, 4096);
  if (!isEmail(b.email)) throw new HttpError(400, 'Enter a valid email address');
  const email = b.email.trim().toLowerCase();
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
  const roles = Array.isArray(b.roles) && b.roles.length ? b.roles : ['trainee'];
  if (!roles.every((r) => ROLES.includes(r as Role))) throw new HttpError(400, 'Unknown role');
  if (await one('SELECT 1 FROM user_profile WHERE lower(email) = $1', [email])) throw new HttpError(409, 'That email already has an account');

  const token = newToken();
  await tx(async (c) => {
    const u = await c.query<{ id: string }>(
      'INSERT INTO app_user (tenant_id, roles, invited_by) VALUES ($1, $2, $3) RETURNING id', [admin.tenantId, roles, admin.id]);
    await c.query('INSERT INTO user_profile (user_id, email, display_name) VALUES ($1, $2, $3)', [u.rows[0].id, email, name]);
    await c.query(`INSERT INTO login_token (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')`, [sha256(token), u.rows[0].id]);
    await c.query(`INSERT INTO audit_log (actor_id, action, target, detail) VALUES ($1, 'invite_user', $2, $3)`,
      [admin.id, email, JSON.stringify({ roles })]);
  });
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  const mail = signInMail(email, `${base}/auth/confirm?token=${token}`, admin.name || `The ${BRAND.name} team`);
  mail.text = mail.text.replace('expires in 15 minutes', 'expires in 7 days');
  mail.html = mail.html.replace('expires in 15 minutes', 'expires in 7 days');
  await sendMail(mail);
  return json({ ok: true });
});
