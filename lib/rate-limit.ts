import { createHash } from 'node:crypto';

/**
 * Proportionate abuse control for the public submission endpoint.
 *
 * ANONYMITY CONSTRAINT: the limiter must not create a link between a person and
 * their feedback. So it:
 *   - hashes the client IP with a per-process random salt,
 *   - truncates that hash to 12 hex characters,
 *   - keeps it ONLY in this in-memory map with a short TTL, and
 *   - never writes it to the database, a log, or anything alongside a response.
 *
 * The salt is regenerated on every cold start, so the keys are not correlatable
 * across deployments or with any other system.
 *
 * Limitation: on serverless this is per-instance, so the effective limit is
 * looser than the configured number. It is a speed bump against casual flooding,
 * not a hard guarantee. A shared-secret-link anonymous form fundamentally
 * cannot guarantee one response per human -- see docs/ANONYMITY.md.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

const SALT = createHash('sha256')
  .update(String(Math.random()) + String(process.pid) + String(Date.now()))
  .digest('hex');

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function keyFor(ip: string): string {
  return createHash('sha256').update(SALT).update(ip).digest('hex').slice(0, 12);
}

function sweep(now: number): void {
  // Bounded cleanup so the map cannot grow without limit on a warm instance.
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function checkRateLimit(ip: string | null): RateLimitResult {
  // No usable IP (local dev, proxy without the header) -> do not block.
  if (!ip) return { allowed: true, retryAfterSeconds: 0 };

  const now = Date.now();
  sweep(now);

  const key = keyFor(ip);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;

  if (bucket.count > MAX_REQUESTS) {
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
