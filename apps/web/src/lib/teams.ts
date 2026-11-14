import 'server-only';
import { randomInt } from 'node:crypto';
import { one, q, tx } from './db';
import { APP_VERSION } from './constants';
import type { CurrentUser } from './auth';
import { HttpError } from './http';

export interface Team { id: string; name: string; kind: string; join_code: string; size: number; members: string[] }

export async function myTeam(userId: string): Promise<Team | null> {
  const t = await one<{ id: string; name: string; kind: string; join_code: string }>(
    `SELECT t.id, t.name, t.kind, t.join_code FROM team t JOIN team_member m ON m.team_id = t.id WHERE m.user_id = $1`, [userId]);
  if (!t) return null;
  const members = await q<{ name: string }>(
    `SELECT coalesce(nullif(split_part(p.display_name, ' ', 1), ''), 'Someone') AS name FROM team_member m JOIN user_profile p ON p.user_id = m.user_id
      WHERE m.team_id = $1 ORDER BY m.joined_at`, [t.id]);
  return { ...t, size: members.length, members: members.map((m) => m.name) };
}

const code = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('');

const joinedEvent = (c: { query: (t: string, p: unknown[]) => Promise<unknown> }, u: CurrentUser, type: 'team_joined' | 'team_left', teamId: string) =>
  c.query(`INSERT INTO event (event_id, event_type, user_id, tenant_id, session_id, client_ts, app_version, mode, payload)
           VALUES (gen_random_uuid(), $4, $1, $2, gen_random_uuid(), now(), $3, 'none', $5)`,
    [u.id, u.tenantId, APP_VERSION, type, JSON.stringify({ team_id: teamId })]);

export async function createTeam(u: CurrentUser, name: string, kind: string): Promise<Team> {
  if (u.teamId) throw new HttpError(409, 'Leave your current team first');
  const n = name.trim().slice(0, 40);
  if (n.length < 2) throw new HttpError(400, 'Give the team a name (for example your hospital or cohort)');
  const k = ['site', 'cohort', 'other'].includes(kind) ? kind : 'site';
  const id = await tx(async (c) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await c.query('SAVEPOINT t');
        const r = await c.query<{ id: string }>('INSERT INTO team (tenant_id, name, kind, join_code, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id', [u.tenantId, n, k, code(), u.id]);
        await c.query('INSERT INTO team_member (team_id, user_id) VALUES ($1, $2)', [r.rows[0].id, u.id]);
        await joinedEvent(c, u, 'team_joined', r.rows[0].id);
        return r.rows[0].id;
      } catch (e) {
        await c.query('ROLLBACK TO SAVEPOINT t');
        const msg = e instanceof Error ? e.message : '';
        if (/team_name_uq/.test(msg)) throw new HttpError(409, 'A team with that name already exists: join it with its code instead');
        if (!/join_code/.test(msg)) throw e;
      }
    }
    throw new HttpError(500, 'Could not create a join code');
  });
  return (await myTeam(u.id)) ?? { id, name: n, kind: k, join_code: '', size: 1, members: [] };
}

export async function joinTeam(u: CurrentUser, joinCode: string): Promise<Team> {
  if (u.teamId) throw new HttpError(409, 'Leave your current team first');
  const jc = joinCode.trim().toUpperCase();
  const t = await one<{ id: string }>('SELECT id FROM team WHERE join_code = $1 AND tenant_id = $2', [jc, u.tenantId]);
  if (!t) throw new HttpError(404, 'No team has that code. Check it with whoever set the team up.');
  await tx(async (c) => {
    await c.query('INSERT INTO team_member (team_id, user_id) VALUES ($1, $2)', [t.id, u.id]);
    await joinedEvent(c, u, 'team_joined', t.id);
  });
  return (await myTeam(u.id))!;
}

export async function leaveTeam(u: CurrentUser): Promise<void> {
  if (!u.teamId) return;
  await tx(async (c) => {
    await c.query('DELETE FROM team_member WHERE user_id = $1', [u.id]);
    await joinedEvent(c, u, 'team_left', u.teamId!);
    await c.query('DELETE FROM team t WHERE t.id = $1 AND NOT EXISTS (SELECT 1 FROM team_member m WHERE m.team_id = t.id)', [u.teamId]);
  });
}
