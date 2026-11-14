import { testOutbox } from '@/lib/email';

export const dynamic = 'force-dynamic';

/** End-to-end tests only: the most recent email sent to an address. 404 unless E2E=1. */
export async function GET(req: Request) {
  if (process.env.E2E !== '1') return new Response('Not found', { status: 404 });
  const to = new URL(req.url).searchParams.get('to')?.toLowerCase();
  const all = testOutbox().filter((m) => m.to.toLowerCase() === to);
  const mail = all.at(-1);
  return mail ? Response.json({ ...mail, count: all.length }) : new Response('Not found', { status: 404 });
}
