/**
 * Reflective logbook helpers (Technical Specification, "Reflective logbook"). The beta is text only
 * and uses no AI: light prompts guide the entry, and suggested outcome-statement tags come from a
 * plain keyword match that the trainee confirms or changes. Reflection text is never scored.
 */
import { OUTCOME_CODES } from './curriculum.js';

export const REFLECTION_PROMPTS = [
  { id: 'went-well', text: 'Something that went well today, and why it worked' },
  { id: 'tricky', text: 'A moment that was tricky, and what you would do differently' },
  { id: 'learned', text: 'Something you learned from a patient, a colleague or a mistake' },
  { id: 'escalation', text: 'A time you escalated, handed over or asked for help' },
  { id: 'feedback', text: 'Feedback you received and what you will do with it' },
  { id: 'culture', text: 'A moment where culture, language or family shaped the care' },
] as const;
export type ReflectionPromptId = (typeof REFLECTION_PROMPTS)[number]['id'];
export const isPromptId = (x: unknown): x is ReflectionPromptId => REFLECTION_PROMPTS.some((p) => p.id === x);

export const REFLECTION_LIMITS = { min: 20, max: 4000 } as const;

/** Keyword cues for each outcome statement; a cue is a lower-case substring or a word stem. */
const CUES: [string, string[]][] = [
  ['1.1', ['handover', 'isbar', 'escalat', 'infection control', 'hand hygiene', 'incident', 'adverse event', 'graded assertiveness', 'speak up', 'delegat']],
  ['1.2', ['consent', 'explain', 'shared decision', 'family meeting', 'communicat', 'listen', 'interpreter', 'bad news']],
  ['1.3', ['aboriginal', 'torres strait', 'cultural', 'liaison officer', 'elder', 'kinship', 'country']],
  ['1.4', ['history', 'examin', 'differential', 'assessment', 'documented', 'clerk', 'admission note']],
  ['1.5', ['ecg', 'blood gas', 'abg', 'x-ray', 'xray', 'ct ', 'imaging', 'pathology', 'result', 'troponin', 'investigation', 'bloods']],
  ['1.6', ['cannula', 'catheter', 'venepuncture', 'procedure', 'suture', 'nasogastric', 'arterial', 'lumbar puncture', 'plaster']],
  ['1.7', ['management plan', 'referral', 'referred', 'discharge', 'treatment decision', 'plan']],
  ['1.8', ['prescri', 'medication', 'dose', 'antibiotic', 'fluids', 'electrolyte', 'insulin', 'anticoagul', 'opioid', 'chart']],
  ['1.9', ['deteriorat', 'met call', 'rapid response', 'sepsis', 'hypotens', 'unwell', 'arrest', 'resus', 'crit']],
  ['1.10', ['emr', 'electronic', 'system', 'documentation', 'sunrise', 'order set', 'alert', 'decision support']],
  ['2.1', ['honest', 'confidential', 'privacy', 'integrity', 'ethic', 'respect', 'compassion', 'boundar']],
  ['2.2', ['tired', 'fatigue', 'overwhelmed', 'wellbeing', 'stress', 'sleep', 'my own limit', 'out of my depth', 'burnout', 'self-care']],
  ['2.3', ['feedback', 'teaching', 'taught', 'learned', 'learnt', 'tutorial', 'supervis', 'study']],
  ['2.4', ['responsib', 'limit of', 'scope', 'asked the registrar', 'called the consultant', 'senior']],
  ['2.5', ['nurse', 'pharmacist', 'physio', 'allied health', 'team', 'social worker', 'ward clerk', 'colleague']],
  ['2.6', ['bully', 'harass', 'discriminat', 'unsafe', 'speak up', 'respectful workplace']],
  ['2.7', ['cultural safety', 'culturally safe', 'bias', 'learning plan', 'aboriginal']],
  ['2.8', ['prioritis', 'workload', 'busy', 'time management', 'on time', 'late', 'list', 'jobs']],
  ['3.1', ['screening', 'prevention', 'vaccin', 'immunis', 'smoking', 'alcohol', 'lifestyle', 'health promotion']],
  ['3.2', ['social', 'housing', 'transport', 'carer', 'finances', 'whole person', 'rural', 'distance', 'spiritual', 'emotional']],
  ['3.3', ['cultural', 'racism', 'reflect', 'power', 'bias']],
  ['3.4', ['racism', 'bias', 'inequit', 'systemic']],
  ['3.5', ['colonis', 'intergenerational', 'trauma', 'stolen generation']],
  ['3.6', ['family', 'carer', 'partner', 'liaison', 'aboriginal health', 'community', 'gp ', 'general practitioner']],
  ['4.1', ['diagnos', 'pathophysiology', 'natural history', 'prognosis', 'presentation', 'condition', 'read up']],
  ['4.2', ['evidence', 'guideline', 'etg', 'paper', 'study', 'trial', 'literature']],
  ['4.3', ['audit', 'quality', 'incident report', 'm&m', 'morbidity', 'reflect', 'peer review', 'improve']],
  ['4.4', ['model of care', 'aboriginal', 'community controlled', 'closing the gap']],
];

/** Outcome statements a reflection seems to touch, strongest first, at most `limit`. Keyword match only. */
export function suggestTags(text: string, limit = 4): string[] {
  const t = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  const scored = CUES.map(([code, cues]) => ({ code, score: cues.reduce((s, c) => s + (t.includes(c) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
  return scored.slice(0, limit).map((x) => x.code);
}

export const cleanTags = (xs: unknown): string[] =>
  [...new Set((Array.isArray(xs) ? xs : []).filter((x): x is string => typeof x === 'string' && OUTCOME_CODES.includes(x)))].slice(0, 6);

export const wordCount = (s: string) => (s.trim().match(/\S+/g) ?? []).length;
