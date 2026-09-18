import { randomUUID } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../client';
import { events, formVersions, questions } from '../schema';
import { countResponsesForVersion, getQuestions } from './events';
import type { FormQuestion } from '@/lib/form/types';
import type { QuestionInput } from '@/lib/validation/schemas';

/**
 * Form version management.
 *
 * The rule: a form version that has NO responses may be edited in place (the
 * normal case while drafting). The first edit AFTER a response exists clones
 * the version, so the exact wording and options a participant answered are
 * preserved forever.
 */

/**
 * Persist an edited question set for an event.
 *
 * Returns the form version the questions were written to -- which may be a new
 * one if the current version had already collected responses.
 */
export async function saveQuestions(
  eventId: string,
  currentFormVersionId: string,
  input: QuestionInput[],
): Promise<{ formVersionId: string; questions: FormQuestion[] }> {
  const existingResponses = await countResponsesForVersion(currentFormVersionId);

  const targetVersionId =
    existingResponses > 0
      ? await cloneFormVersion(eventId, currentFormVersionId)
      : currentFormVersionId;

  // Map any client-supplied ids onto ids valid within the target version.
  // When we cloned, the incoming ids refer to the OLD version's questions, so
  // they must be re-keyed; the clone preserves order, which is what we match on.
  const idMap = new Map<string, string>();

  if (targetVersionId !== currentFormVersionId) {
    const oldQuestions = await getQuestions(currentFormVersionId);
    const newQuestions = await getQuestions(targetVersionId);
    oldQuestions.forEach((oldQ, index) => {
      const newQ = newQuestions[index];
      if (newQ) idMap.set(oldQ.id, newQ.id);
    });
  }

  const resolveId = (id: string | null | undefined): string | null => {
    if (!id) return null;
    return idMap.get(id) ?? id;
  };

  // Assign ids up front so conditional rules can reference newly added
  // questions within this same save.
  const rows = input.map((question, index) => ({
    id: question.id ? resolveId(question.id)! : randomUUID(),
    formVersionId: targetVersionId,
    position: index,
    type: question.type,
    label: question.label,
    helpText: question.helpText ?? null,
    required: question.required,
    options: question.options,
    visibleWhenQuestionId: resolveId(question.visibleWhenQuestionId),
    visibleWhenOptionId: question.visibleWhenOptionId ?? null,
  }));

  // Drop rules that point at a question no longer present in the saved set.
  const presentIds = new Set(rows.map((r) => r.id));
  for (const row of rows) {
    if (row.visibleWhenQuestionId && !presentIds.has(row.visibleWhenQuestionId)) {
      row.visibleWhenQuestionId = null;
      row.visibleWhenOptionId = null;
    }
  }

  // Replace the version's question set wholesale. Safe because a version with
  // responses was cloned above, so we are never deleting answered questions.
  await db.delete(questions).where(eq(questions.formVersionId, targetVersionId));
  if (rows.length > 0) {
    await db.insert(questions).values(rows);
  }

  if (targetVersionId !== currentFormVersionId) {
    await db
      .update(events)
      .set({ currentFormVersionId: targetVersionId, updatedAt: new Date() })
      .where(eq(events.id, eventId));
  }

  return {
    formVersionId: targetVersionId,
    questions: await getQuestions(targetVersionId),
  };
}

/**
 * Create a new form version copying the current one's questions verbatim.
 * The original version and its questions are left untouched so existing
 * responses keep resolving to the wording they were given.
 */
async function cloneFormVersion(
  eventId: string,
  sourceVersionId: string,
): Promise<string> {
  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(${formVersions.versionNumber}), 0)` })
    .from(formVersions)
    .where(eq(formVersions.eventId, eventId));

  const nextNumber = (maxRow?.max ?? 0) + 1;

  const [created] = await db
    .insert(formVersions)
    .values({ eventId, versionNumber: nextNumber })
    .returning({ id: formVersions.id });

  const source = await db
    .select()
    .from(questions)
    .where(eq(questions.formVersionId, sourceVersionId))
    .orderBy(asc(questions.position));

  if (source.length > 0) {
    // Re-key ids so the clone's conditional rules point within the clone.
    const idMap = new Map(source.map((q) => [q.id, randomUUID()]));

    await db.insert(questions).values(
      source.map((q) => ({
        id: idMap.get(q.id)!,
        formVersionId: created.id,
        position: q.position,
        type: q.type,
        label: q.label,
        helpText: q.helpText,
        required: q.required,
        options: q.options,
        visibleWhenQuestionId: q.visibleWhenQuestionId
          ? (idMap.get(q.visibleWhenQuestionId) ?? null)
          : null,
        visibleWhenOptionId: q.visibleWhenOptionId,
      })),
    );
  }

  return created.id;
}
