/**
 * Decide which reviewed items trainees may see, and build their item versions.
 *
 * Input: the round's review documents (what reviewers saw) and the Review Desk's reviews
 * (CSV export or JSON). Rules, from the Generation Spec:
 *  - Any reviewer judging the key wrong, or a major accuracy issue, excludes the item.
 *  - Any reject excludes the item.
 *  - Otherwise, with at least one review, the item is accepted. Reviewer edits are applied.
 *  - If two reviewers edited the same field differently, the item waits for an editor.
 */
import type { OptionId } from './events.js';

export interface ReviewDoc {
  item_id: string; work_order_id: string; version: number;
  stem: string; lead_in: string; options: { id: OptionId; text: string }[]; key: OptionId;
  explanations: Record<OptionId, string>; learning_point: string; rural_note?: string; setting_note?: string;
  pgy_level?: string; clinical_experiences?: string[]; setting?: string;
  learning_area: string; secondary_areas?: string[]; domains: string[]; presentation: string;
  context: string; cognitive_level: string; patient: Record<string, unknown>; target_difficulty: number;
  references?: unknown[]; tutor_context?: string; jurisdiction?: string; plan?: string;
  generation?: Record<string, unknown>; uncertainty?: string; calibration_core?: boolean;
  critic?: { overall?: string; blind_answer?: string; notes_for_reviewer?: string };
  blind_disagreement?: boolean; review_flags?: string[];
}

export interface Edits {
  stem?: string; lead_in?: string; learning_point?: string;
  options?: Partial<Record<OptionId, string>>; explanations?: Partial<Record<OptionId, string>>;
}

export interface Review {
  item_id: string; item_version: number; reviewer_id: string; reviewer_name?: string; reviewer_email?: string;
  key_correct: 'yes' | 'no' | 'unsure'; accuracy: 'yes' | 'minor' | 'major';
  rural_realism?: number; distractors_plausible?: number; difficulty_view?: string;
  decision: 'accept' | 'accept_with_edits' | 'reject'; reject_reason?: string;
  edits?: Edits; comment?: string; active_seconds?: number; submitted_at?: string;
}

export type Outcome =
  | { item_id: string; work_order_id: string; status: 'accepted'; version: ItemVersionRow; reviewers: string[] }
  | { item_id: string; work_order_id: string; status: 'excluded' | 'needs_editor' | 'unreviewed'; reason: string; reviewers: string[] };

export interface ItemVersionRow {
  item_id: string; version: number; stem: string; lead_in: string;
  options: { id: OptionId; text: string }[]; key: OptionId; explanations: Record<OptionId, string>;
  learning_point: string; rural_note: string; learning_area: string; secondary_areas: string[]; domains: string[];
  presentation: string; context: string; cognitive_level: string; patient: Record<string, unknown>;
  target_difficulty: number; jurisdiction: string; provenance: 'ai' | 'ai_edited_by_human';
  generation: Record<string, unknown> | null; references: unknown[]; tutor_context: string;
  review_level: 'expert'; reviewed_by: string[]; review_by: string; calibration_core: boolean;
  pgy_level: string; clinical_experiences: string[]; setting: string;
}

const PGY = new Set(['PGY1', 'PGY2', 'both']);
const SETTING = new Set(['rural', 'metro', 'any']);
/** Prevocational tags with safe defaults, so an ACRRM-shaped doc still loads. */
function tags(d: ReviewDoc) {
  return {
    pgy_level: PGY.has(d.pgy_level ?? '') ? d.pgy_level! : 'both',
    clinical_experiences: (d.clinical_experiences ?? []).filter((x) => ['A', 'B', 'C', 'D'].includes(x)),
    setting: SETTING.has(d.setting ?? '') ? d.setting! : 'any',
    rural_note: d.setting_note ?? d.rural_note ?? '',
  };
}

const LETTERS: OptionId[] = ['A', 'B', 'C', 'D'];

