import 'server-only';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Reflection text at rest: AES-256-GCM with a key derived per trainee from the app secret, so an
 * export of the table shows nothing readable and one trainee's key never opens another's entries.
 * Layout: 12-byte nonce || ciphertext || 16-byte tag.
 */
function secret(): Buffer {
  const s = process.env.REFLECTION_SECRET ?? process.env.SESSION_SECRET;
  if (s && s.length >= 32) return Buffer.from(s);
  if (process.env.NODE_ENV === 'production' && !process.env.E2E) throw new Error('SESSION_SECRET is not set');
  return Buffer.from('development-only-reflection-secret-not-for-production');
}

const keyFor = (userId: string) => Buffer.from(hkdfSync('sha256', secret(), userId, 'fellowpilot-reflection-v1', 32));

export function encryptFor(userId: string, text: string): Buffer {
  const nonce = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyFor(userId), nonce);
  const ct = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return Buffer.concat([nonce, ct, c.getAuthTag()]);
}

export function decryptFor(userId: string, blob: Buffer): string {
  const nonce = blob.subarray(0, 12), tag = blob.subarray(blob.length - 16), ct = blob.subarray(12, blob.length - 16);
  const d = createDecipheriv('aes-256-gcm', keyFor(userId), nonce);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}
