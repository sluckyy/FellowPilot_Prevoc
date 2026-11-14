import { checkOrigin, handle, json, readJson, requireApiUser, HttpError } from '@/lib/http';
import { goalPlanErrors, toGoalPlan } from '@/lib/core';
import { currentPlan, savePlan } from '@/lib/plan';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const u = await requireApiUser();
  return json({ plan: await currentPlan(u.id) });
});

/** Creates the onboarding goal plan, or a revised one at a check-in. Body: GoalPlanInput. */
export const POST = handle(async (req: Request) => {
  checkOrigin(req);
  const u = await requireApiUser();
  const input = toGoalPlan(await readJson(req, 32 * 1024));
  const errors = goalPlanErrors(input);
  if (Object.keys(errors).length) throw Object.assign(new HttpError(400, 'Check the highlighted fields'), { errors });
  const r = await savePlan(u, input);
  return json({ ok: true, ...r });
});
