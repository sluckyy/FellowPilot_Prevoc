import { handle, json, requireApiUser } from '@/lib/http';
import { answerRows } from '@/lib/data';
import { loadProgress } from '@/lib/progress';

export const dynamic = 'force-dynamic';

/** Streak and any achievements earned but not yet seen; used by the end-of-set summary. */
export const GET = handle(async () => {
  const u = await requireApiUser();
  const p = await loadProgress(u, await answerRows(u.id));
  return json({
    goal: p.goal, this_week: p.thisWeek, streak: p.streak.streak, freezes: p.streak.freezes, met_this_week: p.streak.metThisWeek,
    new_achievements: p.unseen.map((a) => ({ id: a.def.id, title: a.def.title, description: a.def.description })),
  });
});
