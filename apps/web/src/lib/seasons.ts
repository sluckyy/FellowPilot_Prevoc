import 'server-only';
import { one, q } from './db';
import { challengeProgress, isChallenge, windowFacts, MIN_TEAM_SIZE, type Challenge } from './core';

export interface Season {
  id: string; tenant_id: string | null; title: string; theme: string; starts_on: string; ends_on: string;
  challenge: Challenge; team_goal: number | null; focus_areas: string[]; active: boolean; updated_at: Date;
}

const SELECT = `SELECT id, tenant_id, title, theme, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on,
                       challenge, team_goal, focus_areas, active, updated_at FROM season`;

export async function listSeasons(tenantId: string): Promise<Season[]> {
  const rows = await q<Season & { challenge: unknown }>(`${SELECT} WHERE tenant_id IS NULL OR tenant_id = $1 ORDER BY starts_on DESC`, [tenantId]);
  return rows.filter((r) => isChallenge(r.challenge)) as Season[];
}

/** The season running today (Adelaide time), if any. */
export async function currentSeason(tenantId: string): Promise<Season | null> {
  const r = await one<Season & { challenge: unknown }>(
    `${SELECT} WHERE active AND (tenant_id IS NULL OR tenant_id = $1)
       AND (now() AT TIME ZONE 'Australia/Adelaide')::date BETWEEN starts_on AND ends_on
      ORDER BY tenant_id NULLS LAST, starts_on DESC LIMIT 1`, [tenantId]);
  return r && isChallenge(r.challenge) ? (r as Season) : null;
}

/** What one person (or every member of a team) did inside the season's window. */
async function facts(season: Season, userIds: string[]) {
  const [rows, refl] = await Promise.all([
    q<{ learning_area: string; attempt_number: number }>(
      `SELECT v.learning_area, a.attempt_number FROM answer a JOIN item_version v ON v.item_id = a.item_id AND v.version = a.item_version
        WHERE a.user_id = ANY($1::uuid[]) AND (a.client_ts AT TIME ZONE 'Australia/Adelaide')::date BETWEEN $2 AND $3`,
      [userIds, season.starts_on, season.ends_on]),
    one<{ n: string }>(
      `SELECT count(*) AS n FROM reflection WHERE user_id = ANY($1::uuid[]) AND deleted_at IS NULL
        AND (created_at AT TIME ZONE 'Australia/Adelaide')::date BETWEEN $2 AND $3`, [userIds, season.starts_on, season.ends_on]),
  ]);
  return windowFacts(rows, Number(refl?.n ?? 0));
}

export interface SeasonProgress { current: number; target: number; done: boolean }

export async function seasonProgress(season: Season, userId: string): Promise<SeasonProgress> {
  return challengeProgress(season.challenge, await facts(season, [userId]));
}

/** Team total, or null while the team is too small to show an aggregate. */
export async function teamSeasonProgress(season: Season, teamId: string): Promise<(SeasonProgress & { members: number }) | null> {
  const members = await q<{ user_id: string }>('SELECT user_id FROM team_member WHERE team_id = $1', [teamId]);
  if (members.length < MIN_TEAM_SIZE) return null;
  const target = season.team_goal ?? season.challenge.n * members.length;
  return { ...challengeProgress(season.challenge, await facts(season, members.map((m) => m.user_id)), target), members: members.length };
}

/** How many seasons (ended or running) this trainee has completed the challenge for. */
export async function completedSeasons(tenantId: string, userId: string): Promise<number> {
  const seasons = (await listSeasons(tenantId)).filter((s) => s.starts_on <= new Date().toISOString().slice(0, 10));
  let n = 0;
  for (const s of seasons) if ((await seasonProgress(s, userId)).done) n++;
  return n;
}

export interface SeasonInput { id: string; title: string; theme: string; starts_on: string; ends_on: string; challenge: Challenge; team_goal: number | null; focus_areas: string[]; active: boolean }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function toSeasonInput(b: unknown): { input: SeasonInput; errors: Record<string, string> } {
  const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const ch = (o.challenge && typeof o.challenge === 'object' ? o.challenge : {}) as Record<string, unknown>;
  const challenge = { type: String(ch.type ?? ''), n: Number(ch.n), ...(ch.area ? { area: String(ch.area) } : {}) } as Challenge;
  const input: SeasonInput = {
    id: str(o.id, 40), title: str(o.title, 60), theme: str(o.theme, 300), starts_on: str(o.starts_on, 10), ends_on: str(o.ends_on, 10),
    challenge, team_goal: o.team_goal === null || o.team_goal === '' || o.team_goal === undefined ? null : Number(o.team_goal),
    focus_areas: (Array.isArray(o.focus_areas) ? o.focus_areas : []).filter((x): x is string => typeof x === 'string').slice(0, 6),
    active: o.active !== false,
  };
  const errors: Record<string, string> = {};
  if (!/^[a-z0-9-]{2,40}$/.test(input.id)) errors.id = 'Use 2 to 40 lowercase letters, numbers or hyphens, e.g. "2026-12-sepsis".';
  if (input.title.length < 2) errors.title = 'Give the season a title.';
  if (!DATE.test(input.starts_on) || !DATE.test(input.ends_on) || input.ends_on < input.starts_on) errors.dates = 'Enter a start and end date, end on or after start.';
  if (!isChallenge(input.challenge)) errors.challenge = 'Choose a challenge type and a whole-number target (name the area for an area challenge).';
  if (input.team_goal !== null && (!Number.isInteger(input.team_goal) || input.team_goal < 1)) errors.team_goal = 'A whole number, or leave it blank.';
  return { input, errors };
}
