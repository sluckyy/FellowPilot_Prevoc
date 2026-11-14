import { checkOrigin, handle, json, readJson, requireApiUser, HttpError } from '@/lib/http';
import { cleanBody, createReflection, listReflections } from '@/lib/reflections';
import { wordCount, REFLECTION_LIMITS } from '@/lib/core';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const u = await requireApiUser();
  return json({ reflections: await listReflections(u.id) });
});

/** Logs a reflection. Body: { body, tags: ["1.9", ...], prompt_id }. Returns keyword-suggested tags too. */
export const POST = handle(async (req: Request) => {
  checkOrigin(req);
  const u = await requireApiUser();
  const b = await readJson<{ body?: unknown; tags?: unknown; prompt_id?: unknown }>(req, 64 * 1024);
  const body = cleanBody(b.body);
  if (body.length < REFLECTION_LIMITS.min) throw new HttpError(400, 'Write a few sentences first.');
  if (wordCount(body) > 900) throw new HttpError(400, 'Keep a reflection under about 900 words (that is roughly a five-minute entry).');
  const r = await createReflection(u, body, b.tags, b.prompt_id);
  return json({ ok: true, ...r });
});
