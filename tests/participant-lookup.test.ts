import { describe, expect, it, vi } from 'vitest';

/**
 * The participant lookup path.
 *
 * `lib/db/client` is mocked so these run without a database: the point is to
 * prove the guard behaviour around the query, not the query itself (which the
 * integration tests cover against real Postgres).
 */

const selectMock = vi.fn();

vi.mock('@/lib/db/client', () => ({
  db: {
    get select() {
      return selectMock;
    },
  },
}));

const { FormLookupError, getFormByToken } = await import('@/lib/db/queries/participant');

describe('getFormByToken', () => {
  it('rejects a malformed token without querying the database', async () => {
    selectMock.mockClear();

    for (const bad of ['', 'abc', 'has spaces here and is long', "'; DROP TABLE x; --"]) {
      expect(await getFormByToken(bad)).toBeNull();
    }

    // A scan of junk URLs must not generate database load.
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('raises FormLookupError when the database is unreachable', async () => {
    selectMock.mockClear();
    selectMock.mockImplementation(() => {
      throw new Error('fetch failed');
    });

    // A well-formed token that reaches the database during an outage must be
    // distinguishable from an invalid token, so the participant is told to
    // retry rather than that their link is broken.
    await expect(getFormByToken('A'.repeat(43))).rejects.toBeInstanceOf(FormLookupError);
  });
});
