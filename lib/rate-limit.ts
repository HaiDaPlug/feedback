import { createHash } from 'node:crypto';

/**
 * Proportionate abuse control, shared by the public submission endpoint and
 * moderator sign-in.
 *
 * ANONYMITY CONSTRAINT: the limiter must not create a link between a person and
 * their feedback. So it:
 *   - hashes the client key (IP, or email for sign-in) with a per-process
 *     random salt,
 *   - truncates that hash to 12 hex characters,
 *   - keeps it ONLY in this in-memory map with a short TTL, and
 *   - never writes it to the database, a log, or anything alongside a response.
 *
 * The salt is regenerated on every cold start, so the keys are not correlatable
 * across deployments or with any other system.
 *
 * Limitation: on serverless this is per-instance, so the effective limit is
 * looser than the configured number. It is a speed bump against casual flooding
 * and credential stuffing, not a hard guarantee. A shared-secret-link anonymous
 * form fundamentally cannot guarantee one response per human -- see
 * docs/ANONYMITY.md.
 */

export type RateLimitPolicy = {
  /** Namespace so the same IP has independent budgets per purpose. */
  scope: string;
  max: number;
  windowMs: number;
};

/** Public feedback submission: generous, one venue can share an IP. */
export const SUBMIT_LIMIT: RateLimitPolicy = { scope: 'submit', max: 10, windowMs: 60_000 };

/** Sign-in attempts from one address. */
export const LOGIN_IP_LIMIT: RateLimitPolicy = { scope: 'login-ip', max: 20, windowMs: 15 * 60_000 };

/** Sign-in attempts against one account, from anywhere. */
export const LOGIN_EMAIL_LIMIT: RateLimitPolicy = {
  scope: 'login-email',
  max: 10,
  windowMs: 15 * 60_000,
};

const SALT = createHash('sha256')
  .update(String(Math.random()) + String(process.pid) + String(Date.now()))
  .digest('hex');

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function keyFor(scope: string, subject: string): string {
  return scope + ':' + createHash('sha256').update(SALT).update(subject).digest('hex').slice(0, 12);
}

function sweep(now: number): void {
  // Bounded cleanup so the map cannot grow without limit on a warm instance.
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function checkRateLimit(
  subject: string | null,
  policy: RateLimitPolicy = SUBMIT_LIMIT,
): RateLimitResult {
  // No usable subject (local dev, proxy without the header) -> do not block.
  if (!subject) return { allowed: true, retryAfterSeconds: 0 };

  const now = Date.now();
  sweep(now);

  const key = keyFor(policy.scope, subject);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + policy.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;

  if (bucket.count > policy.max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Read the client IP for rate limiting only.
 *
 * The returned value is passed straight into `checkRateLimit`, hashed, and
 * discarded. It is never persisted.
 */
export function clientIpForRateLimit(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || null;
  return headers.get('x-real-ip');
}
