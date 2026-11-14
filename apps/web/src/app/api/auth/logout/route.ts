import { NextResponse } from 'next/server';
import { checkOrigin, handle } from '@/lib/http';
import { endSession, SESSION_COOKIE } from '@/lib/auth';

export const POST = handle(async (req: Request) => {
  checkOrigin(req);
  await endSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: '', path: '/', maxAge: 0 });
  return res;
});
