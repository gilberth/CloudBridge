import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM helpers for the few secrets CloudBridge has to store itself (the
 * optional rclone rc password set from Settings). The key is derived from
 * JWT_SECRET, so rotating that value invalidates the stored ciphertext — which
 * is the intended behaviour, not a silent decryption to garbage.
 */
function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(`cloudbridge:secretbox:${secret}`).digest();
}

export function encryptSecret(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptSecret(payload: string, secret: string): string | null {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const [, iv, tag, ciphertext] = parts as [string, string, string, string];
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

/** Replace a secret with a fixed-length mask for display. */
export function maskSecret(value: string | undefined | null): string {
  if (!value) return '';
  return '••••••••';
}
