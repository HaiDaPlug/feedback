import { beforeAll, describe, expect, it } from 'vitest';
import {
  feedbackUrl,
  generateToken,
  hashToken,
  hashesEqual,
  isWellFormedToken,
  tokenPrefix,
} from '@/lib/tokens';
import { decryptToken, encryptToken } from '@/lib/token-crypto';

describe('generateToken', () => {
  it('produces a URL-safe token of usable length', () => {
    const token = generateToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it('produces a different token each time', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateToken()));
    expect(tokens.size).toBe(200);
  });
});

describe('hashToken', () => {
  it('is deterministic', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('differs for different tokens', () => {
    expect(hashToken(generateToken())).not.toBe(hashToken(generateToken()));
  });

  it('does not reveal the token', () => {
    const token = generateToken();
    expect(hashToken(token)).not.toContain(token);
  });
});

describe('isWellFormedToken', () => {
  it('accepts a generated token', () => {
    expect(isWellFormedToken(generateToken())).toBe(true);
  });

  it('rejects junk before it reaches the database', () => {
    expect(isWellFormedToken('')).toBe(false);
    expect(isWellFormedToken('short')).toBe(false);
    expect(isWellFormedToken('has spaces in it and is long enough')).toBe(false);
    expect(isWellFormedToken("'; DROP TABLE responses; --")).toBe(false);
    expect(isWellFormedToken(null)).toBe(false);
    expect(isWellFormedToken(123)).toBe(false);
  });
});

describe('hashesEqual', () => {
  it('matches identical digests', () => {
    const digest = hashToken('a');
    expect(hashesEqual(digest, digest)).toBe(true);
  });

  it('rejects different digests', () => {
    expect(hashesEqual(hashToken('a'), hashToken('b'))).toBe(false);
  });

  it('rejects empty input', () => {
    expect(hashesEqual('', '')).toBe(false);
  });
});

describe('feedbackUrl', () => {
  it('builds the participant URL', () => {
    expect(feedbackUrl('abc', 'https://feedback.helpbnk.com')).toBe(
      'https://feedback.helpbnk.com/f/abc',
    );
  });

  it('tolerates a trailing slash on the base URL', () => {
    expect(feedbackUrl('abc', 'https://feedback.helpbnk.com/')).toBe(
      'https://feedback.helpbnk.com/f/abc',
    );
  });

  it('never embeds a participant identity', () => {
    const url = feedbackUrl(generateToken(), 'https://example.com');
    expect(url.split('/f/')[1]).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('token encryption', () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  it('round-trips a token', () => {
    const token = generateToken();
    expect(decryptToken(encryptToken(token))).toBe(token);
  });

  it('produces different ciphertext for the same token', () => {
    // Random IV per encryption, so identical plaintext is not identifiable.
    const token = generateToken();
    expect(encryptToken(token)).not.toBe(encryptToken(token));
  });

  it('returns null for corrupt ciphertext rather than throwing', () => {
    expect(decryptToken('not-valid-base64-ciphertext')).toBeNull();
  });

  it('returns null when the key does not match', () => {
    const encrypted = encryptToken(generateToken());
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');

    expect(decryptToken(encrypted)).toBeNull();

    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });
});

describe('tokenPrefix', () => {
  it('is short enough not to weaken the token', () => {
    const token = generateToken();
    const prefix = tokenPrefix(token);

    expect(prefix.length).toBe(8);
    expect(token.startsWith(prefix)).toBe(true);
  });
});
