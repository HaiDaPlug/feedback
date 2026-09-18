const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Structural check for ids taken from a URL. Postgres raises an error, not a
 * "no rows" result, when a non-UUID is compared to a uuid column, which would
 * turn a mistyped link into a 500. Callers treat a non-UUID as "not found".
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
