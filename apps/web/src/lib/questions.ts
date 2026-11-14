import 'server-only';
import type { PoolClient } from 'pg';
import { one, q } from './db';
import type { CurrentUser } from './auth';
import { curriculumArea, DRAFT_OPTIONS, type DraftQuestion } from './core';

export type DraftStatus = 'draft' | 'submitted' | 'changes_requested' | 'accepted' | 'rejected' | 'withdrawn';

export interface DraftRecord {
  id: string;
  author_id: string;
  author_name: string;
  author_role: 'trainee' | 'supervisor';
  status: DraftStatus;
  content: DraftQuestion;
  recall_declared: boolean;
  coaching: { text: string; model: string; at: string } | null;
  review_note: string;
  reviewer_name: string | null;
  item_id: string | null;
  updated_at: Date;
  submitted_at: Date | null;
  reviewed_at: Date | null;
}

export const STATUS_LABELS: Record<DraftStatus, string> = {
  draft: 'Draft', submitted: 'Waiting for review', changes_requested: 'Changes requested',
  accepted: 'Accepted', rejected: 'Not accepted', withdrawn: 'Discarded',
};

/** Authors can edit while drafting or after a reviewer asks for changes. */
export const editable = (s: DraftStatus) => s === 'draft' || s === 'changes_requested';

const SELECT = `SELECT d.id, d.author_id, ap.display_name AS author_name, d.author_role, d.status, d.content, d.recall_declared,
                       d.coaching, d.review_note, rp.display_name AS reviewer_name, d.item_id, d.updated_at, d.submitted_at, d.reviewed_at
                  FROM draft_item d
                  JOIN user_profile ap ON ap.user_id = d.author_id
                  LEFT JOIN user_profile rp ON rp.user_id = d.reviewer_id`;

export async function getDraft(id: string, tenantId: string): Promise<DraftRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return one<DraftRecord>(`${SELECT} WHERE d.id = $1 AND d.tenant_id = $2`, [id, tenantId]);
}

export async function myDrafts(userId: string): Promise<DraftRecord[]> {
  return q<DraftRecord>(`${SELECT} WHERE d.author_id = $1 AND d.status <> 'withdrawn' ORDER BY d.updated_at DESC`, [userId]);
}

export async function reviewQueue(tenantId: string): Promise<DraftRecord[]> {
  return q<DraftRecord>(`${SELECT} WHERE d.tenant_id = $1 AND d.status = 'submitted' ORDER BY d.submitted_at`, [tenantId]);
}

export async function recentlyReviewed(tenantId: string): Promise<DraftRecord[]> {
  return q<DraftRecord>(
    `${SELECT} WHERE d.tenant_id = $1 AND d.status IN ('accepted', 'rejected', 'changes_requested')
      ORDER BY d.reviewed_at DESC NULLS LAST LIMIT 20`, [tenantId]);
}

export const authorRole = (u: CurrentUser): 'trainee' | 'supervisor' =>
  u.roles.includes('supervisor') && !u.roles.includes('trainee') ? 'supervisor' : 'trainee';

/**
 * Turns an accepted draft into a bank question: a local item (this tenant only) served as an unscored
 * pretest question until it has enough answers to calibrate, exactly like AI-generated items.
 */
export async function publishDraft(c: PoolClient, d: DraftRecord, tenantId: string, reviewerName: string): Promise<string> {
  const x = d.content;
  const area = curriculumArea(x.learning_area);
  const age = /\b(\d+)[- ](year|month|week|day)s?[- ]old\b/i.exec(x.stem);
  const level = /\b(diagnos|likely cause|most likely|interpret|shows)\b/i.test(x.lead_in) ? 'interpretation' : 'management';
  const item = await c.query<{ id: string }>(
    `INSERT INTO item (id, tenant_id, status) VALUES (gen_random_uuid(), $1, 'pretest') RETURNING id`, [tenantId]);
  const itemId = item.rows[0].id;
  await c.query(
    `INSERT INTO item_version (item_id, version, stem, lead_in, options, key, explanations, learning_point, rural_note,
        learning_area, domains, presentation, context, cognitive_level, patient, target_difficulty, provenance, author_id,
        "references", review_level, reviewed_by)
     VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 3, $15, $16, $17, 'peer', $18)`,
    [itemId, x.stem.trim(), x.lead_in.trim(),
      JSON.stringify(DRAFT_OPTIONS.map((id) => ({ id, text: x.options[id].trim() }))), x.key,
      JSON.stringify(Object.fromEntries(DRAFT_OPTIONS.map((k) => [k, x.explanations[k].trim()]))),
      x.learning_point.trim(), x.rural_note.trim(), x.learning_area, (area?.domains ?? ['4.1']).slice(0, 3), x.presentation.trim(), x.context, level,
      JSON.stringify(age ? { age: `${age[1]} ${age[2]}${age[1] === '1' ? '' : 's'}` } : {}),
      d.author_role, d.author_id,
      JSON.stringify(x.references.filter((r) => r.title.trim()).map((r) => ({ title: r.title.trim(), locator: r.locator.trim() }))),
      [reviewerName]],
  );
  return itemId;
}
