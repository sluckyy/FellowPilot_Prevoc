import { NextResponse } from 'next/server';
import { checkOrigin, handle, readJson, HttpError } from '@/lib/http';
import { createSession, sessionCookie, sha256 } from '@/lib/auth';
import { one } from '@/lib/db';

/**
 * Exchanges a sign-in token for a session. This is a POST from the confirm page, not the email
 * link itself, so email security scanners that open links can't use up the token.
 */
export const POST = handle(async (req: Request) => {
  checkOrigin(req);
  const { token } = await readJson<{ token?: unknown }>(req, 1024);
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw new HttpError(400, 'This sign-in link is not valid');
  const row = await one<{ user_id: string }>(
    `UPDATE login_token SET used_at = now()
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
      RETURNING user_id`, [sha256(token)]);
  if (!row) throw new HttpError(400, 'This sign-in link has expired or was already used. Request a new one.');
  const session = await createSession(row.user_id, req.headers.get('user-agent'));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(session));
  return res;
});
