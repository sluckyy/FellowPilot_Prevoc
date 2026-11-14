import { checkOrigin, handle, json, readJson, requireApiUser, HttpError } from '@/lib/http';
import { one, q, tx } from '@/lib/db';
import { canReview } from '@/lib/auth';
import { canSubmit, draftGates, toDraft } from '@/lib/core';
import { editable, getDraft, publishDraft } from '@/lib/questions';
import { coachDraft, COACH_DAILY_LIMIT, COACH_PROMPT_ID } from '@/lib/coach';
import { tutorAvailable } from '@/lib/tutor';
import { sendMail } from '@/lib/email';
import { BRAND } from '@/brand/generated/brand';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: { id: string } };

const audit = (actor: string, action: string, target: string, detail: Record<string, unknown> = {}) =>
  q('INSERT INTO audit_log (actor_id, action, target, detail) VALUES ($1, $2, $3, $4)', [actor, action, target, JSON.stringify(detail)]);

/** Save the author's draft. Body: { content, recall_declared } */
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  checkOrigin(req);
  const u = await requireApiUser();
  const d = await getDraft(ctx.params.id, u.tenantId);
  if (!d || d.author_id !== u.id) throw new HttpError(404, 'Question not found');
  if (!editable(d.status)) throw new HttpError(409, 'This question is with a reviewer and can\'t be edited now');
  const b = await readJson<{ content?: unknown; recall_declared?: unknown }>(req, 64 * 1024);
  const content = toDraft(b.content);
  await q(`UPDATE draft_item SET content = $2, recall_declared = $3, updated_at = now() WHERE id = $1`,
    [d.id, JSON.stringify(content), b.recall_declared === true]);
  return json({ ok: true, gates: draftGates(content) });
});

