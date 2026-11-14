import 'server-only';
import { q, one } from './db';
import type { AnswerRow, Confidence, GuideRow, OptionId, SelectableItem, History } from './core';

/** First-attempt and repeat answers with their learning area and any change reason, oldest first. */
export async function answerRows(userId: string): Promise<AnswerRow[]> {
  return q<AnswerRow>(
    `SELECT a.item_id, v.learning_area, v.domains, a.final_option, a.first_option, a.correct, a.first_correct,
            a.final_confidence, a.first_confidence, a.n_changes, a.attempt_number, a.points,
            r.reason AS change_reason
       FROM answer a
       JOIN item_version v ON v.item_id = a.item_id AND v.version = a.item_version
       LEFT JOIN LATERAL (
         SELECT e.payload->>'reason' AS reason FROM event e
          WHERE e.user_id = a.user_id AND e.event_type = 'change_reason_given'
            AND e.payload->>'item_id' = a.item_id::text
            AND e.client_ts BETWEEN a.client_ts AND a.client_ts + interval '30 minutes'
          ORDER BY e.client_ts LIMIT 1) r ON a.n_changes > 0
      WHERE a.user_id = $1
      ORDER BY a.client_ts`,
    [userId],
  );
}

export interface WeekSummary { answered: number; points: number }

export async function thisWeek(userId: string): Promise<WeekSummary> {
  const r = await one<{ answered: string; points: string | null }>(
    `SELECT count(*) AS answered, sum(points) AS points FROM answer
      WHERE user_id = $1 AND client_ts >= date_trunc('week', now() AT TIME ZONE 'Australia/Adelaide') AT TIME ZONE 'Australia/Adelaide'`,
    [userId],
  );
  return { answered: Number(r?.answered ?? 0), points: Number(r?.points ?? 0) };
}

export async function totals(userId: string): Promise<{ answered: number; points: number }> {
  const r = await one<{ answered: string; points: string | null }>(
    'SELECT count(*) AS answered, sum(points) AS points FROM answer WHERE user_id = $1', [userId]);
  return { answered: Number(r?.answered ?? 0), points: Number(r?.points ?? 0) };
}

/**
 * Questions a trainee in this tenant may be served. Retired and draft items are never served, and
 * nobody is served a question they wrote themselves.
 */
export async function selectablePool(tenantId: string, userId: string): Promise<SelectableItem[]> {
  return q<SelectableItem>(
    `SELECT id AS item_id, learning_area, template_id::text AS template_id, calibration_core,
            (status = 'pretest' AND NOT calibration_core) AS is_pretest
       FROM item_current
      WHERE status IN ('pretest', 'live') AND (tenant_id IS NULL OR tenant_id = $1)
        AND author_id IS DISTINCT FROM $2`,
    [tenantId, userId],
  );
}

/** Every answer with the question's presentation, key point and references, for the study guide. */
export async function guideRows(userId: string): Promise<GuideRow[]> {
  return q<GuideRow>(
    `SELECT a.item_id, v.learning_area, a.final_option, a.first_option, a.correct, a.first_correct,
            a.final_confidence, a.first_confidence, a.n_changes, a.attempt_number, a.points,
            v.presentation, v.learning_point, v."references" AS references
       FROM answer a JOIN item_version v ON v.item_id = a.item_id AND v.version = a.item_version
      WHERE a.user_id = $1
      ORDER BY a.client_ts`,
    [userId],
  );
}

export async function selectionHistory(userId: string): Promise<History[]> {
  const rows = await q<{ item_id: string; learning_area: string; template_id: string | null; correct: boolean; final_confidence: number; answered_at: Date }>(
    `SELECT a.item_id, v.learning_area, i.template_id::text AS template_id, a.correct, a.final_confidence, a.client_ts AS answered_at
       FROM answer a JOIN item i ON i.id = a.item_id
       JOIN item_version v ON v.item_id = a.item_id AND v.version = a.item_version
      WHERE a.user_id = $1`,
    [userId],
  );
  return rows.map((r) => ({ ...r, answered_at: new Date(r.answered_at).getTime() }));
}

export interface ServedItem {
  item_id: string; version: number; stem: string; lead_in: string;
  options: { id: OptionId; text: string }[]; learning_area: string; presentation: string; context: string;
  setting: string; pgy_level: string; review_level: string;
  attempt_number: number; is_pretest: boolean;
}

/** Question content without the key or explanations: those come only after an answer is recorded. */
export async function servedItems(userId: string, picks: SelectableItem[]): Promise<ServedItem[]> {
  if (!picks.length) return [];
  const rows = await q<Omit<ServedItem, 'attempt_number' | 'is_pretest'> & { previous: string }>(
    `SELECT c.item_id, c.version, c.stem, c.lead_in, c.options, c.learning_area, c.presentation, c.context,
            c.setting, c.pgy_level, c.review_level,
            (SELECT count(*) FROM answer a WHERE a.user_id = $1 AND a.item_id = c.item_id) AS previous
       FROM item_current c WHERE c.item_id = ANY($2::uuid[])`,
    [userId, picks.map((p) => p.item_id)],
  );
  const byId = new Map(rows.map((r) => [r.item_id, r]));
  return picks.flatMap((p) => {
    const r = byId.get(p.item_id);
    if (!r) return [];
    const { previous, ...rest } = r;
    return [{ ...rest, attempt_number: Number(previous) + 1, is_pretest: p.is_pretest }];
  });
}

export interface Feedback {
  item_id: string; item_version: number; key: OptionId; correct: boolean; final_option: OptionId;
  final_confidence: Confidence; points: number; explanations: Record<OptionId, string>;
  learning_point: string; rural_note: string; references: { title?: string; locator?: string }[];
}

/** The key and explanations, only once this user has an answer recorded for this version. */
export async function feedbackFor(userId: string, itemId: string, version: number): Promise<Feedback | null> {
  return one<Feedback>(
    `SELECT v.item_id, v.version AS item_version, v.key, a.correct, a.final_option, a.final_confidence, a.points,
            v.explanations, v.learning_point, v.rural_note, v."references" AS references
       FROM item_version v
       JOIN LATERAL (SELECT * FROM answer a WHERE a.user_id = $1 AND a.item_id = v.item_id AND a.item_version = v.version
                     ORDER BY a.client_ts DESC LIMIT 1) a ON true
      WHERE v.item_id = $2 AND v.version = $3`,
    [userId, itemId, version],
  );
}

export async function learningAreas(tenantId: string): Promise<{ learning_area: string; n: number }[]> {
  const rows = await q<{ learning_area: string; n: string }>(
    `SELECT learning_area, count(*) AS n FROM item_current
      WHERE status IN ('pretest','live') AND (tenant_id IS NULL OR tenant_id = $1)
      GROUP BY learning_area ORDER BY learning_area`, [tenantId]);
  return rows.map((r) => ({ learning_area: r.learning_area, n: Number(r.n) }));
}
