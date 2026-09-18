import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Regression tests for the question save path, run through the REAL
 * `saveQuestions` code against a real Postgres engine (PGlite) with the
 * shipped migration. The Neon client is swapped for a PGlite-backed Drizzle
 * instance; every query in lib/db/queries runs unchanged.
 *
 * Background: on 2026-09-18 a moderator lost a whole form. Editing after
 * responses existed cloned the version (correct), but the browser kept the
 * old question ids; the next autosave deleted the clone's questions and then
 * failed to insert rows whose ids still belonged to the old version. With no
 * transaction, the delete stuck. These tests pin the fix.
 */

process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');

vi.mock('@/lib/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/lib/db/schema');

  const pg = new PGlite();
  const migration = readFileSync(join(process.cwd(), 'drizzle', '0000_init.sql'), 'utf8');
  for (const statement of migration
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean)) {
    await pg.exec(statement);
  }

  return { db: drizzle(pg, { schema }) };
});

import { db } from '@/lib/db/client';
import { answers, organizations, questions, responses, users } from '@/lib/db/schema';
import { createEvent, getEvent, getQuestions } from '@/lib/db/queries/events';
import { saveQuestions } from '@/lib/db/queries/forms';
import type { FormQuestion } from '@/lib/form/types';
import type { QuestionInput } from '@/lib/validation/schemas';

const ORG_ID = randomUUID();
const USER_ID = randomUUID();

/** What the browser sends: the questions as it holds them, ids included. */
function asInput(list: FormQuestion[]): QuestionInput[] {
  return list.map((q) => ({
    id: q.id,
    type: q.type,
    label: q.label,
    helpText: q.helpText,
    required: q.required,
    options: q.options,
    visibleWhenQuestionId: q.visibleWhenQuestionId,
    visibleWhenOptionId: q.visibleWhenOptionId,
  }));
}

async function seedEvent() {
  const { eventId } = await createEvent(ORG_ID, USER_ID, {
    name: 'Doorbell of Dreams',
    eventDate: '2026-09-18',
    location: '',
    welcomeMessage: '',
  });
  const event = (await getEvent(eventId, ORG_ID))!;
  return { eventId, versionId: event.currentFormVersionId! };
}

async function recordResponse(eventId: string, versionId: string, questionId: string) {
  const [response] = await db
    .insert(responses)
    .values({ eventId, formVersionId: versionId, idempotencyKey: randomUUID(), submittedOn: '2026-09-18' })
    .returning({ id: responses.id });
  await db.insert(answers).values({
    responseId: response.id,
    questionId,
    valueNumber: 5,
    valueOptionIds: [],
  });
  return response.id;
}

beforeAll(async () => {
  await db.insert(organizations).values({ id: ORG_ID, name: 'HelpBnk', slug: 'helpbnk' });
  await db.insert(users).values({ id: USER_ID, email: 'mod@helpbnk.com', passwordHash: 'x' });
});

describe('saveQuestions', () => {
  it('edits in place while a version has no responses, keeping ids', async () => {
    const { eventId, versionId } = await seedEvent();
    const before = await getQuestions(versionId);

    const input = asInput(before);
    input[0].label = 'How was it?';
    const result = await saveQuestions(eventId, versionId, input);

    expect(result.formVersionId).toBe(versionId);
    expect(result.questions.map((q) => q.id)).toEqual(before.map((q) => q.id));
    expect(result.questions[0].label).toBe('How was it?');
  });

  it('survives repeated saves with stale ids after a clone (the 2026-09-18 data loss)', async () => {
    const { eventId, versionId: v1 } = await seedEvent();
    const browserState = await getQuestions(v1); // what the editor holds
    const count = browserState.length;

    await recordResponse(eventId, v1, browserState[0].id);

    // First edit after a response: clones into v2.
    const first = await saveQuestions(eventId, v1, asInput(browserState));
    const v2 = first.formVersionId;
    expect(v2).not.toBe(v1);
    expect(first.questions).toHaveLength(count);

    // The editor never learned the new ids and autosaves again with the OLD
    // ones. Before the fix this emptied v2 and threw on the insert.
    const second = await saveQuestions(eventId, v2, asInput(browserState));
    expect(second.formVersionId).toBe(v2);
    expect(second.questions).toHaveLength(count);
    expect(await getQuestions(v2)).toHaveLength(count);

    // And again, because the browser keeps doing it every 900ms.
    const third = await saveQuestions(eventId, v2, asInput(browserState));
    expect(third.questions).toHaveLength(count);

    // v1 is untouched and its answer still resolves.
    const v1After = await getQuestions(v1);
    expect(v1After.map((q) => q.id)).toEqual(browserState.map((q) => q.id));
    const [answer] = await db
      .select({ questionId: answers.questionId })
      .from(answers)
      .where(eq(answers.questionId, browserState[0].id));
    expect(answer).toBeDefined();

    // The event now points at v2.
    expect((await getEvent(eventId, ORG_ID))!.currentFormVersionId).toBe(v2);
  });

  it('keeps a conditional rule pointing inside the clone after stale-id saves', async () => {
    const { eventId, versionId: v1 } = await seedEvent();
    const browserState = await getQuestions(v1);
    const dependent = browserState.find((q) => q.visibleWhenQuestionId);
    expect(dependent).toBeDefined();

    await recordResponse(eventId, v1, browserState[0].id);
    const { formVersionId: v2 } = await saveQuestions(eventId, v1, asInput(browserState));
    const after = (await saveQuestions(eventId, v2, asInput(browserState))).questions;

    const ids = new Set(after.map((q) => q.id));
    for (const q of after) {
      if (q.visibleWhenQuestionId) expect(ids.has(q.visibleWhenQuestionId)).toBe(true);
    }
  });

  it('never moves or rewrites a question that belongs to another event', async () => {
    const a = await seedEvent();
    const b = await seedEvent();
    const foreign = (await getQuestions(a.versionId))[0];
    const own = await getQuestions(b.versionId);

    // A malicious or confused client sends event A's question id into event B.
    const input = asInput(own);
    input[0] = { ...input[0], id: foreign.id, label: 'hijacked' };
    const result = await saveQuestions(b.eventId, b.versionId, input);

    expect(result.questions).toHaveLength(own.length);
    const [untouched] = await db.select().from(questions).where(eq(questions.id, foreign.id));
    expect(untouched.formVersionId).toBe(a.versionId);
    expect(untouched.label).toBe(foreign.label);
  });

  it('removes and adds questions in place', async () => {
    const { eventId, versionId } = await seedEvent();
    const current = await getQuestions(versionId);

    const input = asInput(current.slice(1)); // drop the first
    input.push({
      type: 'multi_choice',
      label: 'Which sessions did you attend?',
      helpText: null,
      required: false,
      options: [
        { id: 'a', label: 'Morning' },
        { id: 'b', label: 'Afternoon' },
      ],
      visibleWhenQuestionId: null,
      visibleWhenOptionId: null,
    });

    const result = await saveQuestions(eventId, versionId, input);
    expect(result.questions).toHaveLength(current.length);
    expect(result.questions.map((q) => q.label)).not.toContain(current[0].label);
    expect(result.questions.at(-1)!.type).toBe('multi_choice');
  });

  it('refuses at the database level to delete an answered question', async () => {
    const { eventId, versionId } = await seedEvent();
    const [first] = await getQuestions(versionId);
    await recordResponse(eventId, versionId, first.id);

    await expect(db.delete(questions).where(eq(questions.id, first.id))).rejects.toThrow();
  });
});
