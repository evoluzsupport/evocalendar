import crypto from 'crypto';

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET is not set');
  return s || 'dev-only-secret-change-me';
};

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const mac = (data: string) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

/** Signed, expiring token (used for the session cookie and OAuth state). */
export function sign(payload: Record<string, unknown>, ttlSec: number): string {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + ttlSec * 1000 }));
  return body + '.' + mac(body);
}
export function verify<T = any>(token?: string): T | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const good = mac(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

// AES-256-GCM for stored mailbox passwords
const key = () => crypto.createHash('sha256').update('enc:' + secret()).digest();
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64url')).join('.');
}
export function decrypt(blob: string): string {
  const [iv, tag, enc] = blob.split('.').map(s => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
export const uuid = () => crypto.randomUUID();
