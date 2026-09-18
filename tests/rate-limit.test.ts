import { describe, expect, it } from 'vitest';
import {
  checkRateLimit,
  LOGIN_EMAIL_LIMIT,
  LOGIN_IP_LIMIT,
  SUBMIT_LIMIT,
} from '@/lib/rate-limit';

describe('rate limit policies', () => {
  it('blocks an account after the login budget and reports a retry delay', () => {
    const email = `target-${Math.random()}@example.com`;
    for (let i = 0; i < LOGIN_EMAIL_LIMIT.max; i++) {
      expect(checkRateLimit(email, LOGIN_EMAIL_LIMIT).allowed).toBe(true);
    }
    const blocked = checkRateLimit(email, LOGIN_EMAIL_LIMIT);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(LOGIN_EMAIL_LIMIT.windowMs / 1000);
  });

  it('keeps budgets independent per scope for the same subject', () => {
    const ip = `10.0.0.${Math.floor(Math.random() * 250)}-${Math.random()}`;
    for (let i = 0; i < SUBMIT_LIMIT.max; i++) checkRateLimit(ip, SUBMIT_LIMIT);
    expect(checkRateLimit(ip, SUBMIT_LIMIT).allowed).toBe(false);
    // Exhausting the submit budget must not lock the same address out of sign-in.
    expect(checkRateLimit(ip, LOGIN_IP_LIMIT).allowed).toBe(true);
  });

  it('never blocks when no subject is known', () => {
    expect(checkRateLimit(null, LOGIN_IP_LIMIT).allowed).toBe(true);
  });
});
