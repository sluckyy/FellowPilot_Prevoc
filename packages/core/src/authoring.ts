/**
 * Questions written by trainees and supervisors (Solution Spec, "Question writing"): the draft shape and
 * the same automatic checks AI-generated items pass (pipeline/gates.py), phrased as advice to the author.
 * Errors block submission; warnings are shown but the author may submit anyway.
 */
import { CONTEXTS, curriculumArea } from './curriculum.js';
import type { OptionId } from './events.js';

export const DRAFT_OPTIONS: OptionId[] = ['A', 'B', 'C', 'D'];

export interface DraftQuestion {
  learning_area: string;
  presentation: string;
  context: string;
  stem: string;
  lead_in: string;
  options: Record<OptionId, string>;
  key: OptionId | '';
  explanations: Record<OptionId, string>;
  learning_point: string;
  rural_note: string;
  references: { title: string; locator: string }[];
}

export const emptyDraft = (area = ''): DraftQuestion => ({
  learning_area: area, presentation: '', context: 'ward', stem: '', lead_in: 'What is the most appropriate next step?',
  options: { A: '', B: '', C: '', D: '' }, key: '', explanations: { A: '', B: '', C: '', D: '' },
  learning_point: '', rural_note: '', references: [{ title: '', locator: '' }],
});

export const DRAFT_LIMITS = { stemMin: 25, stemMax: 300, optionMax: 200, explanationMax: 600, textMax: 600, references: 4 };

export interface GateResult { field: string; level: 'error' | 'warning'; message: string }

const words = (s: string) => (s.trim().match(/\S+/g) ?? []).length;
const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Coerces untrusted input (a request body) into a draft, trimming and capping every field. */
export function toDraft(x: unknown): DraftQuestion {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const str = (v: unknown, max = DRAFT_LIMITS.textMax) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').slice(0, max) : '');
  const rec = (v: unknown, max: number) => {
    const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    return Object.fromEntries(DRAFT_OPTIONS.map((k) => [k, str(r[k], max)])) as Record<OptionId, string>;
  };
  const refs = Array.isArray(o.references) ? o.references.slice(0, DRAFT_LIMITS.references) : [];
  return {
    learning_area: str(o.learning_area, 80), presentation: str(o.presentation, 120), context: str(o.context, 20),
    stem: str(o.stem, 4000), lead_in: str(o.lead_in, 300),
    options: rec(o.options, DRAFT_LIMITS.optionMax), key: DRAFT_OPTIONS.includes(o.key as OptionId) ? (o.key as OptionId) : '',
    explanations: rec(o.explanations, DRAFT_LIMITS.explanationMax),
    learning_point: str(o.learning_point), rural_note: str(o.rural_note),
    references: refs.map((r) => { const x = (r ?? {}) as Record<string, unknown>; return { title: str(x.title, 200), locator: str(x.locator, 200) }; }),
  };
}

