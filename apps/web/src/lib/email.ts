import 'server-only';
import { EmailClient } from '@azure/communication-email';
import { BRAND } from '@/brand/generated/brand';

export interface Mail { to: string; subject: string; text: string; html: string; link?: string }

// End-to-end tests read sign-in links from here instead of an inbox. Never populated in production.
const g = globalThis as unknown as { __mcqOutbox?: Mail[] };
export function testOutbox(): Mail[] {
  return (g.__mcqOutbox ??= []);
}

export async function sendMail(m: Mail): Promise<void> {
  const conn = process.env.EMAIL_CONNECTION;
  if (process.env.EMAIL_MODE === 'log' || !conn) {
    if (process.env.NODE_ENV === 'production' && !process.env.E2E) {
      throw new Error('EMAIL_CONNECTION is not set');
    }
    testOutbox().push(m);
    console.log(`[email] to=${m.to} subject="${m.subject}"`);
    return;
  }
  const client = new EmailClient(conn);
  const poller = await client.beginSend({
    senderAddress: process.env.EMAIL_SENDER ?? '',
    content: { subject: m.subject, plainText: m.text, html: m.html },
    recipients: { to: [{ address: m.to }] },
  });
  const res = await poller.pollUntilDone();
  if (res.status !== 'Succeeded') throw new Error(`Email send ${res.status}`);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function signInMail(to: string, link: string, invitedBy?: string): Mail {
  const intro = invitedBy
    ? `${invitedBy} has invited you to the ${BRAND.name} beta, practice questions, a reflective logbook and a progress map for prevocational doctors.`
    : `Here is your link to sign in to ${BRAND.name}.`;
  const c = BRAND.email;
  const text = `${intro}\n\nSign in: ${link}\n\nThe link works once and expires in 15 minutes. If you didn't ask for it, you can ignore this email.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:${c.ink};max-width:520px">
<p style="font-size:22px;font-weight:bold;margin:0 0 16px">${BRAND.wordmark.map((p) => `<span style="color:${p.light}">${esc(p.text)}</span>`).join('')}</p>
<p>${esc(intro)}</p>
<p><a href="${esc(link)}" style="display:inline-block;background:${c.primary};color:${c.onPrimary};padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Sign in to ${esc(BRAND.name)}</a></p>
<p style="color:${c.muted};font-size:14px">The link works once and expires in 15 minutes. If you didn't ask for it, you can ignore this email.</p></div>`;
  return { to, subject: invitedBy ? `Your invitation to ${BRAND.name}` : `Sign in to ${BRAND.name}`, text, html, link };
}
