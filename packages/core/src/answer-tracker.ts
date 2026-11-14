/**
 * Records what a trainee does on one question and emits Event Model events.
 * Used by the client; pure and clock-injectable so it can be tested.
 */
import { type Confidence, isConfidence } from './scoring.js';
import type { AppEvent, EventEnvelope, OptionId } from './events.js';

export interface TrackerContext {
  envelope: Omit<EventEnvelope, 'event_id' | 'client_ts' | 'event_type' | 'payload'>;
  itemId: string;
  itemVersion: number;
  optionOrder: OptionId[];          // display order of stored option ids
  positionInSet: number;
  setId: string;
  isPretest: boolean;
  attemptNumber: number;
  now?: () => number;               // ms since epoch
  newId?: () => string;
}

export class AnswerTracker {
  private readonly ctx: TrackerContext;
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly presentedAt: number;
  private selections: OptionId[] = [];
  private confidences: Confidence[] = [];
  private submitted = false;
  readonly events: AppEvent[] = [];

  constructor(ctx: TrackerContext) {
    this.ctx = ctx;
    this.now = ctx.now ?? Date.now;
    this.newId = ctx.newId ?? (() => crypto.randomUUID());
    this.presentedAt = this.now();
    this.emit('item_presented', {
      item_id: ctx.itemId, item_version: ctx.itemVersion, option_order: ctx.optionOrder,
      position_in_set: ctx.positionInSet, set_id: ctx.setId, is_pretest: ctx.isPretest,
    });
  }

  get selected(): OptionId | null { return this.selections.at(-1) ?? null; }
  get confidence(): Confidence | null { return this.confidences.at(-1) ?? null; }
  get canSubmit(): boolean { return !this.submitted && this.selected !== null && this.confidence !== null; }
  get isSubmitted(): boolean { return this.submitted; }

  select(option: OptionId): void {
    if (this.submitted || option === this.selected) return;
    this.selections.push(option);
    this.emit('option_selected', {
      item_id: this.ctx.itemId, option_id: option,
      selection_index: this.selections.length, ms_since_presented: this.elapsed(),
    });
  }

  setConfidence(level: Confidence): void {
    if (this.submitted || !isConfidence(level) || level === this.confidence) return;
    this.confidences.push(level);
    this.emit('confidence_set', {
      item_id: this.ctx.itemId, confidence: level, ms_since_presented: this.elapsed(),
    });
  }

  /** Locks the answer. Correctness is decided by the server from the stored key. */
  submit(): AppEvent {
    if (!this.canSubmit) throw new Error('Choose an answer and a confidence level first');
    this.submitted = true;
    const path = collapse(this.selections);
    return this.emit('answer_submitted', {
      item_id: this.ctx.itemId, item_version: this.ctx.itemVersion,
      final_option_id: this.selected!, first_option_id: this.selections[0],
      final_confidence: this.confidence!, first_confidence: this.confidences[0],
      n_changes: path.length - 1, change_path: path.join('>'),
      ms_total: this.elapsed(), attempt_number: this.ctx.attemptNumber, is_pretest: this.ctx.isPretest,
    });
  }

  giveChangeReason(reason: ChangeReason): void {
    this.emit('change_reason_given', { item_id: this.ctx.itemId, reason });
  }

  private elapsed(): number { return Math.max(0, Math.round(this.now() - this.presentedAt)); }

  private emit(event_type: AppEvent['event_type'], payload: Record<string, unknown>): AppEvent {
    const e = {
      ...this.ctx.envelope, event_id: this.newId(), event_type,
      client_ts: new Date(this.now()).toISOString(), payload,
    } as AppEvent;
    this.events.push(e);
    return e;
  }
}

export type ChangeReason = 'reread_stem' | 'recalled_fact' | 'gut_feeling' | 'ran_out_of_time' | 'other';

/** A→B→A counts as two changes; repeated taps on the same option are not changes. */
function collapse(xs: OptionId[]): OptionId[] {
  return xs.filter((x, i) => i === 0 || x !== xs[i - 1]);
}
