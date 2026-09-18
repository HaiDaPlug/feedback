import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Participant access tokens.
 *
 * A token is 32 random bytes rendered base64url (43 characters). Possession of
 * the token IS the access mechanism for a feedback form, so:
 *
 *   - Only the SHA-256 hash is persisted. A database leak yields no live links.
 *   - Tokens are never written to logs or error messages.
 *   - Lookup is by hash, which is a constant-time indexed equality in Postgres.
 */

const TOKEN_BYTES = 32;
const PREFIX_LENGTH = 8;

/** Base64url character set, plus a length bound to reject junk cheaply. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Short, non-secret fragment shown in the moderator UI so a moderator can tell
 * which link is currently live without the server handing back the secret.
 */
export function tokenPrefix(token: string): string {
  return token.slice(0, PREFIX_LENGTH);
}

/**
 * Cheap structural check before touching the database. Rejects obviously
 * malformed values so a scan of random URLs does not cause query load.
 */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

/** Constant-time comparison of two hex digests. */
export function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Absolute participant URL for a token, used for copy-link and QR rendering. */
export function feedbackUrl(token: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/f/${token}`;
}
