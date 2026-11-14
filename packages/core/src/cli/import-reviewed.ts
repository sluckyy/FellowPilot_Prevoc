/**
 * Build SQL that loads Review Desk-accepted items into the app database.
 *
 *   node dist/src/cli/import-reviewed.js --docs review_docs.json --reviews reviews.csv --out import.sql [--report report.json]
 *   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f import.sql
 *
 * --reviews takes the Review Desk CSV download, or a JSON array of review objects.
 * Safe to re-run as more reviews arrive: existing item versions are left untouched.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { decide, reviewsFromCsv, summary, toSql, type Review, type ReviewDoc } from '../review-import.js';

function arg(name: string, required = true): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  const v = i > 0 ? process.argv[i + 1] : undefined;
  if (required && !v) { console.error(`Missing --${name}`); process.exit(2); }
  return v;
}

const docs: ReviewDoc[] = JSON.parse(readFileSync(arg('docs')!, 'utf8'));
const reviewsPath = arg('reviews')!;
const raw = readFileSync(reviewsPath, 'utf8');
const reviews: Review[] = reviewsPath.endsWith('.csv') ? reviewsFromCsv(raw) : JSON.parse(raw);
const outcomes = decide(docs, reviews);
writeFileSync(arg('out')!, toSql(outcomes, docs));
const report = arg('report', false);
if (report) {
  writeFileSync(report, JSON.stringify(outcomes.map((o) => ({
    work_order_id: o.work_order_id, item_id: o.item_id, status: o.status, reviewers: o.reviewers,
    ...('reason' in o ? { reason: o.reason } : { version: o.version.version, edited: o.version.provenance === 'ai_edited_by_human' }),
  })), null, 2));
}
console.log(JSON.stringify(summary(outcomes)));
for (const o of outcomes) if (o.status === 'excluded' || o.status === 'needs_editor') console.log(`${o.work_order_id}  ${o.status}  ${'reason' in o ? o.reason : ''}`);
