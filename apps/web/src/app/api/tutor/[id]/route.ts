import { checkOrigin, handle, json, readJson, requireApiUser, HttpError } from '@/lib/http';
import { one, q } from '@/lib/db';
import { APP_VERSION } from '@/lib/constants';
import {
  runTutor, systemPrompt, tutorAvailable, tutorDailyLimit, tutorModel,
  TUTOR_MAX_CHARS, TUTOR_MAX_TURNS, type Turn, type TutorItem,
} from '@/lib/tutor';
import type { OptionId } from '@/lib/core';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;
const isOpt = (x: unknown): x is OptionId => x === 'A' || x === 'B' || x === 'C' || x === 'D';

/**
 * "Ask why" about a question this trainee has answered. Streams plain text.
 * Body: { version, option_order: ['C','A','D','B'], session_id, messages: [{role, content}, ...] }
 */
export const POST = handle(async (req: Request, ctx: { params: { id: string } }) => {
  checkOrigin(req);
  const u = await requireApiUser();
  if (!tutorAvailable()) throw new HttpError(503, 'The tutor is not available yet.');
  const b = await readJson<{ version?: unknown; option_order?: unknown; session_id?: unknown; messages?: unknown }>(req, 64 * 1024);

  if (!UUID.test(ctx.params.id) || !Number.isInteger(b.version)) throw new HttpError(400, 'Bad question reference');
  const order = b.option_order;
  if (!Array.isArray(order) || order.length !== 4 || !order.every(isOpt) || new Set(order).size !== 4) throw new HttpError(400, 'Bad option order');
  const sessionId = typeof b.session_id === 'string' && UUID.test(b.session_id) ? b.session_id : crypto.randomUUID();
  const msgs = b.messages;
  if (!Array.isArray(msgs) || !msgs.length || msgs.length > TUTOR_MAX_TURNS * 2 - 1) throw new HttpError(400, `Ask up to ${TUTOR_MAX_TURNS} questions per conversation`);
  const turns: Turn[] = msgs.map((m, i) => {
    const role = i % 2 === 0 ? 'user' : 'assistant';
    const content = typeof m?.content === 'string' ? m.content.trim() : '';
    if (m?.role !== role || !content) throw new HttpError(400, 'Messages must alternate between you and the tutor');
    if (role === 'user' && content.length > TUTOR_MAX_CHARS) throw new HttpError(400, `Keep each question under ${TUTOR_MAX_CHARS} characters`);
    return { role, content: content.slice(0, 6000) };
  });
  if (turns.at(-1)!.role !== 'user') throw new HttpError(400, 'The last message must be your question');

  // Only after answering, and within the daily allowance.
  const item = await one<TutorItem>(
    `SELECT v.stem, v.lead_in, v.options, v.key, v.explanations, v.learning_point, v.rural_note, v."references" AS references,
            v.tutor_context, v.learning_area, a.final_option, a.final_confidence
       FROM item_version v
       JOIN LATERAL (SELECT * FROM answer a WHERE a.user_id = $1 AND a.item_id = v.item_id AND a.item_version = v.version
                     ORDER BY a.client_ts DESC LIMIT 1) a ON true
      WHERE v.item_id = $2 AND v.version = $3`, [u.id, ctx.params.id, b.version]);
  if (!item) throw new HttpError(403, 'Answer the question first');
  const used = await one<{ n: string }>(
    `SELECT count(*) AS n FROM event WHERE user_id = $1 AND event_type = 'tutor_question_asked'
        AND client_ts >= date_trunc('day', now() AT TIME ZONE 'Australia/Adelaide') AT TIME ZONE 'Australia/Adelaide'`, [u.id]);
  if (Number(used?.n ?? 0) >= tutorDailyLimit()) throw new HttpError(429, `You've reached today's limit of ${tutorDailyLimit()} tutor questions. It resets at midnight.`);

  const turnIndex = Math.floor(turns.length / 2);
  const logEvent = (type: string, payload: Record<string, unknown>) => q(
    `INSERT INTO event (event_id, event_type, user_id, tenant_id, session_id, client_ts, app_version, mode, payload)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), $5, 'learning', $6)`,
    [type, u.id, u.tenantId, sessionId, APP_VERSION, JSON.stringify(payload)]);
  await logEvent('tutor_question_asked', {
    item_id: ctx.params.id, item_version: b.version, turn_index: turnIndex, question_text: turns.at(-1)!.content,
  });

  const system = systemPrompt(item, order as OptionId[]);
  const started = Date.now();
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const r = await runTutor(system, turns, (t) => controller.enqueue(enc.encode(t)), req.signal);
        await logEvent('tutor_answer_shown', {
          item_id: ctx.params.id, item_version: b.version, turn_index: turnIndex, model: r.model,
          input_tokens: r.inputTokens, output_tokens: r.outputTokens, latency_ms: Date.now() - started,
          answer_text: r.text.slice(0, 4000), grounded: true,
        });
      } catch (e) {
        console.error('tutor failed', e);
        controller.enqueue(enc.encode('\n\n[The tutor could not finish this answer. Try asking again in a moment.]'));
        await logEvent('tutor_answer_shown', {
          item_id: ctx.params.id, item_version: b.version, turn_index: turnIndex, model: tutorModel(),
          error: e instanceof Error ? e.message.slice(0, 300) : 'unknown', latency_ms: Date.now() - started,
        }).catch(() => {});
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
});

/** Whether the tutor is switched on, and how many questions are left today. */
export const GET = handle(async () => {
  const u = await requireApiUser();
  const used = await one<{ n: string }>(
    `SELECT count(*) AS n FROM event WHERE user_id = $1 AND event_type = 'tutor_question_asked'
        AND client_ts >= date_trunc('day', now() AT TIME ZONE 'Australia/Adelaide') AT TIME ZONE 'Australia/Adelaide'`, [u.id]);
  return json({ available: tutorAvailable(), remaining: Math.max(0, tutorDailyLimit() - Number(used?.n ?? 0)) });
});
