import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, parseCsv, reviewsFromCsv, toSql, type Review, type ReviewDoc } from '../src/index.js';

const doc = (id: string): ReviewDoc => ({
  item_id: id, work_order_id: `r1-${id.slice(-3)}`, version: 1, stem: 'A man presents.', lead_in: 'What next?',
  options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }, { id: 'C', text: "c's" }, { id: 'D', text: 'd' }], key: 'A',
  explanations: { A: 'ea', B: 'eb', C: 'ec', D: 'ed' }, learning_point: 'lp', learning_area: 'Emergency', domains: ['D4'],
  presentation: 'chest pain', context: 'ed', cognitive_level: 'management', patient: { age_band: '45-64' }, target_difficulty: 3,
});
const rev = (id: string, p: Partial<Review> = {}): Review => ({
  item_id: id, item_version: 1, reviewer_id: 'u1', reviewer_name: 'Dr One', key_correct: 'yes', accuracy: 'yes', decision: 'accept', ...p,
});

test('decision rules', () => {
  const docs = ['001', '002', '003', '004', '005', '006', '007'].map((s) => doc(`00000000-0000-4000-8000-000000000${s}`));
  const id = (n: number) => docs[n].item_id;
  const out = decide(docs, [
    rev(id(0)),                                                       // accepted
    rev(id(1)), rev(id(1), { reviewer_id: 'u2', key_correct: 'no', decision: 'reject' }), // one wrong-key → excluded
    rev(id(2), { accuracy: 'major', decision: 'reject' }),            // excluded
    rev(id(3), { decision: 'reject', reject_reason: 'trivial' }),     // excluded
    rev(id(4), { decision: 'accept_with_edits', edits: { stem: 'S1' } }),
    rev(id(4), { reviewer_id: 'u2', decision: 'accept_with_edits', edits: { stem: 'S2' } }), // conflict
    rev(id(5), { decision: 'accept_with_edits', edits: { options: { B: 'b2' }, explanations: { B: 'eb2' } } }),
  ], new Date('2026-10-24T00:00:00Z'));
  assert.deepEqual(out.map((o) => o.status), ['accepted', 'excluded', 'excluded', 'excluded', 'needs_editor', 'accepted', 'unreviewed']);
  const edited = out[5];
  assert.ok(edited.status === 'accepted');
  if (edited.status === 'accepted') {
    assert.equal(edited.version.version, 2);
    assert.equal(edited.version.provenance, 'ai_edited_by_human');
    assert.equal(edited.version.options[1].text, 'b2');
    assert.equal(edited.version.explanations.B, 'eb2');
    assert.equal(edited.version.options[0].text, 'a');
    assert.equal(edited.version.review_by, '2028-10-24');
  }
  const plain = out[0];
  if (plain.status === 'accepted') assert.equal(plain.version.version, 1);
});

test('CSV parser handles quotes, commas and newlines; Review Desk export round-trips', () => {
  const csv = 'a,b,c\r\n1,"x, y","say ""hi""\nthere"\r\n2,,\r\n';
  assert.deepEqual(parseCsv(csv), [{ a: '1', b: 'x, y', c: 'say "hi"\nthere' }, { a: '2', b: '', c: '' }]);
  const head = 'reviewer_name,reviewer_email,reviewer_role,reviewer_id,work_order_id,item_id,item_version,learning_area,key_correct,accuracy,rural_realism,distractors_plausible,difficulty_view,decision,reject_reason,edited,edits,comment,active_seconds,first_submitted_at,submitted_at';
  const line = 'Dr One,one@x.au,Supervisor,u1,r1-001,00000000-0000-4000-8000-000000000001,1,Emergency,yes,minor,3,2,right,accept_with_edits,,true,"{""stem"":""New, stem""}","Nice, but",95,2026-10-24,2026-10-24';
  const [r] = reviewsFromCsv(head + '\r\n' + line);
  assert.equal(r.decision, 'accept_with_edits');
  assert.equal(r.edits?.stem, 'New, stem');
  assert.equal(r.rural_realism, 3);
  assert.equal(r.comment, 'Nice, but');
});

test('SQL escapes quotes and keeps the original version when edited', () => {
  const d = doc('00000000-0000-4000-8000-000000000001');
  const out = decide([d], [rev(d.item_id, { decision: 'accept_with_edits', edits: { stem: "O'Brien's stem" } })]);
  const sql = toSql(out, [d]);
  assert.match(sql, /O''Brien''s stem/);
  assert.match(sql, /c''s/);
  assert.equal((sql.match(/INSERT INTO item_version/g) ?? []).length, 2);
});