export function decide(docs: ReviewDoc[], reviews: Review[], today = new Date()): Outcome[] {
  const byItem = new Map<string, Review[]>();
  for (const r of reviews) byItem.set(r.item_id, [...(byItem.get(r.item_id) ?? []), r]);
  return docs.map((d) => {
    const rs = (byItem.get(d.item_id) ?? []).filter((r) => (r.item_version ?? 1) === d.version);
    const names = rs.map((r) => r.reviewer_name || r.reviewer_id);
    const base = { item_id: d.item_id, work_order_id: d.work_order_id, reviewers: names };
    if (!rs.length) return { ...base, status: 'unreviewed', reason: 'No reviews yet' } as Outcome;
    const bad = rs.find((r) => r.key_correct === 'no' || r.accuracy === 'major');
    if (bad) return { ...base, status: 'excluded', reason: bad.key_correct === 'no' ? 'Key judged wrong' : 'Major accuracy issue' } as Outcome;
    const rej = rs.find((r) => r.decision === 'reject');
    if (rej) return { ...base, status: 'excluded', reason: `Rejected: ${rej.reject_reason || 'no reason given'}` } as Outcome;
    const merged = mergeEdits(rs.map((r) => r.edits ?? {}));
    if ('conflict' in merged) return { ...base, status: 'needs_editor', reason: `Reviewers edited ${merged.conflict} differently` } as Outcome;
    const e = merged.edits;
    const edited = Object.keys(e).length > 0;
    const reviewBy = new Date(today); reviewBy.setUTCFullYear(reviewBy.getUTCFullYear() + 2);
    const version: ItemVersionRow = {
      item_id: d.item_id, version: edited ? d.version + 1 : d.version,
      stem: e.stem ?? d.stem, lead_in: e.lead_in ?? d.lead_in,
      options: LETTERS.map((L) => ({ id: L, text: e.options?.[L] ?? d.options.find((o) => o.id === L)!.text })),
      key: d.key,
      explanations: Object.fromEntries(LETTERS.map((L) => [L, e.explanations?.[L] ?? d.explanations[L]])) as Record<OptionId, string>,
      learning_point: e.learning_point ?? d.learning_point, ...tags(d),
      learning_area: d.learning_area, secondary_areas: d.secondary_areas ?? [], domains: d.domains,
      presentation: d.presentation, context: d.context, cognitive_level: d.cognitive_level, patient: d.patient,
      target_difficulty: d.target_difficulty, jurisdiction: d.jurisdiction ?? 'national',
      provenance: edited ? 'ai_edited_by_human' : 'ai', generation: d.generation ?? null,
      references: d.references ?? [], tutor_context: d.tutor_context ?? '',
      review_level: 'expert', reviewed_by: names, review_by: reviewBy.toISOString().slice(0, 10),
      calibration_core: d.calibration_core ?? true,
    };
    return { ...base, status: 'accepted', version } as Outcome;
  });
}

function mergeEdits(all: Edits[]): { edits: Edits } | { conflict: string } {
  const out: Edits = {};
  for (const e of all) {
    for (const f of ['stem', 'lead_in', 'learning_point'] as const) {
      const v = e[f];
      if (v === undefined) continue;
      if (out[f] !== undefined && out[f] !== v) return { conflict: f.replace('_', ' ') };
      out[f] = v;
    }
    for (const g of ['options', 'explanations'] as const) {
      for (const [L, v] of Object.entries(e[g] ?? {})) {
        const cur = out[g]?.[L as OptionId];
        if (cur !== undefined && cur !== v) return { conflict: `${g === 'options' ? 'option' : 'explanation'} ${L}` };
        out[g] = { ...(out[g] ?? {}), [L]: v };
      }
    }
  }
  return { edits: out };
}

// ------------------------------------------------------------ Review Desk CSV export

