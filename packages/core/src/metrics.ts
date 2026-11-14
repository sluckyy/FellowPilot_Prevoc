/**
 * Trainee metrics from answer rows. Mirrors the SQL views so the app can show the same numbers
 * offline from locally cached answers. First attempts only, as in the Event Model.
 */
import { type Confidence, CONFIDENCE_P, CONFIDENCE_LABELS } from './scoring.js';
import type { OptionId } from './events.js';

export interface AnswerRow {
  item_id: string;
  learning_area: string;
  final_option: OptionId;
  first_option: OptionId;
  correct: boolean;
  first_correct: boolean;
  final_confidence: Confidence;
  first_confidence?: Confidence | null;
  n_changes: number;
  attempt_number: number;
  points: number;
  change_reason?: string | null;
  /** Outcome statement codes the item carries (item_version.domains), for the progress map. */
  domains?: string[];
}

const firsts = (rows: AnswerRow[]) => rows.filter((r) => r.attempt_number === 1);

export interface CalibrationBin { confidence: Confidence; label: string; expected: number; n: number; accuracy: number | null }

export function calibration(rows: AnswerRow[]): CalibrationBin[] {
  const rs = firsts(rows);
  return ([1, 2, 3, 4] as Confidence[]).map((c) => {
    const bin = rs.filter((r) => r.final_confidence === c);
    return {
      confidence: c, label: CONFIDENCE_LABELS[c], expected: CONFIDENCE_P[c], n: bin.length,
      accuracy: bin.length ? bin.filter((r) => r.correct).length / bin.length : null,
    };
  });
}

/** Brier score (lower is better) and bias (positive = overconfident), on first attempts. */
export function calibrationSummary(rows: AnswerRow[]): { n: number; brier: number | null; bias: number | null } {
  const rs = firsts(rows);
  if (!rs.length) return { n: 0, brier: null, bias: null };
  let b = 0, p = 0, acc = 0;
  for (const r of rs) {
    const pr = CONFIDENCE_P[r.final_confidence], c = r.correct ? 1 : 0;
    b += (pr - c) ** 2; p += pr; acc += c;
  }
  return { n: rs.length, brier: b / rs.length, bias: (p - acc) / rs.length };
}

export interface ChangeStats {
  answered: number; changed: number; wrongToRight: number; rightToWrong: number; wrongToWrong: number; netGain: number;
  byFirstConfidence: { low: { changed: number; netGain: number }; high: { changed: number; netGain: number } };
  byReason: Record<string, { changed: number; netGain: number }>;
}

export function changeStats(rows: AnswerRow[]): ChangeStats {
  const rs = firsts(rows);
  const ch = rs.filter((r) => r.n_changes > 0);
  const gain = (xs: AnswerRow[]) =>
    xs.filter((r) => !r.first_correct && r.correct).length - xs.filter((r) => r.first_correct && !r.correct).length;
  const low = ch.filter((r) => (r.first_confidence ?? r.final_confidence) <= 2);
  const high = ch.filter((r) => (r.first_confidence ?? r.final_confidence) >= 3);
  const byReason: ChangeStats['byReason'] = {};
  for (const r of ch) {
    const k = r.change_reason ?? 'not_given';
    byReason[k] ??= { changed: 0, netGain: 0 };
    byReason[k].changed++;
    byReason[k].netGain += (!r.first_correct && r.correct ? 1 : 0) - (r.first_correct && !r.correct ? 1 : 0);
  }
  return {
    answered: rs.length, changed: ch.length,
    wrongToRight: ch.filter((r) => !r.first_correct && r.correct).length,
    rightToWrong: ch.filter((r) => r.first_correct && !r.correct).length,
    wrongToWrong: ch.filter((r) => !r.first_correct && !r.correct).length,
    netGain: gain(ch),
    byFirstConfidence: { low: { changed: low.length, netGain: gain(low) }, high: { changed: high.length, netGain: gain(high) } },
    byReason,
  };
}

export interface Quadrants { secure: number; misconception: number; fragile: number; knownGap: number }

export function quadrants(rows: AnswerRow[]): Quadrants {
  const rs = firsts(rows);
  const hi = (r: AnswerRow) => r.final_confidence >= 3;
  return {
    secure: rs.filter((r) => hi(r) && r.correct).length,
    misconception: rs.filter((r) => hi(r) && !r.correct).length,
    fragile: rs.filter((r) => !hi(r) && r.correct).length,
    knownGap: rs.filter((r) => !hi(r) && !r.correct).length,
  };
}

export interface AreaStat { learning_area: string; n: number; accuracy: number; points: number; bias: number }

export function areaStats(rows: AnswerRow[]): AreaStat[] {
  const by = new Map<string, AnswerRow[]>();
  for (const r of firsts(rows)) by.set(r.learning_area, [...(by.get(r.learning_area) ?? []), r]);
  return [...by.entries()].map(([learning_area, xs]) => ({
    learning_area, n: xs.length,
    accuracy: xs.filter((r) => r.correct).length / xs.length,
    points: xs.reduce((s, r) => s + r.points, 0),
    bias: calibrationSummary(xs).bias ?? 0,
  })).sort((a, b) => a.accuracy - b.accuracy || b.n - a.n);
}

/** Total points across all attempts (repeats count, so revision is rewarded). */
export const totalPoints = (rows: AnswerRow[]) => rows.reduce((s, r) => s + r.points, 0);
