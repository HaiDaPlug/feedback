import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../client';
import {
  eventAccessTokens,
  events,
  formVersions,
  questions,
  responses,
} from '../schema';
import { buildTemplateQuestions } from '@/lib/form/default-template';
import { generateToken, hashToken, tokenPrefix } from '@/lib/tokens';
import { decryptToken, encryptToken } from '@/lib/token-crypto';
import type { FormQuestion } from '@/lib/form/types';
import type { EventCreateInput } from '@/lib/validation/schemas';
import { isUuid } from '@/lib/validation/uuid';

/** Event summary rendered on the dashboard list. */
export type EventSummary = {
  id: string;
  name: string;
  eventDate: string;
  location: string | null;
  status: 'draft' | 'open' | 'closed';
  responseCount: number;
};

export async function listEvents(orgId: string): Promise<EventSummary[]> {
  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      eventDate: events.eventDate,
      location: events.location,
      status: events.status,
      responseCount: sql<number>`cast(count(${responses.id}) as int)`,
    })
    .from(events)
    .leftJoin(responses, eq(responses.eventId, events.id))
    .where(eq(events.orgId, orgId))
    .groupBy(events.id)
    .orderBy(desc(events.eventDate), desc(events.createdAt));

  return rows;
}

export async function getEvent(eventId: string, orgId: string) {
  // A non-UUID from the URL (e.g. /events/new/preview) is "not found", not a
  // database error.
  if (!isUuid(eventId)) return null;

  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.orgId, orgId)))
    .limit(1);

  return row ?? null;
}

/**
 * Create an event, its first form version preloaded with the default template,
 * and its first access token -- so the moderator lands in a workspace that is
 * immediately shareable once they open collection.
 */
export async function createEvent(
  orgId: string,
  userId: string,
  input: EventCreateInput,
): Promise<{ eventId: string }> {
  const [event] = await db
    .insert(events)
    .values({
      orgId,
      name: input.name,
      eventDate: input.eventDate,
      location: input.location || null,
      welcomeMessage: input.welcomeMessage || null,
      status: 'draft',
      createdBy: userId,
    })
    .returning({ id: events.id });

  const [version] = await db
    .insert(formVersions)
    .values({ eventId: event.id, versionNumber: 1 })
    .returning({ id: formVersions.id });

  await db.insert(questions).values(buildTemplateQuestions(version.id));

  await db
    .update(events)
    .set({ currentFormVersionId: version.id })
    .where(eq(events.id, event.id));

  await issueAccessToken(event.id);

  return { eventId: event.id };
}

export async function updateEvent(
  eventId: string,
  orgId: string,
  input: Partial<EventCreateInput>,
): Promise<void> {
  await db
    .update(events)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.eventDate !== undefined ? { eventDate: input.eventDate } : {}),
      ...(input.location !== undefined ? { location: input.location || null } : {}),
      ...(input.welcomeMessage !== undefined
        ? { welcomeMessage: input.welcomeMessage || null }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(events.id, eventId), eq(events.orgId, orgId)));
}

export async function setEventStatus(
  eventId: string,
  orgId: string,
  status: 'draft' | 'open' | 'closed',
): Promise<void> {
  await db
    .update(events)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(events.id, eventId), eq(events.orgId, orgId)));
}

// ---------------------------------------------------------------------------
// Access tokens
// ---------------------------------------------------------------------------

/**
 * Issue a fresh token for an event and revoke any previous one.
 *
 * Returns the PLAINTEXT token. This is the only moment it exists outside the
 * participant's URL -- it is never stored and never recoverable afterwards, so
 * the caller must surface it immediately. Rotating leaves `responses` untouched.
 */
export async function issueAccessToken(eventId: string): Promise<string> {
  const token = generateToken();

  await db
    .update(eventAccessTokens)
    .set({ active: false, revokedAt: new Date() })
    .where(and(eq(eventAccessTokens.eventId, eventId), eq(eventAccessTokens.active, true)));

  await db.insert(eventAccessTokens).values({
    eventId,
    tokenHash: hashToken(token),
    tokenEncrypted: encryptToken(token),
    tokenPrefix: tokenPrefix(token),
    active: true,
  });

  return token;
}

/**
 * The live token for an event, decrypted for moderator display.
 *
 * Only ever called from authenticated moderator routes. Returns null when no
 * active token exists, or when the stored ciphertext cannot be decrypted (for
 * example after a TOKEN_ENCRYPTION_KEY change), in which case the Share page
 * offers to generate a fresh link rather than failing.
 */
export async function getActiveToken(
  eventId: string,
): Promise<{ token: string; createdAt: Date } | null> {
  const [row] = await db
    .select({
      tokenEncrypted: eventAccessTokens.tokenEncrypted,
      createdAt: eventAccessTokens.createdAt,
    })
    .from(eventAccessTokens)
    .where(and(eq(eventAccessTokens.eventId, eventId), eq(eventAccessTokens.active, true)))
    .limit(1);

  if (!row) return null;

  const token = decryptToken(row.tokenEncrypted);
  if (!token) return null;

  return { token, createdAt: row.createdAt };
}

// ---------------------------------------------------------------------------
// Form versions and questions
// ---------------------------------------------------------------------------

export async function getQuestions(formVersionId: string): Promise<FormQuestion[]> {
  const rows = await db
    .select()
    .from(questions)
    .where(eq(questions.formVersionId, formVersionId))
    .orderBy(asc(questions.position));

  return rows.map((row) => ({
    id: row.id,
    position: row.position,
    type: row.type,
    label: row.label,
    helpText: row.helpText,
    required: row.required,
    options: row.options ?? [],
    visibleWhenQuestionId: row.visibleWhenQuestionId,
    visibleWhenOptionId: row.visibleWhenOptionId,
  }));
}

/** Number of responses recorded against a specific form version. */
export async function countResponsesForVersion(formVersionId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(responses)
    .where(eq(responses.formVersionId, formVersionId));

  return row?.count ?? 0;
}

export async function countResponsesForEvent(eventId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(responses)
    .where(eq(responses.eventId, eventId));

  return row?.count ?? 0;
}
