import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { one, q } from './db';

export const SESSION_COOKIE = 'mcq_session';
const SESSION_DAYS = 30;

export type Role = 'trainee' | 'supervisor' | 'reviewer' | 'editor' | 'admin';

export interface CurrentUser {
  id: string;
  tenantId: string;
  roles: Role[];
  email: string;
  name: string;
  examDate: string | null;
  hasConsent: boolean;
  supervisorView: boolean;
  weeklyGoal: number;
  pgyLevel: number | null;
  settingPreference: string;
  img: boolean;
  /** Has created a goal plan at onboarding. */
  hasPlan: boolean;
  teamId: string | null;
}

/** The tenant new accounts join (the first admin's bootstrap). */
export const tenantSlug = () => process.env.TENANT_SLUG ?? 'ynlhn';

export const sha256 = (s: string) => createHash('sha256').update(s).digest();
export const newToken = () => randomBytes(32).toString('base64url');

/** The signed-in user, or null. Reads the session cookie and checks it against the database. */
export async function currentUser(): Promise<CurrentUser | null> {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw || raw.length > 100) return null;
  const row = await one<{
    id: string; tenant_id: string; roles: Role[]; email: string; display_name: string;
    exam_date: string | null; has_consent: boolean; supervisor_view: boolean | null; stale: boolean; weekly_goal: number;
    pgy_level: number | null; setting_preference: string; img: boolean; has_plan: boolean; team_id: string | null;
  }>(
    `SELECT u.id, u.tenant_id, u.roles, p.email, p.display_name, to_char(u.exam_date, 'YYYY-MM-DD') AS exam_date,
            c.user_id IS NOT NULL AS has_consent, c.supervisor_view, u.weekly_goal,
            u.pgy_level, u.setting_preference, u.img,
            EXISTS (SELECT 1 FROM goal_plan g WHERE g.user_id = u.id) AS has_plan,
            (SELECT team_id FROM team_member m WHERE m.user_id = u.id) AS team_id,
            s.last_seen_at < now() - interval '1 hour' AS stale
       FROM session s
       JOIN app_user u ON u.id = s.user_id AND u.deleted_at IS NULL
       JOIN user_profile p ON p.user_id = u.id
       LEFT JOIN consent c ON c.user_id = u.id
      WHERE s.id_hash = $1 AND s.expires_at > now()`,
    [sha256(raw)],
  );
  if (!row) return null;
  if (row.stale) await q('UPDATE session SET last_seen_at = now() WHERE id_hash = $1', [sha256(raw)]);
  return {
    id: row.id, tenantId: row.tenant_id, roles: row.roles, email: row.email, name: row.display_name,
    examDate: row.exam_date, hasConsent: row.has_consent, supervisorView: !!row.supervisor_view, weeklyGoal: row.weekly_goal,
    pgyLevel: row.pgy_level, settingPreference: row.setting_preference, img: row.img, hasPlan: row.has_plan, teamId: row.team_id,
  };
}

/** For pages: sends signed-out visitors to /login and new users to /welcome. */
/** Reviewers, editors and admins can review questions trainees and supervisors write. */
export const canReview = (u: Pick<CurrentUser, 'roles'>) => u.roles.some((r) => r === 'reviewer' || r === 'editor' || r === 'admin');

export async function requirePageUser(opts: { allowNoConsent?: boolean; role?: Role } = {}): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) redirect('/login');
  if (!u.hasConsent && !opts.allowNoConsent) redirect('/welcome');
  if (opts.role && !u.roles.includes(opts.role) && !u.roles.includes('admin')) redirect('/');
  return u;
}

export async function createSession(userId: string, userAgent: string | null): Promise<string> {
  const token = newToken();
  await q(`INSERT INTO session (id_hash, user_id, expires_at, user_agent) VALUES ($1, $2, now() + make_interval(days => $3), $4)`,
    [sha256(token), userId, SESSION_DAYS, userAgent?.slice(0, 200) ?? null]);
  await q('UPDATE app_user SET last_sign_in_at = now() WHERE id = $1', [userId]);
  return token;
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE, value: token, httpOnly: true, sameSite: 'lax' as const, path: '/',
    secure: process.env.NODE_ENV === 'production' && !process.env.E2E,
    maxAge: SESSION_DAYS * 24 * 3600,
  };
}

export async function endSession(): Promise<void> {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (raw) await q('DELETE FROM session WHERE id_hash = $1', [sha256(raw)]);
}
