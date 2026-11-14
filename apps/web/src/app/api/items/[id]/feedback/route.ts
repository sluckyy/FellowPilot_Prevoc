import { handle, json, requireApiUser, HttpError } from '@/lib/http';
import { feedbackFor } from '@/lib/data';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

/** Explanations for a question this trainee has already answered (e.g. after answering offline). */
export const GET = handle(async (req: Request, ctx: { params: { id: string } }) => {
  const u = await requireApiUser();
  const version = Number(new URL(req.url).searchParams.get('version'));
  if (!UUID.test(ctx.params.id) || !Number.isInteger(version)) throw new HttpError(400, 'Bad question reference');
  const f = await feedbackFor(u.id, ctx.params.id, version);
  if (!f) throw new HttpError(403, 'Answer the question first');
  return json(f);
});