/**
 * Actions on a question. Body: { action, ... }
 *   submit                      author: send for review (checks must pass, declaration ticked)
 *   withdraw                    author: take back a submitted question to keep editing
 *   discard                     author: drop a draft
 *   coach                       author: AI feedback on the saved draft
 *   review { decision, note }   reviewer/editor/admin: accept | changes | reject
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  checkOrigin(req);
  const u = await requireApiUser();
  const d = await getDraft(ctx.params.id, u.tenantId);
  if (!d) throw new HttpError(404, 'Question not found');
  const b = await readJson<{ action?: unknown; decision?: unknown; note?: unknown }>(req, 16 * 1024);
  const mine = d.author_id === u.id;

  switch (b.action) {
    case 'submit': {
      if (!mine) throw new HttpError(404, 'Question not found');
      if (!editable(d.status)) throw new HttpError(409, 'Already submitted');
      if (!canSubmit(d.content)) throw new HttpError(400, 'Fix the problems marked on the form first');
      if (!d.recall_declared) throw new HttpError(400, 'Confirm that you wrote this question yourself');
      await q(`UPDATE draft_item SET status = 'submitted', submitted_at = now(), updated_at = now() WHERE id = $1`, [d.id]);
      await audit(u.id, 'question_submitted', d.id);
      return json({ ok: true, status: 'submitted' });
    }
    case 'withdraw': {
      if (!mine || d.status !== 'submitted') throw new HttpError(409, 'Only a question waiting for review can be taken back');
      await q(`UPDATE draft_item SET status = 'draft', updated_at = now() WHERE id = $1`, [d.id]);
      return json({ ok: true, status: 'draft' });
    }
    case 'discard': {
      if (!mine || !editable(d.status)) throw new HttpError(409, 'Only an unfinished question can be discarded');
      await q(`UPDATE draft_item SET status = 'withdrawn', updated_at = now() WHERE id = $1`, [d.id]);
      return json({ ok: true, status: 'withdrawn' });
    }
    case 'coach': {
      if (!mine) throw new HttpError(404, 'Question not found');
      if (!tutorAvailable()) throw new HttpError(503, 'AI feedback is not available yet.');
      const used = await one<{ n: string }>(
        `SELECT count(*) AS n FROM audit_log WHERE actor_id = $1 AND action = 'question_coached'
            AND at >= date_trunc('day', now() AT TIME ZONE 'Australia/Adelaide') AT TIME ZONE 'Australia/Adelaide'`, [u.id]);
      if (Number(used?.n ?? 0) >= COACH_DAILY_LIMIT) throw new HttpError(429, `You've used today's ${COACH_DAILY_LIMIT} AI reviews. They reset at midnight.`);
      await audit(u.id, 'question_coached', d.id, { prompt: COACH_PROMPT_ID });
      const r = await coachDraft(d.content, d.author_role, req.signal);
      const coaching = { text: r.text.trim(), model: r.model, prompt: COACH_PROMPT_ID, at: new Date().toISOString() };
      await q('UPDATE draft_item SET coaching = $2 WHERE id = $1', [d.id, JSON.stringify(coaching)]);
      return json({ ok: true, coaching });
    }
    case 'review': {
      if (!canReview(u)) throw new HttpError(403, 'You do not have access to this');
      if (mine) throw new HttpError(403, 'Someone else needs to review your own question');
      if (d.status !== 'submitted') throw new HttpError(409, 'This question is not waiting for review');
      const decision = b.decision;
      const note = typeof b.note === 'string' ? b.note.trim().slice(0, 2000) : '';
      if (decision !== 'accept' && decision !== 'changes' && decision !== 'reject') throw new HttpError(400, 'Choose accept, changes or reject');
      if (decision !== 'accept' && note.length < 10) throw new HttpError(400, 'Tell the author what to change or why (a sentence or two)');
      if (decision === 'accept' && !canSubmit(d.content)) throw new HttpError(400, 'This question no longer passes the automatic checks');
      const status = decision === 'accept' ? 'accepted' : decision === 'changes' ? 'changes_requested' : 'rejected';
      const itemId = await tx(async (c) => {
        const id = decision === 'accept' ? await publishDraft(c, d, u.tenantId, u.name || u.email) : null;
        const upd = await c.query(
          `UPDATE draft_item SET status = $2, review_note = $3, reviewer_id = $4, reviewed_at = now(), updated_at = now(), item_id = $5
            WHERE id = $1 AND status = 'submitted'`, [d.id, status, note, u.id, id]);
        if (upd.rowCount !== 1) throw new HttpError(409, 'Someone else has just reviewed this question');
        await c.query('INSERT INTO audit_log (actor_id, action, target, detail) VALUES ($1, $2, $3, $4)',
          [u.id, 'question_reviewed', d.id, JSON.stringify({ decision, item_id: id })]);
        return id;
      });
      await notifyAuthor(d.author_id, d.content.presentation, status, note, req).catch((e) => console.error('review email failed', e));
      return json({ ok: true, status, item_id: itemId });
    }
    default:
      throw new HttpError(400, 'Unknown action');
  }
});

async function notifyAuthor(authorId: string, presentation: string, status: string, note: string, req: Request) {
  const a = await one<{ email: string; display_name: string }>('SELECT email, display_name FROM user_profile WHERE user_id = $1', [authorId]);
  if (!a) return;
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  const what = status === 'accepted' ? 'has been accepted into the question bank. Thank you.'
    : status === 'changes_requested' ? 'needs a few changes before it can be accepted.' : 'was not accepted this time.';
  const subject = status === 'accepted' ? 'Your question was accepted' : status === 'changes_requested' ? 'Changes requested on your question' : 'Your question was reviewed';
  const lines = [`Your question on ${presentation || 'your topic'} ${what}`, note ? `\nReviewer's note:\n${note}` : '', `\nSee it in ${BRAND.name}: ${base}/write`];
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  await sendMail({
    to: a.email, subject: `${subject} – ${BRAND.name}`, text: lines.join('\n'),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:${BRAND.email.ink};max-width:520px">${lines.filter(Boolean).map((l) => `<p style="white-space:pre-wrap">${esc(l.trim())}</p>`).join('')}</div>`,
  });
}
