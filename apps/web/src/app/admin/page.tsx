import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { FLAG_REASONS } from '@/lib/constants';
import { InviteForm, FlagActions, HeldActions } from './AdminClient';

export const metadata = { title: 'Admin' };
export const dynamic = 'force-dynamic';

const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Adelaide' }).format(d) : 'Never');
const reasonLabel = (r: string) => FLAG_REASONS.find((x) => x.value === r)?.label ?? r;

export default async function AdminPage() {
  const admin = await requirePageUser({ role: 'admin' });
  const [users, flags, bank, feedback, held] = await Promise.all([
    q<{ id: string; email: string; name: string; roles: string[]; last_sign_in_at: Date | null; consented: boolean; answered: number }>(
      `SELECT u.id, p.email, p.display_name AS name, u.roles, u.last_sign_in_at, c.user_id IS NOT NULL AS consented,
              (SELECT count(*) FROM answer a WHERE a.user_id = u.id)::int AS answered
         FROM app_user u JOIN user_profile p ON p.user_id = u.id LEFT JOIN consent c ON c.user_id = u.id
        WHERE u.tenant_id = $1 AND u.deleted_at IS NULL ORDER BY u.created_at DESC`, [admin.tenantId]),
    q<{ id: string; reason: string; comment: string; created_at: Date; learning_area: string; presentation: string; stem: string; key: string;
        raised_by: string; suspended_item: boolean; review_level: string; flagger_n: number; flagger_acc: number | null;
        flagger_correct: boolean | null; others_answered: number; other_flags: number }>(
      `SELECT f.id, f.reason, f.comment, f.created_at, v.learning_area, v.presentation, left(v.stem, 180) AS stem, v.key,
              p.display_name AS raised_by, f.suspended_item, v.review_level,
              fs.n AS flagger_n, fs.acc AS flagger_acc,
              (SELECT a.correct FROM answer a WHERE a.user_id = f.user_id AND a.item_id = f.item_id ORDER BY a.attempt_number LIMIT 1) AS flagger_correct,
              (SELECT count(DISTINCT a.user_id)::int FROM answer a WHERE a.item_id = f.item_id AND a.user_id <> f.user_id
                  AND NOT EXISTS (SELECT 1 FROM flag g WHERE g.item_id = f.item_id AND g.user_id = a.user_id)) AS others_answered,
              (SELECT count(*)::int FROM flag g WHERE g.item_id = f.item_id AND g.id <> f.id) AS other_flags
         FROM flag f JOIN item_version v ON v.item_id = f.item_id AND v.version = f.item_version
         JOIN user_profile p ON p.user_id = f.user_id
         LEFT JOIN LATERAL (SELECT count(*)::int AS n, avg(a.correct::int)::float AS acc FROM answer a
                             WHERE a.user_id = f.user_id AND a.attempt_number = 1) fs ON true
        WHERE f.status = 'open' ORDER BY (f.reason = 'wrong_key') DESC, f.created_at`),
    q<{ status: string; n: number }>(`SELECT status, count(*)::int AS n FROM item GROUP BY status ORDER BY status`),
    q<{ area: string; body: string; created_at: Date; name: string }>(
      `SELECT f.area, f.body, f.created_at, p.display_name AS name FROM product_feedback f
         JOIN user_profile p ON p.user_id = f.user_id ORDER BY f.created_at DESC LIMIT 30`),
    // Out of practice after a report that was upheld, waiting for a corrected version.
    q<{ id: string; learning_area: string; presentation: string; note: string }>(
      `SELECT i.id, v.learning_area, v.presentation,
              (SELECT string_agg(g.comment, ' | ') FROM flag g WHERE g.item_id = i.id AND g.outcome = 'upheld') AS note
         FROM item i JOIN item_version v ON v.item_id = i.id AND v.version = i.current_version
        WHERE i.status = 'under_review' AND NOT EXISTS (SELECT 1 FROM flag g WHERE g.item_id = i.id AND g.status = 'open')
        ORDER BY i.updated_at`),
  ]);

  return (
    <div className="page">
      <div className="stack">
        <h1>Admin</h1>
        <p className="muted num">
          Question bank: {bank.length ? bank.map((b) => `${b.n} ${b.status}`).join(', ') : 'empty'}.
        </p>
        <p className="row small"><Link href="/admin/achievements">Edit achievements</Link><Link href="/admin/seasons">Seasons</Link><Link href="/review">Review written questions</Link></p>
      </div>

      <section className="stack" aria-labelledby="flags">
        <h2 id="flags">Open reports ({flags.length})</h2>
        {!flags.length ? <p className="muted">No open reports.</p> : flags.map((f) => (
          <article key={f.id} className="panel stack">
            <p><strong>{reasonLabel(f.reason)}</strong> <span className="muted small">from {f.raised_by || 'a trainee'}, {fmt(f.created_at)}</span>
              {f.suspended_item ? <span className="status changes_requested" style={{ marginLeft: 8 }}>Taken out of practice</span> : null}
              {f.review_level === 'none' ? <span className="status" style={{ marginLeft: 8 }}>Not yet clinically reviewed</span> : null}</p>
            <p className="small muted num">
              Flagger: {f.flagger_n} answered{f.flagger_acc !== null ? `, ${Math.round(f.flagger_acc * 100)}% correct overall` : ''}
              {f.flagger_correct === true ? '; got this question right' : f.flagger_correct === false ? '; got this question wrong' : ''}.
              {' '}{f.others_answered} other{f.others_answered === 1 ? '' : 's'} answered it without reporting{f.other_flags ? `; ${f.other_flags} other report${f.other_flags === 1 ? '' : 's'}` : ''}.
            </p>
            <p className="small muted">{f.learning_area}, {f.presentation}. Key {f.key}.</p>
            <p className="small" style={{ fontFamily: 'var(--font-reading)' }}>{f.stem}…</p>
            {f.comment ? <p className="small">&ldquo;{f.comment}&rdquo;</p> : null}
            <FlagActions flagId={f.id} />
          </article>
        ))}
      </section>

      {held.length ? (
        <section className="stack" aria-labelledby="held">
          <h2 id="held">Out of practice, waiting for a fix ({held.length})</h2>
          <p className="small muted">Reports on these were upheld. Load a corrected version, then put them back, or retire them.</p>
          {held.map((h) => (
            <article key={h.id} className="panel stack">
              <p><strong>{h.presentation}</strong> <span className="small muted">{h.learning_area}</span></p>
              {h.note ? <p className="small">&ldquo;{h.note}&rdquo;</p> : null}
              <HeldActions itemId={h.id} />
            </article>
          ))}
        </section>
      ) : null}

      <section className="stack" aria-labelledby="invite">
        <h2 id="invite">Invite someone</h2>
        <InviteForm />
      </section>

      <section className="stack" aria-labelledby="people">
        <h2 id="people">People ({users.length})</h2>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Last sign-in</th><th className="num">Answers</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name || <span className="muted">Not set</span>}{!u.consented ? <span className="muted small"> (not started)</span> : null}</td>
                  <td>{u.email}</td>
                  <td className="small">{u.roles.join(', ')}</td>
                  <td className="small">{fmt(u.last_sign_in_at)}</td>
                  <td className="num">{u.answered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack" aria-labelledby="fb">
        <h2 id="fb">Recent feedback</h2>
        {!feedback.length ? <p className="muted">No feedback yet.</p> : feedback.map((f, i) => (
          <div key={i} className="insight">
            <p className="small muted">{f.name || 'Someone'}, {fmt(f.created_at)}, about {f.area}</p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
