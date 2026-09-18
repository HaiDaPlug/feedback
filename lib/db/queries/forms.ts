import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
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
 *
 * Data-safety rules for the write itself (the HTTP driver has no
 * transactions, so the ORDER of statements is the safety mechanism):
 *
 *   1. Never delete before the replacement is in place. Rows are upserted
 *      first; only then are rows that are no longer wanted pruned. A failure
 *      at any point leaves the version with at least what it had.
 *   2. An incoming id that belongs to a question in ANOTHER version (typical
 *      after a clone, when the browser still holds the old ids) is re-keyed
 *      rather than allowed to collide with that version's primary key.
 *   3. The upsert only ever updates rows inside the target version, so a
 *      question that has been answered in an older version cannot be moved
 *      or rewritten by a later save.
 *   4. The event's pointer to a cloned version moves last, after the clone
 *      is fully written, so an interrupted save leaves the event on the
 *      old, intact version.
 */

export class QuestionsSaveError extends Error {}

/**
 * Persist an edited question set for an event.
 *
 * Returns the form version the questions were written to -- which may be a new
 * one if the current version had already collected responses -- and the saved
 * questions with their canonical ids, which callers should adopt.
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

  // --- Resolve ids -----------------------------------------------------------
  //
  // Map client-supplied ids onto ids valid within the target version. When we
  // cloned, the incoming ids refer to the OLD version's questions, so they are
  // re-keyed by position (the clone preserves order).
  const idMap = new Map<string, string>();

  if (targetVersionId !== currentFormVersionId) {
    const oldQuestions = await getQuestions(currentFormVersionId);
    const newQuestions = await getQuestions(targetVersionId);
    oldQuestions.forEach((oldQ, index) => {
      const newQ = newQuestions[index];
      if (newQ) idMap.set(oldQ.id, newQ.id);
    });
  }

  // Any id that still points at a question OUTSIDE the target version (a
  // browser holding ids from before an earlier clone, or a stray collision)
  // gets a fresh id. Without this, the insert would hit the primary key of
  // the older version's row.
  const candidateIds = input
    .map((q) => (q.id ? (idMap.get(q.id) ?? q.id) : null))
    .filter((id): id is string => Boolean(id));

  if (candidateIds.length > 0) {
    const foreign = await db
      .select({ id: questions.id })
      .from(questions)
      .where(
        and(
          inArray(questions.id, candidateIds),
          sql`${questions.formVersionId} <> ${targetVersionId}`,
        ),
      );
    for (const row of foreign) {
      // Find which incoming id resolved to this foreign id and re-key it.
      for (const q of input) {
        if (!q.id) continue;
        const resolved = idMap.get(q.id) ?? q.id;
        if (resolved === row.id) idMap.set(q.id, randomUUID());
      }
    }
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

  // --- Write: upsert first, prune second ------------------------------------
  //
  // Two passes because positions are unique-ish semantically (not enforced
  // by the schema), so a straight upsert is safe; existing rows keep their id
  // and are updated in place, new rows are inserted.
  if (rows.length > 0) {
    await db
      .insert(questions)
      .values(rows)
      .onConflictDoUpdate({
        target: questions.id,
        set: {
          position: sql`excluded.position`,
          type: sql`excluded.type`,
          label: sql`excluded.label`,
          helpText: sql`excluded.help_text`,
          required: sql`excluded.required`,
          options: sql`excluded.options`,
          visibleWhenQuestionId: sql`excluded.visible_when_question_id`,
          visibleWhenOptionId: sql`excluded.visible_when_option_id`,
        },
        // Rule 3: never touch a row that lives in another version.
        setWhere: eq(questions.formVersionId, targetVersionId),
      });
  }

  // Remove questions the moderator deleted. Rows that were answered cannot be
  // in this version (a version with responses is cloned, never edited), and
  // the database additionally refuses to delete an answered question.
  await db
    .delete(questions)
    .where(
      rows.length > 0
        ? and(
            eq(questions.formVersionId, targetVersionId),
            notInArray(questions.id, rows.map((r) => r.id)),
          )
        : eq(questions.formVersionId, targetVersionId),
    );

  // Verify the write landed as intended before moving the event's pointer.
  const saved = await getQuestions(targetVersionId);
  if (saved.length !== rows.length) {
    throw new QuestionsSaveError(
      `Expected ${rows.length} questions after save, found ${saved.length}.`,
    );
  }

  if (targetVersionId !== currentFormVersionId) {
    await db
      .update(events)
      .set({ currentFormVersionId: targetVersionId, updatedAt: new Date() })
      .where(eq(events.id, eventId));
  }

  return { formVersionId: targetVersionId, questions: saved };
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
