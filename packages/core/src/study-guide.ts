/**
 * The personal study guide (Solution Spec, "Study guide"): misconceptions first, then weakest areas,
 * then fragile knowledge, with readings drawn from each question's references (pointers, never copied
 * text). Everything is computed from the trainee's own answers; nothing is invented.
 */
import type { AnswerRow } from './metrics.js';
import { areaStats, calibrationSummary, changeStats } from './metrics.js';
import { MIN_FOR_CALIBRATION, MIN_CHANGES } from './insights.js';
import { CURRICULUM } from './curriculum.js';

export interface GuideRow extends AnswerRow {
  presentation: string;
  learning_point: string;
  references: { title?: string; locator?: string }[];
}

export interface Reading { title: string; locator: string; count: number }
export interface GuideItem { item_id: string; presentation: string; learning_point: string }
export interface GuideArea { learning_area: string; n: number; accuracy: number; items: GuideItem[]; readings: Reading[] }
export interface StudyGuide {
  answered: number;
  misconceptions: GuideArea[];   // wrong while sure, not yet put right
  weakest: GuideArea[];          // lowest accuracy areas with enough answers
  fragile: GuideArea[];          // right but unsure
  habits: string[];
  notStarted: { area: string; share: number }[];
}

export const GUIDE_MIN_AREA = 3;
const firsts = <T extends AnswerRow>(rows: T[]) => rows.filter((r) => r.attempt_number === 1);

function readings(rows: GuideRow[], limit = 4): Reading[] {
  const by = new Map<string, Reading>();
  for (const r of rows) for (const ref of r.references ?? []) {
    const title = (ref.title ?? '').trim();
    if (!title) continue;
    const locator = (ref.locator ?? '').trim();
    const k = `${title.toLowerCase()}|${locator.toLowerCase()}`;
    const x = by.get(k) ?? { title, locator, count: 0 };
    x.count++; by.set(k, x);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)).slice(0, limit);
}

function group(rows: GuideRow[], all: GuideRow[]): GuideArea[] {
  const by = new Map<string, GuideRow[]>();
  for (const r of rows) by.set(r.learning_area, [...(by.get(r.learning_area) ?? []), r]);
  return [...by.entries()].map(([area, xs]) => {
    const inArea = firsts(all).filter((r) => r.learning_area === area);
    return {
      learning_area: area, n: inArea.length,
      accuracy: inArea.filter((r) => r.correct).length / Math.max(1, inArea.length),
      items: xs.map((r) => ({ item_id: r.item_id, presentation: r.presentation, learning_point: r.learning_point })),
      readings: readings(xs),
    };
  }).sort((a, b) => b.items.length - a.items.length || a.accuracy - b.accuracy);
}

/** `available`: learning areas that have questions to practise; others are left out of "not started". */
export function studyGuide(rows: GuideRow[], available?: Set<string>): StudyGuide {
  const fs = firsts(rows);
  // A confident error stays on the list until a later attempt at the same question is right.
  const latest = new Map<string, GuideRow>();
  for (const r of rows) latest.set(r.item_id, r);
  const open = fs.filter((r) => !r.correct && r.final_confidence >= 3 && !latest.get(r.item_id)?.correct);
  const misconceptions = group(open, rows);

  const weakAreas = areaStats(rows).filter((a) => a.n >= GUIDE_MIN_AREA && a.accuracy < 0.7).slice(0, 3);
  const weakest = weakAreas.map((a) => {
    const wrong = fs.filter((r) => r.learning_area === a.learning_area && !r.correct);
    const all = fs.filter((r) => r.learning_area === a.learning_area);
    return {
      learning_area: a.learning_area, n: a.n, accuracy: a.accuracy,
      items: wrong.slice(-5).map((r) => ({ item_id: r.item_id, presentation: r.presentation, learning_point: r.learning_point })),
      readings: readings(wrong.length ? wrong : all),
    };
  });

  const fragile = group(fs.filter((r) => r.correct && r.final_confidence <= 2), rows).slice(0, 4);

  const habits: string[] = [];
  const cal = calibrationSummary(rows);
  if (cal.n >= MIN_FOR_CALIBRATION && cal.bias !== null) {
    if (cal.bias > 0.08) habits.push('You tend to be surer than your results. Before rating "fairly sure" or "certain", ask what finding in the stem rules out the next-best option.');
    else if (cal.bias < -0.08) habits.push('You tend to undersell yourself. When your reasoning holds up, rate it higher: honest confidence earns more points over time.');
    else habits.push('Your confidence matches your accuracy well. Keep rating honestly.');
  }
  const ch = changeStats(rows);
  if (ch.changed >= MIN_CHANGES) {
    if (ch.netGain > 0) habits.push(`Changing your answer has helped you on balance (${ch.wrongToRight} wrong to right, ${ch.rightToWrong} right to wrong). Trust a change when you can name the reason for it.`);
    else if (ch.netGain < 0) habits.push(`Changing your answer has cost you on balance (${ch.rightToWrong} right to wrong, ${ch.wrongToRight} wrong to right). Unless you spot something you missed, stay with your first answer.`);
  }

  const covered = new Set(fs.map((r) => r.learning_area));
  const notStarted = CURRICULUM.filter((c) => !covered.has(c.area) && (!available || available.has(c.area))).slice(0, 5).map((c) => ({ area: c.area, share: c.share }));

  return { answered: fs.length, misconceptions, weakest, fragile, habits, notStarted };
}
