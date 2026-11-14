/**
 * Build SQL that releases a round's questions to trainees before clinical review: every question
 * that passed the automated checks goes live, unreviewed. Trainee flags take questions out; a later
 * Review Desk import adds the reviewed version on top.
 *
 *   node dist/src/cli/load-beta.js --docs review_docs.json --out beta.sql [--report report.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { betaRelease, betaSql, type ReviewDoc } from '../review-import.js';

function arg(name: string, required = true): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  const v = i > 0 ? process.argv[i + 1] : undefined;
  if (required && !v) { console.error(`Missing --${name}`); process.exit(2); }
  return v;
}

const docs: ReviewDoc[] = JSON.parse(readFileSync(arg('docs')!, 'utf8'));
const outcomes = betaRelease(docs);
writeFileSync(arg('out')!, betaSql(outcomes));
const report = arg('report', false);
if (report) writeFileSync(report, JSON.stringify(outcomes.map((o) => ({ work_order_id: o.work_order_id, item_id: o.item_id, status: o.status, ...('reason' in o ? { reason: o.reason } : {}) })), null, 2));
const n = (s: string) => outcomes.filter((o) => o.status === s).length;
console.log(JSON.stringify({ beta: n('beta'), held: n('held') }));
for (const o of outcomes) if (o.status === 'held') console.log(`${o.work_order_id}  held  ${o.reason}`);
