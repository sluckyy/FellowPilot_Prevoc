'use client';
import { CONFIDENCE_LABELS, type Confidence } from '@/lib/core';

const LEVELS: Confidence[] = [1, 2, 3, 4];

/** How sure are you? Each choice shows its level as rising bars; the chosen one takes the primary colour. */
export function ConfidenceScale({ value, onChange, disabled }: { value: Confidence | null; onChange: (c: Confidence) => void; disabled?: boolean }) {
  return (
    <fieldset className="confidence">
      <legend>How sure are you?</legend>
      <div className="scale">
        {LEVELS.map((c) => (
          <button key={c} type="button" aria-pressed={value === c} disabled={disabled} onClick={() => onChange(c)}>
            <span className="bars" aria-hidden>
              {LEVELS.map((b) => <i key={b} className={b <= c ? 'lvl' : undefined} />)}
            </span>
            <span className="label">{CONFIDENCE_LABELS[c]}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
