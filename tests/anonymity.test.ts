import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answers, responses } from '@/lib/db/schema';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * Structural guards on the anonymity guarantee.
 *
 * These assert on the SHAPE of the schema rather than on behaviour, because the
 * guarantee is enforced by the absence of columns. If someone later adds an
 * `ip_address` or `user_id` to responses, these fail loudly.
 */

const FORBIDDEN_COLUMNS = [
  'user_id',
  'participant_id',
  'ip',
  'ip_address',
  'user_agent',
  'useragent',
  'fingerprint',
  'device_id',
  'session_id',
  'email',
  'name',
  'phone',
];

/**
 * Read the physical column names off a Drizzle table. Typed loosely on purpose:
 * we are inspecting the table's shape, which is exactly what these guards test.
 */
function columnNames(table: object): string[] {
  return Object.values(table as Record<string, unknown>)
    .filter(
      (column): column is { name: string } =>
        typeof column === 'object' &&
        column !== null &&
        'name' in column &&
        typeof (column as { name: unknown }).name === 'string',
    )
    .map((column) => column.name.toLowerCase());
}

describe('responses table', () => {
  const columns = columnNames(responses);

  it('has no column capable of identifying a participant', () => {
    for (const forbidden of FORBIDDEN_COLUMNS) {
      expect(columns).not.toContain(forbidden);
    }
  });

  it('stores only a coarse date, not a wall-clock submission time', () => {
    expect(columns).toContain('submitted_on');
    // A `created_at`/`submitted_at` timestamp would let a small event be
    // de-anonymised by correlating with who left the room when.
    expect(columns).not.toContain('created_at');
    expect(columns).not.toContain('submitted_at');
  });

  it('keeps the idempotency key, which is the only per-submission value', () => {
    expect(columns).toContain('idempotency_key');
  });
});

describe('answers table', () => {
  it('has no column capable of identifying a participant', () => {
    const columns = columnNames(answers);

    for (const forbidden of FORBIDDEN_COLUMNS) {
      expect(columns).not.toContain(forbidden);
    }
  });
});

describe('generated migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'drizzle', '0000_init.sql'),
    'utf8',
  ).toLowerCase();

  it('creates no identifying column on responses or answers', () => {
    // Crude but effective: these substrings must not appear anywhere in the
    // migration, since no table in this schema legitimately needs them.
    for (const forbidden of ['ip_address', 'user_agent', 'fingerprint', 'device_id']) {
      expect(sql).not.toContain(forbidden);
    }
  });
});

describe('rate limiting', () => {
  it('allows normal use and blocks a flood', () => {
    const ip = '203.0.113.42';
    const results = Array.from({ length: 15 }, () => checkRateLimit(ip));

    expect(results[0].allowed).toBe(true);
    expect(results.at(-1)?.allowed).toBe(false);
  });

  it('never blocks when no IP is available', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(checkRateLimit(null).allowed).toBe(true);
    }
  });

  it('keeps separate buckets per client', () => {
    const flooder = '198.51.100.1';
    for (let i = 0; i < 15; i += 1) checkRateLimit(flooder);

    // A different visitor is unaffected by someone else's flood.
    expect(checkRateLimit('198.51.100.2').allowed).toBe(true);
  });
});