/** RFC 4180 CSV parser (quotes, doubled quotes, CRLF, newlines in fields). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', i = 0, q = false;
  while (i < text.length) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (ch === '"') { q = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { q = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.length > 1 || r[0] !== '');
  return body.map((r) => Object.fromEntries(head.map((h, j) => [h, r[j] ?? ''])));
}

export function reviewsFromCsv(text: string): Review[] {
  return parseCsv(text).map((r) => ({
    item_id: r.item_id, item_version: Number(r.item_version || 1), reviewer_id: r.reviewer_id,
    reviewer_name: r.reviewer_name, reviewer_email: r.reviewer_email,
    key_correct: r.key_correct as Review['key_correct'], accuracy: r.accuracy as Review['accuracy'],
    rural_realism: r.rural_realism ? Number(r.rural_realism) : undefined,
    distractors_plausible: r.distractors_plausible ? Number(r.distractors_plausible) : undefined,
    difficulty_view: r.difficulty_view, decision: r.decision as Review['decision'], reject_reason: r.reject_reason,
    edits: r.edits ? JSON.parse(r.edits) : {}, comment: r.comment,
    active_seconds: r.active_seconds ? Number(r.active_seconds) : undefined, submitted_at: r.submitted_at,
  }));
}

// ------------------------------------------------------------ SQL output (run with psql)

const lit = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${String(v).replace(/'/g, "''")}'`;
};
const jsonLit = (v: unknown) => `${lit(JSON.stringify(v))}::jsonb`;
const arrLit = (xs: string[]) => `ARRAY[${xs.map(lit).join(',')}]::text[]`;

/**
 * Idempotent SQL: items already imported at that version are left alone, so the script can be
 * re-run as reviews come in. Original (unedited) AI versions are kept as version 1 when edited.
 * A question already live as an unreviewed beta version gets its reviewed version added on top
 * (versions are immutable), and the item moves to it.
 */
export function toSql(outcomes: Outcome[], docs: ReviewDoc[]): string {
  const doc = new Map(docs.map((d) => [d.item_id, d]));
  const lines = ['BEGIN;'];
  for (const o of outcomes) {
    if (o.status !== 'accepted') continue;
    const v = o.version, d = doc.get(o.item_id)!;
    lines.push(`INSERT INTO item (id, status, calibration_core, current_version) VALUES (${lit(v.item_id)}, 'pretest', ${lit(v.calibration_core)}, ${v.version})
  ON CONFLICT (id) DO UPDATE SET current_version = GREATEST(item.current_version, EXCLUDED.current_version), updated_at = now();`);
    if (v.version > d.version) lines.push(versionInsert({ ...v, ...originalOf(d), version: d.version, provenance: 'ai', reviewed_by: [] }));
    lines.push(reviewedInsert(v, v.version > d.version ? d.version : null));
    lines.push(`UPDATE item SET current_version = (SELECT max(version) FROM item_version WHERE item_id = ${lit(v.item_id)}), updated_at = now() WHERE id = ${lit(v.item_id)};`);
  }
  lines.push('COMMIT;');
  return lines.join('\n') + '\n';
}

/**
 * The reviewed version goes in at its own number, unless that number is already taken by an
 * unreviewed (beta) version, in which case it goes on top. Skipped if a reviewed version exists.
 */
function reviewedInsert(v: ItemVersionRow, supersedes: number | null): string {
  const id = lit(v.item_id);
  const num = `CASE WHEN EXISTS (SELECT 1 FROM item_version WHERE item_id = ${id} AND version = ${v.version} AND review_level = 'none')
      THEN (SELECT max(version) + 1 FROM item_version WHERE item_id = ${id}) ELSE ${v.version} END`;
  const sup = supersedes ?? `(SELECT max(version) FROM item_version WHERE item_id = ${id} AND review_level = 'none')`;
  return versionRow(v, num, sup, `WHERE NOT EXISTS (SELECT 1 FROM item_version WHERE item_id = ${id} AND review_level = 'expert')`);
}

function originalOf(d: ReviewDoc) {
  return { stem: d.stem, lead_in: d.lead_in, options: d.options, explanations: d.explanations, learning_point: d.learning_point };
}

function versionInsert(v: ItemVersionRow, supersedes: number | null = null): string {
  return versionRow(v, String(v.version), supersedes === null ? 'NULL' : String(supersedes), '') + '\nON CONFLICT (item_id, version) DO NOTHING;';
}