export function draftGates(d: DraftQuestion): GateResult[] {
  const out: GateResult[] = [];
  const err = (field: string, message: string) => out.push({ field, level: 'error', message });
  const warn = (field: string, message: string) => out.push({ field, level: 'warning', message });

  if (!curriculumArea(d.learning_area)) err('learning_area', 'Choose a learning area.');
  if (!d.presentation.trim()) err('presentation', 'Name the presentation, for example "chest pain".');
  if (!(CONTEXTS as readonly string[]).includes(d.context)) err('context', 'Choose where the case happens.');

  const sw = words(d.stem);
  if (sw < DRAFT_LIMITS.stemMin) err('stem', `Write a clinical vignette of at least ${DRAFT_LIMITS.stemMin} words (now ${sw}).`);
  else if (sw > DRAFT_LIMITS.stemMax) err('stem', `Keep the vignette under ${DRAFT_LIMITS.stemMax} words (now ${sw}).`);
  if (sw >= DRAFT_LIMITS.stemMin && !/\b\d+[- ](year|month|week|day)s?[- ]old\b/i.test(d.stem)) warn('stem', "Give the patient's age, for example \"a 54-year-old woman\".");

  if (!/\?\s*$/.test(d.lead_in)) err('lead_in', 'The lead-in should be a question ending in a question mark.');
  if (/\b(NOT|EXCEPT|LEAST)\b/.test(d.lead_in) || /\b(least likely|not appropriate|except)\b/i.test(d.lead_in)) {
    warn('lead_in', 'Ask for the best answer rather than the exception. Negative lead-ins test reading more than knowledge.');
  }

  const opts = DRAFT_OPTIONS.map((k) => d.options[k].trim());
  DRAFT_OPTIONS.forEach((k, i) => { if (!opts[i]) err(`options.${k}`, `Option ${k} is empty.`); });
  const seen = new Set<string>();
  DRAFT_OPTIONS.forEach((k, i) => {
    const n = norm(opts[i]);
    if (n && seen.has(n)) err(`options.${k}`, `Option ${k} repeats another option.`);
    seen.add(n);
    if (/\b(all|none|both) of the (above|options)\b|\bboth [a-d] and [a-d]\b/i.test(opts[i])) {
      err(`options.${k}`, 'Avoid "all of the above", "none of the above" and combinations: options are shuffled for each trainee.');
    }
  });
  if (!d.key) err('key', 'Mark which option is the best answer.');

  DRAFT_OPTIONS.forEach((k) => {
    const e = d.explanations[k].trim();
    if (words(e) < 5) err(`explanations.${k}`, `Explain why option ${k} is ${d.key === k ? 'the best answer' : 'not the best answer'} (at least a sentence).`);
    if (/\b(option|answer|choice)\s*\(?[A-D]\)?\b|\([A-D]\)/.test(e)) {
      err(`explanations.${k}`, 'Don\'t refer to options by letter: trainees see them in a different order. Name the option instead.');
    }
  });

  if (!d.learning_point.trim()) err('learning_point', 'Add the one thing a trainee should remember from this question.');
  if (!d.rural_note.trim()) warn('rural_note', 'Add a setting note if the answer would differ in a regional hospital (no ICU or CT overnight, retrieval, one doctor on site).');
  if (!d.references.some((r) => r.title.trim())) warn('references', 'Add at least one reference, for example "Therapeutic Guidelines: Antibiotic".');

  // Cueing: the right answer stands out by length, or wrong answers use absolutes.
  if (d.key && opts.every(Boolean)) {
    const keyLen = d.options[d.key].trim().length;
    const others = DRAFT_OPTIONS.filter((k) => k !== d.key).map((k) => d.options[k].trim().length);
    const mean = others.reduce((s, n) => s + n, 0) / others.length;
    if (keyLen > 1.6 * mean && keyLen - mean > 25) warn(`options.${d.key}`, 'The best answer is much longer than the others, which can give it away. Make the options similar in length.');
    DRAFT_OPTIONS.filter((k) => k !== d.key).forEach((k) => {
      if (/\b(always|never|only|all|none)\b/i.test(d.options[k])) warn(`options.${k}`, `Option ${k} uses an absolute word (always, never, only). Test-wise trainees rule these out without knowing the content.`);
    });
  }
  return out;
}

export const canSubmit = (d: DraftQuestion) => !draftGates(d).some((g) => g.level === 'error');

/** The draft as plain text, for the AI coach and for reviewers' notes. */
export function draftAsText(d: DraftQuestion): string {
  return [
    `Learning area: ${d.learning_area || '(none)'}; presentation: ${d.presentation || '(none)'}; setting: ${d.context}`,
    '', d.stem, '', d.lead_in, '',
    ...DRAFT_OPTIONS.map((k) => `${k}. ${d.options[k]}${d.key === k ? '   [marked as best answer]' : ''}\n   Explanation: ${d.explanations[k]}`),
    '', `Key point: ${d.learning_point}`, `Setting note: ${d.rural_note || '(none)'}`,
    `References: ${d.references.filter((r) => r.title).map((r) => [r.title, r.locator].filter(Boolean).join(', ')).join('; ') || '(none)'}`,
  ].join('\n');
}
