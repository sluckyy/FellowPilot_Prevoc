/** Event Model types and server-side validation (no external libraries). */

export type OptionId = 'A' | 'B' | 'C' | 'D';
export const OPTION_IDS: readonly OptionId[] = ['A', 'B', 'C', 'D'];

export const EVENT_TYPES = [
  'item_presented', 'option_selected', 'confidence_set', 'item_flagged_for_review', 'item_revisited',
  'answer_submitted', 'answer_skipped', 'change_reason_given',
  'explanation_viewed', 'reference_opened', 'item_flag_raised', 'item_flag_resolved',
  'tutor_question_asked', 'tutor_answer_shown', 'tutor_answer_rated',
  'question_submitted', 'coaching_feedback_shown', 'question_reviewed',
  'product_feedback_given', 'feature_voted',
  'session_started', 'session_ended', 'diagnostic_completed', 'weekly_goal_set',
  'achievement_earned', 'duel_started', 'duel_finished',
  'study_guide_generated', 'study_guide_opened', 'consent_updated',
  'goal_plan_created', 'goal_plan_revised', 'checkin_completed',
  'reflection_logged', 'reflection_tags_confirmed', 'streak_pause_set',
  'season_started', 'team_joined', 'team_left', 'level_reached',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const MODES = ['learning', 'exam_sim', 'diagnostic', 'duel', 'scenario', 'none'] as const;
export type Mode = (typeof MODES)[number];

export interface EventEnvelope {
  event_id: string;
  event_type: EventType;
  user_id: string;
  tenant_id: string;
  session_id: string;
  client_ts: string;   // ISO 8601
  app_version: string;
  mode: Mode;
  payload: Record<string, unknown>;
}
export type AppEvent = EventEnvelope;

/** Event types a trainee's client may send. Others are written by the server only. */
export const CLIENT_EVENT_TYPES: ReadonlySet<EventType> = new Set<EventType>([
  'item_presented', 'option_selected', 'confidence_set', 'item_flagged_for_review', 'item_revisited',
  'answer_submitted', 'answer_skipped', 'change_reason_given', 'explanation_viewed', 'reference_opened',
  'session_started', 'session_ended', 'tutor_answer_rated',
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAYLOAD_BYTES = 8 * 1024;
const MAX_FUTURE_MS = 5 * 60 * 1000;

export interface ValidationResult { ok: boolean; errors: string[] }

/**
 * Validate one client-sent event. The server overwrites user_id and tenant_id from the session,
 * so they are not trusted from the client. `now` is injectable for tests.
 */
export function validateClientEvent(e: unknown, now = Date.now()): ValidationResult {
  const errors: string[] = [];
  if (typeof e !== 'object' || e === null) return { ok: false, errors: ['event must be an object'] };
  const x = e as Record<string, unknown>;
  if (typeof x.event_id !== 'string' || !UUID.test(x.event_id)) errors.push('event_id must be a UUID');
  if (typeof x.session_id !== 'string' || !UUID.test(x.session_id)) errors.push('session_id must be a UUID');
  if (typeof x.event_type !== 'string' || !CLIENT_EVENT_TYPES.has(x.event_type as EventType)) errors.push('event_type not allowed from client');
  if (typeof x.mode !== 'string' || !(MODES as readonly string[]).includes(x.mode)) errors.push('mode invalid');
  if (typeof x.app_version !== 'string' || x.app_version.length > 40) errors.push('app_version invalid');
  const ts = typeof x.client_ts === 'string' ? Date.parse(x.client_ts) : NaN;
  if (Number.isNaN(ts)) errors.push('client_ts must be an ISO timestamp');
  else if (ts > now + MAX_FUTURE_MS) errors.push('client_ts is in the future');
  if (typeof x.payload !== 'object' || x.payload === null || Array.isArray(x.payload)) errors.push('payload must be an object');
  else if (JSON.stringify(x.payload).length > MAX_PAYLOAD_BYTES) errors.push('payload too large');
  else errors.push(...validatePayload(x.event_type as EventType, x.payload as Record<string, unknown>));
  return { ok: errors.length === 0, errors };
}

function validatePayload(type: EventType, p: Record<string, unknown>): string[] {
  const errs: string[] = [];
  const needItem = () => { if (typeof p.item_id !== 'string' || !UUID.test(p.item_id)) errs.push('payload.item_id must be a UUID'); };
  const isOpt = (v: unknown) => typeof v === 'string' && (OPTION_IDS as readonly string[]).includes(v);
  const isConf = (v: unknown) => v === 1 || v === 2 || v === 3 || v === 4;
  const isNonNegInt = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
  switch (type) {
    case 'item_presented':
      needItem();
      if (!Number.isInteger(p.item_version)) errs.push('payload.item_version required');
      if (!Array.isArray(p.option_order) || p.option_order.length !== 4 || !p.option_order.every(isOpt)
          || new Set(p.option_order).size !== 4) errs.push('payload.option_order must list A-D once each');
      break;
    case 'option_selected':
      needItem();
      if (!isOpt(p.option_id)) errs.push('payload.option_id must be A-D');
      if (!isNonNegInt(p.selection_index)) errs.push('payload.selection_index required');
      break;
    case 'confidence_set':
      needItem();
      if (!isConf(p.confidence)) errs.push('payload.confidence must be 1-4');
      break;
    case 'answer_submitted':
      needItem();
      if (!Number.isInteger(p.item_version) || (p.item_version as number) < 1) errs.push('payload.item_version required');
      if (!isOpt(p.final_option_id)) errs.push('payload.final_option_id must be A-D');
      if (p.first_option_id !== undefined && !isOpt(p.first_option_id)) errs.push('payload.first_option_id must be A-D');
      if (!isConf(p.final_confidence)) errs.push('payload.final_confidence must be 1-4');
      if (p.first_confidence !== undefined && !isConf(p.first_confidence)) errs.push('payload.first_confidence must be 1-4');
      if (p.n_changes !== undefined && !isNonNegInt(p.n_changes)) errs.push('payload.n_changes invalid');
      if (p.ms_total !== undefined && !isNonNegInt(p.ms_total)) errs.push('payload.ms_total invalid');
      if (p.attempt_number !== undefined && (!Number.isInteger(p.attempt_number) || (p.attempt_number as number) < 1)) errs.push('payload.attempt_number invalid');
      if (typeof p.change_path === 'string' && !/^[A-D](>[A-D])*$/.test(p.change_path)) errs.push('payload.change_path invalid');
      break;
    case 'change_reason_given':
      needItem();
      if (!['reread_stem', 'recalled_fact', 'gut_feeling', 'ran_out_of_time', 'other'].includes(p.reason as string)) errs.push('payload.reason invalid');
      break;
    case 'tutor_answer_rated':
      needItem();
      if (typeof p.helpful !== 'boolean') errs.push('payload.helpful must be true or false');
      if (!isNonNegInt(p.turn_index)) errs.push('payload.turn_index required');
      break;
    case 'answer_skipped': case 'item_revisited': case 'item_flagged_for_review':
    case 'explanation_viewed': case 'reference_opened':
      needItem();
      break;
    default:
      break;
  }
  return errs;
}
