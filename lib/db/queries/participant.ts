import { and, eq } from 'drizzle-orm';
import { db } from '../client';
import { answers, eventAccessTokens, events, responses } from '../schema';
import { getQuestions } from './events';
import { hashToken, isWellFormedToken } from '@/lib/tokens';
import type { AnswerMap, FormQuestion } from '@/lib/form/types';

/**
 * Participant-facing data access.
 *
 * Everything here is reached WITHOUT authentication, so each function returns
 * only what is needed to render or submit the form -- never the org, the
 * moderator, other events, or any existing feedback.
 */

export type PublicForm = {
  eventId: string;
  eventName: string;
  eventDate: string;
  location: string | null;
  welcomeMessage: string | null;
  status: 'draft' | 'open' | 'closed';
  formVersionId: string;
  questions: FormQuestion[];
};

/**
 * Raised when the form lookup could not complete -- a database outage rather
 * than a bad token. Kept distinct from `null` so callers can say "try again"
 * instead of wrongly telling someone their link is invalid.
 */
export class FormLookupError extends Error {
  constructor() {
    super('Feedback form lookup failed.');
    this.name = 'FormLookupError';
  }
}

/**
 * Resolve a participant token to its event and current form.
 *
 * Returns null when the token is malformed, unknown, or revoked -- callers
 * render an identical "link not valid" page for all three so a probe cannot
 * distinguish a wrong token from a rotated one.
 *
 * Throws FormLookupError if the database is unreachable.
 */
export async function getFormByToken(token: string): Promise<PublicForm | null> {
  if (!isWellFormedToken(token)) return null;

  let row;
  try {
    [row] = await db
      .select({
        eventId: events.id,
        eventName: events.name,
        eventDate: events.eventDate,
        location: events.location,
        welcomeMessage: events.welcomeMessage,
        status: events.status,
        formVersionId: events.currentFormVersionId,
      })
      .from(eventAccessTokens)
      .innerJoin(events, eq(events.id, eventAccessTokens.eventId))
      .where(
        and(
          eq(eventAccessTokens.tokenHash, hashToken(token)),
          eq(eventAccessTokens.active, true),
        ),
      )
      .limit(1);
  } catch {
    // A database outage must not surface a raw 500 to someone standing at a
    // venue with their phone out. Distinguished from "no such token" so the
    // caller can say "try again" rather than "your link is invalid" -- telling
    // someone their link is broken when it isn't would send them hunting for a
    // new one. The error is deliberately not logged with the token.
    throw new FormLookupError();
  }

  if (!row || !row.formVersionId) return null;

  return {
    ...row,
    formVersionId: row.formVersionId,
    questions: await getQuestions(row.formVersionId),
  };
}

export type SubmitOutcome =
  | { ok: true; duplicate: boolean }
  | { ok: false; reason: 'closed' | 'stale_version' };

/**
 * Persist one anonymous submission.
 *
 * Re-checks event status inside the write path -- not just at page load -- so a
 * form left open in a browser cannot be submitted after the moderator closes
 * collection.
 *
 * Idempotency: a repeat of the same key returns `duplicate: true` without
 * inserting, so a retry after a network failure never creates a second record.
 */
export async function submitResponse(params: {
  eventId: string;
  formVersionId: string;
  idempotencyKey: string;
  answers: AnswerMap;
  questions: FormQuestion[];
}): Promise<SubmitOutcome> {
  const { eventId, formVersionId, idempotencyKey, questions } = params;

  // Status is re-read here rather than trusted from the page render.
  const [event] = await db
    .select({ status: events.status, currentFormVersionId: events.currentFormVersionId })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event || event.status !== 'open') return { ok: false, reason: 'closed' };

  // The participant must be submitting the form version they were served. If a
  // moderator edited the form mid-answer, a new version exists and the answers
  // may no longer line up with the questions.
  if (event.currentFormVersionId !== formVersionId) {
    return { ok: false, reason: 'stale_version' };
  }

  const existing = await db
    .select({ id: responses.id })
    .from(responses)
    .where(
      and(
        eq(responses.eventId, eventId),
        eq(responses.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);

  if (existing.length > 0) return { ok: true, duplicate: true };

  // Date only -- see the anonymity note on the `responses` table.
  const submittedOn = new Date().toISOString().slice(0, 10);

  const inserted = await db
    .insert(responses)
    .values({ eventId, formVersionId, idempotencyKey, submittedOn })
    .onConflictDoNothing({
      target: [responses.eventId, responses.idempotencyKey],
    })
    .returning({ id: responses.id });

  // A concurrent double-tap lost the race; the other request stored the answer.
  if (inserted.length === 0) return { ok: true, duplicate: true };

  const responseId = inserted[0].id;
  const questionsById = new Map(questions.map((q) => [q.id, q]));

  const answerRows = Object.entries(params.answers)
    .map(([questionId, value]) => {
      const question = questionsById.get(questionId);
      if (!question) return null;

      return {
        responseId,
        questionId,
        valueText:
          question.type === 'short_text' || question.type === 'long_text'
            ? (value.text?.trim() || null)
            : null,
        valueNumber: question.type === 'rating' ? (value.number ?? null) : null,
        valueOptionIds:
          question.type === 'single_choice' || question.type === 'multi_choice'
            ? (value.optionIds ?? [])
            : [],
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    // Skip rows where the participant left an optional question untouched.
    .filter(
      (row) =>
        row.valueText !== null ||
        row.valueNumber !== null ||
        row.valueOptionIds.length > 0,
    );

  if (answerRows.length > 0) {
    await db.insert(answers).values(answerRows);
  }

  return { ok: true, duplicate: false };
}
