/**
 * Plain-language takeaways for the trainee dashboard. Each insight only appears once there is
 * enough data for it to mean something; below that it says how many more answers are needed.
 */
import type { AnswerRow } from './metrics.js';
import { areaStats, calibrationSummary, changeStats, quadrants } from './metrics.js';

export interface Insight { id: string; tone: 'good' | 'neutral' | 'attention'; text: string }

export const MIN_FOR_CALIBRATION = 30;
export const MIN_CHANGES = 10;
export const MIN_PER_AREA = 8;

const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}`;

export function insights(rows: AnswerRow[]): Insight[] {
  const out: Insight[] = [];
  const cal = calibrationSummary(rows);

  if (cal.n < MIN_FOR_CALIBRATION) {
    out.push({ id: 'calibration-wait', tone: 'neutral',
      text: `Answer ${MIN_FOR_CALIBRATION - cal.n} more questions to see how well your confidence matches your accuracy.` });
  } else if (cal.bias !== null && Math.abs(cal.bias) < 0.05) {
    out.push({ id: 'calibration', tone: 'good', text: 'Your confidence matches your accuracy closely. Keep rating honestly.' });
  } else if (cal.bias !== null) {
    const over = cal.bias > 0;
    out.push({ id: 'calibration', tone: 'attention',
      text: over
        ? `You're ${pct(cal.bias)} points overconfident overall: you rate yourself surer than your results support.`
        : `You're ${pct(cal.bias)} points underconfident overall: you know more than you give yourself credit for.` });
  }

  // Largest area-level bias, once an area has enough answers.
  const areas = areaStats(rows).filter((a) => a.n >= MIN_PER_AREA);
  const worstBias = [...areas].sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias))[0];
  if (worstBias && Math.abs(worstBias.bias) >= 0.15) {
    out.push({ id: 'area-bias', tone: 'attention',
      text: `In ${worstBias.learning_area} you're ${pct(worstBias.bias)} points ${worstBias.bias > 0 ? 'overconfident' : 'underconfident'}.` });
  }
  const weakest = areas[0];
  if (weakest && weakest.accuracy < 0.6) {
    out.push({ id: 'weakest-area', tone: 'attention',
      text: `${weakest.learning_area} is your weakest area so far (${pct(weakest.accuracy)}% correct over ${weakest.n} questions).` });
  }

  const ch = changeStats(rows);
  if (ch.changed < MIN_CHANGES) {
    if (ch.answered >= MIN_FOR_CALIBRATION) out.push({ id: 'changes-wait', tone: 'neutral',
      text: `You've changed ${ch.changed} answer${ch.changed === 1 ? '' : 's'} so far. After ${MIN_CHANGES} we can tell you whether changing helps you.` });
  } else if (ch.netGain > 0) {
    out.push({ id: 'changes', tone: 'good',
      text: `Changing your answer has gained you ${ch.netGain} mark${ch.netGain === 1 ? '' : 's'} (${ch.wrongToRight} wrong to right, ${ch.rightToWrong} right to wrong). Trust your second look.` });
  } else if (ch.netGain < 0) {
    out.push({ id: 'changes', tone: 'attention',
      text: `Changing your answer has cost you ${-ch.netGain} mark${ch.netGain === -1 ? '' : 's'} (${ch.rightToWrong} right to wrong, ${ch.wrongToRight} wrong to right). Change only when you find a specific reason in the question.` });
  } else {
    out.push({ id: 'changes', tone: 'neutral', text: `Your answer changes have broken even (${ch.wrongToRight} gained, ${ch.rightToWrong} lost).` });
  }
  if (ch.changed >= MIN_CHANGES && ch.byFirstConfidence.high.changed >= 5 && ch.byFirstConfidence.high.netGain < 0) {
    out.push({ id: 'changes-confident', tone: 'attention',
      text: 'When you were already confident, changing your answer has usually cost you marks.' });
  }

  const q = quadrants(rows);
  if (q.misconception > 0) {
    out.push({ id: 'misconceptions', tone: 'attention',
      text: `${q.misconception} question${q.misconception === 1 ? ' was' : 's were'} wrong while you felt sure. These are the most valuable to review.` });
  }
  return out;
}
