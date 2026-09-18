'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { memberships, users } from '@/lib/db/schema';
import { assertEventInOrg, requireModeratorApi, requireModerator } from '@/lib/auth/guards';
import {
  createEvent,
  getEvent,
  issueAccessToken,
  setEventStatus,
  updateEvent,
} from '@/lib/db/queries/events';
import { saveQuestions } from '@/lib/db/queries/forms';
import { getQuestions } from '@/lib/db/queries/events';
import { validateForm } from '@/lib/form/validate-form';
import {
  eventCreateSchema,
  eventUpdateSchema,
  moderatorCreateSchema,
  questionsSaveSchema,
} from '@/lib/validation/schemas';

/**
 * Moderator server actions.
 *
 * Every action re-checks authorization server-side via `requireModeratorApi()`
 * and, where an event is involved, `assertEventInOrg()`. A server action is a
 * public HTTP endpoint -- being rendered inside an authenticated page is not a
 * guarantee that the caller is authorized.
 */

export type ActionResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

// --- Events ----------------------------------------------------------------

export async function createEventAction(formData: FormData) {
  const moderator = await requireModerator();

  const parsed = eventCreateSchema.safeParse({
    name: formData.get('name'),
    eventDate: formData.get('eventDate'),
    location: formData.get('location') ?? '',
    welcomeMessage: formData.get('welcomeMessage') ?? '',
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    // Re-render the create page with the message rather than throwing.
    redirect(`/events/new?error=${encodeURIComponent(first?.message ?? 'Invalid input.')}`);
  }

  const { eventId } = await createEvent(moderator.orgId, moderator.userId, parsed.data);

  revalidatePath('/dashboard');
  // Straight into the workspace -- no confirmation step.
  redirect(`/events/${eventId}`);
}

export async function updateEventAction(
  eventId: string,
  input: unknown,
): Promise<ActionResult> {
  const moderator = await requireModeratorApi();
  await assertEventInOrg(eventId, moderator.orgId);

  const parsed = eventUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  await updateEvent(eventId, moderator.orgId, parsed.data);
  revalidatePath(`/events/${eventId}`);
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function setEventStatusAction(
  eventId: string,
  status: 'draft' | 'open' | 'closed',
): Promise<ActionResult> {
  const moderator = await requireModeratorApi();
  await assertEventInOrg(eventId, moderator.orgId);

  // Opening collection requires a structurally valid form: no blank labels, no
  // choice question with fewer than two options, no broken conditional rules.
  if (status === 'open') {
    const event = await getEvent(eventId, moderator.orgId);
    if (!event?.currentFormVersionId) {
      return { ok: false, message: 'This event has no form yet.' };
    }

    const issues = validateForm(await getQuestions(event.currentFormVersionId));
    if (issues.length > 0) {
      return {
        ok: false,
        message: `Fix the form before opening: ${issues[0].message}`,
      };
    }
  }

  await setEventStatus(eventId, moderator.orgId, status);
  revalidatePath(`/events/${eventId}`, 'layout');
  revalidatePath('/dashboard');
  return { ok: true };
}

// --- Questions -------------------------------------------------------------

export async function saveQuestionsAction(
  eventId: string,
  input: unknown,
): Promise<ActionResult & { formVersionId?: string }> {
  const moderator = await requireModeratorApi();
  await assertEventInOrg(eventId, moderator.orgId);

  const parsed = questionsSaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: 'Some questions could not be saved.' };
  }

  const event = await getEvent(eventId, moderator.orgId);
  if (!event?.currentFormVersionId) {
    return { ok: false, message: 'This event has no form yet.' };
  }

  const result = await saveQuestions(
    eventId,
    event.currentFormVersionId,
    parsed.data.questions,
  );

  revalidatePath(`/events/${eventId}`, 'layout');
  return { ok: true, formVersionId: result.formVersionId };
}

// --- Access token ----------------------------------------------------------

/**
 * Rotate the participant link.
 *
 * Returns the new plaintext token, which is the only time it exists outside a
 * participant's URL. The old link stops working immediately for both loading
 * and submitting; existing feedback is untouched.
 */
export async function rotateTokenAction(
  eventId: string,
): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  const moderator = await requireModeratorApi();
  await assertEventInOrg(eventId, moderator.orgId);

  const token = await issueAccessToken(eventId);
  revalidatePath(`/events/${eventId}/share`);
  return { ok: true, token };
}

// --- Moderators (admin only) ----------------------------------------------

export async function addModeratorAction(input: unknown): Promise<ActionResult> {
  const moderator = await requireModeratorApi();
  if (moderator.role !== 'admin') {
    return { ok: false, message: 'Only administrators can add moderators.' };
  }

  const parsed = moderatorCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const { email, name, password, role } = parsed.data;

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  let userId: string;

  if (existing) {
    userId = existing.id;
  } else {
    const [created] = await db
      .insert(users)
      .values({
        email,
        name: name || null,
        passwordHash: await bcrypt.hash(password, 12),
      })
      .returning({ id: users.id });
    userId = created.id;
  }

  await db
    .insert(memberships)
    .values({ orgId: moderator.orgId, userId, role })
    .onConflictDoNothing();

  revalidatePath('/settings/moderators');
  return { ok: true };
}
