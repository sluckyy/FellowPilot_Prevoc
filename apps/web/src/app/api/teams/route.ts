import { checkOrigin, handle, json, readJson, requireApiUser, HttpError } from '@/lib/http';
import { createTeam, joinTeam, leaveTeam, myTeam } from '@/lib/teams';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => json({ team: await myTeam((await requireApiUser()).id) }));

/** Body: { action: 'create', name, kind } | { action: 'join', code } | { action: 'leave' } */
export const POST = handle(async (req: Request) => {
  checkOrigin(req);
  const u = await requireApiUser();
  const b = await readJson<{ action?: unknown; name?: unknown; kind?: unknown; code?: unknown }>(req, 4096);
  switch (b.action) {
    case 'create': return json({ ok: true, team: await createTeam(u, typeof b.name === 'string' ? b.name : '', typeof b.kind === 'string' ? b.kind : 'site') });
    case 'join': return json({ ok: true, team: await joinTeam(u, typeof b.code === 'string' ? b.code : '') });
    case 'leave': await leaveTeam(u); return json({ ok: true, team: null });
    default: throw new HttpError(400, 'Unknown action');
  }
});
