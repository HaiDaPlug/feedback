/**
 * CSV export.
 *
 * Two properties matter here:
 *
 * 1. NO PARTICIPANT IDENTIFIERS. The export contains the event details, the
 *    question wording as it was asked, and the anonymous answers. It never
 *    includes the idempotency key, the access token, an IP, or a timestamp
 *    finer than the submission date.
 *
 * 2. FORMULA-INJECTION SAFE. A spreadsheet treats a cell beginning with
 *    = + - @ (or a leading tab/CR) as a formula, which turns free-text feedback
 *    into a code-execution vector when the file is opened. Every cell is
 *    neutralised below.
 */

const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Neutralise a value so a spreadsheet renders it as literal text, then apply
 * standard CSV quoting.
 */
export function escapeCsvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);

  // Prefix a single quote so Excel/Sheets/LibreOffice treat the cell as text.
  if (text.length > 0 && FORMULA_TRIGGERS.includes(text[0])) {
    text = `'${text}`;
  }

  // Standard CSV quoting: wrap when the value contains a delimiter, quote, or
  // newline; double any embedded quotes.
  if (/[",\n\r]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

export type CsvExportInput = {
  eventName: string;
  eventDate: string;
  location: string | null;
  responses: {
    label: string;
    submittedOn: string;
    answers: { label: string; display: string }[];
  }[];
};

/**
 * Build the export.
 *
 * Layout: a short event header block, then one row per response with a column
 * per distinct question wording. Questions are collected across all responses
 * so answers from an earlier form version keep their own column.
 */
export function buildResponsesCsv(input: CsvExportInput): string {
  const questionLabels: string[] = [];
  const seen = new Set<string>();

  for (const response of input.responses) {
    for (const answer of response.answers) {
      if (!seen.has(answer.label)) {
        seen.add(answer.label);
        questionLabels.push(answer.label);
      }
    }
  }

  const rows: unknown[][] = [
    ['Event', input.eventName],
    ['Event date', input.eventDate],
    ['Location', input.location ?? ''],
    ['Responses', input.responses.length],
    [],
    ['Response', 'Submitted on', ...questionLabels],
  ];

  for (const response of input.responses) {
    const byLabel = new Map(response.answers.map((a) => [a.label, a.display]));
    rows.push([
      response.label,
      response.submittedOn,
      ...questionLabels.map((label) => byLabel.get(label) ?? ''),
    ]);
  }

  return toCsv(rows);
}

/** Filename-safe slug for the download. */
export function csvFilename(eventName: string, eventDate: string): string {
  const slug = eventName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return `${slug || 'event'}-${eventDate}-feedback.csv`;
}
