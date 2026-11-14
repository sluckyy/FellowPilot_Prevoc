import 'server-only';
import { NextResponse } from 'next/server';
import { currentUser, type CurrentUser, type Role } from './auth';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

/**
 * Mutating requests must come from this site (cookies are SameSite=Lax; this closes the rest).
 * Compares the Origin header with the Host the request was sent to.
 */
export function checkOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!origin || !host) throw new HttpError(403, 'Missing origin');
  if (new URL(origin).host !== host) throw new HttpError(403, 'Cross-site request refused');
}

export async function requireApiUser(role?: Role, opts: { allowNoConsent?: boolean } = {}): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, 'Sign in first');
  if (!u.hasConsent && !opts.allowNoConsent) throw new HttpError(403, 'Accept the privacy terms first');
  // Admins can do everything any other role can.
  if (role && !u.roles.includes(role) && !u.roles.includes('admin')) throw new HttpError(403, 'You do not have access to this');
  return u;
}

export async function readJson<T>(req: Request, maxBytes = 256 * 1024): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request too large');
  try { return JSON.parse(text) as T; } catch { throw new HttpError(400, 'Invalid JSON'); }
}

/** Wraps a route handler: HttpErrors become JSON responses; anything else is logged as a 500. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...('errors' in e ? { errors: (e as HttpError & { errors: unknown }).errors } : {}) }, e.status);
      console.error(e);
      return json({ error: 'Something went wrong on our side. Try again in a moment.' }, 500);
    }
  };
}

export const isEmail = (s: unknown): s is string =>
  typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