function versionRow(v: ItemVersionRow, version: string, supersedes: string | number, where: string): string {
  const sql = `INSERT INTO item_version (item_id, version, stem, lead_in, options, key, explanations, learning_point, rural_note,
  learning_area, secondary_areas, domains, presentation, context, cognitive_level, patient, target_difficulty,
  jurisdiction, provenance, generation, "references", tutor_context, review_level, reviewed_by, review_by, supersedes,
  pgy_level, clinical_experiences, setting)
SELECT ${lit(v.item_id)}, ${version}, ${lit(v.stem)}, ${lit(v.lead_in)}, ${jsonLit(v.options)}, ${lit(v.key)}, ${jsonLit(v.explanations)},
  ${lit(v.learning_point)}, ${lit(v.rural_note)}, ${lit(v.learning_area)}, ${arrLit(v.secondary_areas)}, ${arrLit(v.domains)},
  ${lit(v.presentation)}, ${lit(v.context)}, ${lit(v.cognitive_level)}, ${jsonLit(v.patient)}, ${v.target_difficulty},
  ${lit(v.jurisdiction)}, ${lit(v.provenance)}, ${v.generation ? jsonLit(v.generation) : 'NULL'}, ${jsonLit(v.references)},
  ${lit(v.tutor_context)}, ${v.reviewed_by.length ? "'expert'" : "'none'"}, ${arrLit(v.reviewed_by)}, ${v.reviewed_by.length ? lit(v.review_by) : 'NULL'}, ${supersedes},
  ${lit(v.pgy_level)}, ${arrLit(v.clinical_experiences)}, ${lit(v.setting)}
  ${where}`;
  return where ? sql + ';' : sql;
}

// ------------------------------------------------------------ beta release (before clinical review)

/** Why the automated checks hold a question back from an unreviewed beta release, or null. */
export function automatedHold(d: ReviewDoc): string | null {
  if (d.blind_disagreement) return 'Independent AI solver disagreed with the key';
  if (d.review_flags?.length) return `Automated check: ${d.review_flags[0].slice(0, 160)}`;
  // A critic "concern" is usually wording (cueing, clarity, a weak distractor): the gates carry the substantive
  // ones (accuracy, scope, cultural safety, a second defensible answer) in review_flags or as hard failures.
  if (d.critic && d.critic.overall === 'fail') return `AI critic failed it${d.critic.notes_for_reviewer ? `: ${d.critic.notes_for_reviewer.slice(0, 160)}` : ''}`;
  if (d.uncertainty === 'major') return 'Major uncertainty in current guidance';
  return null;
}

export type BetaOutcome =
  | { item_id: string; work_order_id: string; status: 'beta'; version: ItemVersionRow }
  | { item_id: string; work_order_id: string; status: 'held'; reason: string };

/**
 * Questions that passed every automated check, released unreviewed so trainees can use them while
 * clinical review catches up. They go live as review_level 'none'; trainee flags take them out.
 */
export function betaRelease(docs: ReviewDoc[]): BetaOutcome[] {
  return docs.map((d) => {
    const reason = automatedHold(d);
    if (reason) return { item_id: d.item_id, work_order_id: d.work_order_id, status: 'held', reason };
    const version: ItemVersionRow = {
      item_id: d.item_id, version: d.version, stem: d.stem, lead_in: d.lead_in, options: d.options, key: d.key,
      explanations: d.explanations, learning_point: d.learning_point, ...tags(d),
      learning_area: d.learning_area, secondary_areas: d.secondary_areas ?? [], domains: d.domains,
      presentation: d.presentation, context: d.context, cognitive_level: d.cognitive_level, patient: d.patient,
      target_difficulty: d.target_difficulty, jurisdiction: d.jurisdiction ?? 'national', provenance: 'ai',
      generation: d.generation ?? null, references: d.references ?? [], tutor_context: d.tutor_context ?? '',
      review_level: 'expert', reviewed_by: [], review_by: '', calibration_core: d.calibration_core ?? true,
    };
    return { item_id: d.item_id, work_order_id: d.work_order_id, status: 'beta', version };
  });
}

/** Idempotent: an item that already exists (reviewed, flagged, retired) is never touched. */
export function betaSql(outcomes: BetaOutcome[]): string {
  const lines = ['BEGIN;'];
  for (const o of outcomes) {
    if (o.status !== 'beta') continue;
    const v = o.version;
    lines.push(`INSERT INTO item (id, status, calibration_core, current_version) VALUES (${lit(v.item_id)}, 'live', ${lit(v.calibration_core)}, ${v.version})
  ON CONFLICT (id) DO NOTHING;`);
    lines.push(versionInsert(v));
  }
  lines.push('COMMIT;');
  return lines.join('\n') + '\n';
}

export function summary(outcomes: Outcome[]): Record<string, number> {
  const s: Record<string, number> = {};
  for (const o of outcomes) s[o.status] = (s[o.status] ?? 0) + 1;
  return s;
}
