import { describe, expect, it } from 'vitest';
import { buildResponsesCsv, escapeCsvCell, toCsv } from '@/lib/results/csv';

/**
 * CSV exports are opened in spreadsheets, which execute leading-`=` cells as
 * formulas. Free-text feedback is attacker-controlled, so this is a real
 * injection surface, not a theoretical one.
 */
describe('escapeCsvCell', () => {
  it('neutralises a formula', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1");
  });

  it('neutralises every dangerous leading character', () => {
    expect(escapeCsvCell('+A1')).toBe("'+A1");
    expect(escapeCsvCell('-A1')).toBe("'-A1");
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('neutralises the classic command-execution payload', () => {
    const payload = '=cmd|\' /C calc\'!A0';
    const escaped = escapeCsvCell(payload);

    expect(escaped.startsWith("'=")).toBe(true);
  });

  it('quotes values containing a comma, quote, or newline', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeCsvCell('Great event, thanks')).toBe('"Great event, thanks"');
    expect(escapeCsvCell('Great event')).toBe('Great event');
  });

  it('renders null and undefined as empty', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });
});

describe('toCsv', () => {
  it('joins rows with CRLF', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d');
  });
});

describe('buildResponsesCsv', () => {
  const csv = buildResponsesCsv({
    eventName: 'Community Meetup',
    eventDate: '2026-09-01',
    location: 'Berlin',
    responses: [
      {
        label: 'Response 1',
        submittedOn: '2026-09-01',
        answers: [
          { label: 'How was the event overall?', display: '5 / 5' },
          { label: 'What could we improve?', display: '=HYPERLINK("evil")' },
        ],
      },
    ],
  });

  it('includes event details and question wording', () => {
    expect(csv).toContain('Community Meetup');
    expect(csv).toContain('How was the event overall?');
  });

  it('escapes a formula inside a written answer', () => {
    expect(csv).toContain("'=HYPERLINK");
  });

  it('contains no participant identifiers', () => {
    // Guard against a regression that adds identity columns to the export.
    for (const forbidden of [
      'idempotency',
      'token',
      'ip_address',
      'user_agent',
      'email',
    ]) {
      expect(csv.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('exposes only a coarse date, never a wall-clock time', () => {
    // No HH:MM patterns anywhere in the output.
    expect(csv).not.toMatch(/\d{2}:\d{2}/);
  });
});
