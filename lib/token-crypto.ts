import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Reversible protection for participant access tokens.
 *
 * WHY THIS EXISTS: a moderator must be able to re-open the Share page days
 * later and see the same link -- if we stored only a one-way hash, the link
 * would be unrecoverable and every visit would force a rotation, invalidating
 * QR codes already printed and displayed at a venue.
 *
 * So alongside the lookup hash we store the token encrypted with AES-256-GCM
 * under a server-only key (TOKEN_ENCRYPTION_KEY). The security properties:
 *
 *   - The database alone is not enough to produce a working link. An attacker
 *     with a database dump but no key gets ciphertext.
 *   - The key lives only in the server environment, never in the database and
 *     never in client-side code.
 *   - Lookup still happens by SHA-256 hash, so decryption is never needed on
 *     the participant path -- only when a moderator views the Share page.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;

  if (!secret) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is not set. Generate one with:\n' +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }

  // Accept either a 32-byte base64 key or any passphrase, normalised to 32
  // bytes. A random base64 key is strongly preferred.
  const raw = Buffer.from(secret, 'base64');
  if (raw.length === 32) return raw;

  return createHash('sha256').update(secret).digest();
}

/** Encrypt a token for storage. Returns base64 of iv || authTag || ciphertext. */
export function encryptToken(token: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/**
 * Decrypt a stored token. Returns null if the value is corrupt or was encrypted
 * under a different key, so a key rotation degrades to "link not viewable"
 * rather than crashing the Share page.
 */
export function decryptToken(stored: string): string | null {
  try {
    const buffer = Buffer.from(stored, 'base64');
    if (buffer.length <= IV_LENGTH + AUTH_TAG_LENGTH) return null;

    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
