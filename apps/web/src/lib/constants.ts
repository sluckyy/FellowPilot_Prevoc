export const PRIVACY_VERSION = '2026-11-prevoc-beta-1';
export const APP_VERSION = 'web 0.2.0-prevoc';
export const SET_SIZES = [10, 25] as const;

export const CONTEXT_LABELS: Record<string, string> = {
  ward: 'Hospital ward',
  ed: 'Emergency department',
  clinic: 'Outpatients or general practice',
  theatre: 'Theatre and perioperative',
  after_hours: 'After-hours ward cover',
  rural: 'Regional hospital',
  telehealth: 'Telehealth',
  retrieval: 'Retrieval',
  remote: 'Remote clinic',
};

export const SETTING_LABELS: Record<string, string> = { rural: 'Regional or rural', metro: 'Metropolitan', any: 'Any setting' };
export const PGY_LABELS: Record<string, string> = { PGY1: 'PGY1', PGY2: 'PGY2', both: 'PGY1 and PGY2' };

export const FLAG_REASONS: { value: string; label: string }[] = [
  { value: 'wrong_key', label: 'The marked answer is wrong' },
  { value: 'outdated', label: 'Outdated guideline or policy' },
  { value: 'ambiguous', label: 'Ambiguous, or more than one best answer' },
  { value: 'poor_distractor', label: 'A wrong option makes no sense' },
  { value: 'not_junior_scope', label: 'Not realistic for a junior doctor' },
  { value: 'typo', label: 'Typo or wording problem' },
  { value: 'other', label: 'Something else' },
];

/** A trainee's flags take questions out of practice, up to this many a week; beyond it they are still recorded. */
export const FLAG_SUSPEND_WEEKLY_CAP = 5;
export const FLAG_COMMENT_MIN = 10;
