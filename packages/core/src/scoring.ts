/** Confidence scale and confidence-weighted points (Event Model, "Derived metrics"). */

export type Confidence = 1 | 2 | 3 | 4;

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  1: 'Guessing',
  2: 'Unsure',
  3: 'Fairly sure',
  4: 'Certain',
};

/** Probability that the chosen answer is right, for each confidence level. */
export const CONFIDENCE_P: Record<Confidence, number> = { 1: 0.25, 2: 0.5, 3: 0.75, 4: 0.95 };

export function isConfidence(x: unknown): x is Confidence {
  return x === 1 || x === 2 || x === 3 || x === 4;
}

/**
 * Proper scoring rule: points = 60c + 80(1 - (c - p)^2) - 40.
 * Reporting true confidence maximises expected points, so honesty is the winning strategy.
 * Must match the SQL function answer_points() exactly.
 */
export function answerPoints(correct: boolean, confidence: Confidence): number {
  const c = correct ? 1 : 0;
  const p = CONFIDENCE_P[confidence];
  return Math.round(60 * c + 80 * (1 - (c - p) ** 2) - 40);
}

/** Expected points if the true chance of being right is q and the trainee reports `confidence`. */
export function expectedPoints(q: number, confidence: Confidence): number {
  const p = CONFIDENCE_P[confidence];
  return q * (60 + 80 * (1 - (1 - p) ** 2) - 40) + (1 - q) * (80 * (1 - p ** 2) - 40);
}
