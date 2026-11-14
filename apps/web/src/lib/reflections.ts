import 'server-only';
import { one, q, tx } from './db';
import { decryptFor, encryptFor } from './crypto';
import { APP_VERSION } from './constants';
import { cleanTags, isPromptId, suggestTags, wordCount, REFLECTION_LIMITS } from './core';
import type { CurrentUser } from './auth';

export interface Reflection { id: string; body: string; words: number; tags: string[]; prompt_id: string; created_at: Date; updated_at: Date }

/** This trainee's entries, newest first. Only their own key can open them. */
export async function listReflections(userId: string, limit = 50): Promise<Reflection[]> {
  const rows = await q<Omit<Reflection, 'body'> & { body_enc: Buffer }>(
    `SELECT id, body_enc, words, tags, prompt_id, created_at, updated_at FROM reflection
      WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT $2`, [userId, limit]);
  return rows.map(({ body_enc, ...r }) => {
    let body = '';
    try { body = decryptFor(userId, body_enc); } catch { body = '(This entry could not be decrypted.)'; }
    return { ...r, body };
  });
}

/** Tags only (no text), for the progress map and gamification. */
export async function reflectionTags(userId: string): Promise<string[][]> {
  const rows = await q<{ tags: string[] }>('SELECT tags FROM reflection WHERE user_id = $1 AND deleted_at IS NULL', [userId]);
  return rows.map((r) => r.tags);
}

export const cleanBody = (x: unknown) => (typeof x === 'string' ? x.replace(/\r\n/g, '\n').trim().slice(0, REFLECTION_LIMITS.max) : '');

export async function createReflection(u: CurrentUser, body: string, tags: unknown, promptId: unknown): Promise<{ id: string; suggested: string[] }> {
  const prompt = isPromptId(promptId) ? promptId : '';
  const confirmed = cleanTags(tags);
  const suggested = suggestTags(body);
  const id = await tx(async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO reflection (user_id, tenant_id, body_enc, words, tags, prompt_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [u.id, u.tenantId, encryptFor(u.id, body), wordCount(body), confirmed, prompt]);
    await c.query(
      `INSERT INTO event (event_id, event_type, user_id, tenant_id, session_id, client_ts, app_version, mode, payload)
       VALUES (gen_random_uuid(), 'reflection_logged', $1, $2, gen_random_uuid(), now(), $3, 'none', $4)`,
      [u.id, u.tenantId, APP_VERSION, JSON.stringify({ reflection_id: r.rows[0].id, words: wordCount(body), tags: confirmed, prompt_id: prompt })]);
    return r.rows[0].id;
  });
  return { id, suggested };
}

export async function updateReflection(u: CurrentUser, id: string, patch: { body?: unknown; tags?: unknown }): Promise<boolean> {
  const own = await one('SELECT 1 FROM reflection WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [id, u.id]);
  if (!own) return false;
  if (patch.body !== undefined) {
    const body = cleanBody(patch.body);
    if (wordCount(body) < 1) return false;
    await q('UPDATE reflection SET body_enc = $3, words = $4, updated_at = now() WHERE id = $1 AND user_id = $2', [id, u.id, encryptFor(u.id, body), wordCount(body)]);
  }
  if (patch.tags !== undefined) {
    const tags = cleanTags(patch.tags);
    await q('UPDATE reflection SET tags = $3, updated_at = now() WHERE id = $1 AND user_id = $2', [id, u.id, tags]);
    await q(`INSERT INTO event (event_id, event_type, user_id, tenant_id, session_id, client_ts, app_version, mode, payload)
             VALUES (gen_random_uuid(), 'reflection_tags_confirmed', $1, $2, gen_random_uuid(), now(), $3, 'none', $4)`,
      [u.id, u.tenantId, APP_VERSION, JSON.stringify({ reflection_id: id, tags })]);
  }
  return true;
}

export async function deleteReflection(u: CurrentUser, id: string): Promise<boolean> {
  const r = await q('UPDATE reflection SET deleted_at = now(), body_enc = $3 WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id', [id, u.id, Buffer.alloc(0)]);
  return r.length > 0;
}
