import { DRAFT_OPTIONS, type DraftQuestion } from '@/lib/core';
import { CONTEXT_LABELS } from '@/lib/constants';

/** A written question laid out as a trainee would see its feedback: best answer marked, all explanations. */
export function QuestionPreview({ d }: { d: DraftQuestion }) {
  return (
    <div className="stack">
      <div className="tags">
        {d.learning_area ? <span className="tag">{d.learning_area}</span> : null}
        {d.presentation ? <span className="tag">{d.presentation}</span> : null}
        <span className="tag">{CONTEXT_LABELS[d.context] ?? d.context}</span>
      </div>
      <p className="stem" style={{ whiteSpace: 'pre-wrap' }}>{d.stem}</p>
      <p className="leadin">{d.lead_in}</p>
      <div className="stack">
        {DRAFT_OPTIONS.map((k) => (
          <div key={k} className={`optrow${d.key === k ? ' key' : ''}`}>
            <span className="letter" style={{ paddingTop: 0 }}>{k}</span>
            <div>
              <p style={{ margin: 0 }}>{d.options[k]}{d.key === k ? <strong className="small" style={{ color: 'var(--correct)' }}> · Best answer</strong> : null}</p>
              <p className="small muted" style={{ margin: '4px 0 0' }}>{d.explanations[k]}</p>
            </div>
          </div>
        ))}
      </div>
      <p><strong>Key point:</strong> {d.learning_point}</p>
      {d.rural_note ? <p><strong>Setting note:</strong> {d.rural_note}</p> : null}
      {d.references.some((r) => r.title) ? (
        <div><strong>References</strong>
          <ul style={{ margin: '4px 0 0' }}>{d.references.filter((r) => r.title).map((r, i) => <li key={i}>{r.title}{r.locator ? `: ${r.locator}` : ''}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}
