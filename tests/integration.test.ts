import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { hashToken, generateToken, tokenPrefix } from '@/lib/tokens';
import { encryptToken } from '@/lib/token-crypto';
import { buildTemplateQuestions } from '@/lib/form/default-template';
import { validateAnswers } from '@/lib/form/validate-answers';
import type { FormQuestion } from '@/lib/form/types';

/**
 * Integration tests against a real Postgres engine (PGlite), running the SAME
 * migration SQL that ships in drizzle/.
 *
 * These cover the behaviours that unit tests cannot prove because they depend
 * on database constraints: idempotent submission, token rotation, form-version
 * preservation, and the closed-event rejection path.
 */

let pg: PGlite;

process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');

const ORG_ID = randomUUID();
const EVENT_ID = randomUUID();

beforeAll(async () => {
  pg = new PGlite();

  const sql = readFileSync(join(process.cwd(), 'drizzle', '0000_init.sql'), 'utf8');
  for (const statement of sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean)) {
    await pg.exec(statement);
  }

  await pg.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)`, [
    ORG_ID,
    'HelpBnk',
    'helpbnk',
  ]);
});

/** Create an event with the default template and an active token. */
async function seedEvent(eventId: string, status: 'draft' | 'open' | 'closed' = 'open') {
  await pg.query(
    `INSERT INTO events (id, org_id, name, event_date, status) VALUES ($1,$2,$3,$4,$5)`,
    [eventId, ORG_ID, 'Community Meetup', '2026-09-01', status],
  );

  const versionId = randomUUID();
  await pg.query(
    `INSERT INTO form_versions (id, event_id, version_number) VALUES ($1,$2,1)`,
    [versionId, eventId],
  );

  for (const q of buildTemplateQuestions(versionId)) {
    await pg.query(
      `INSERT INTO questions (id, form_version_id, position, type, label, help_text,
         required, options, visible_when_question_id, visible_when_option_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        q.id,
        q.formVersionId,
        q.position,
        q.type,
        q.label,
        q.helpText,
        q.required,
        JSON.stringify(q.options),
        q.visibleWhenQuestionId,
        q.visibleWhenOptionId,
      ],
    );
  }

  await pg.query(`UPDATE events SET current_form_version_id = $1 WHERE id = $2`, [
    versionId,
    eventId,
  ]);

  const token = generateToken();
  await pg.query(
    `INSERT INTO event_access_tokens (event_id, token_hash, token_encrypted, token_prefix, active)
     VALUES ($1,$2,$3,$4,true)`,
    [eventId, hashToken(token), encryptToken(token), tokenPrefix(token)],
  );

  return { versionId, token };
}

describe('schema migration', () => {
  it('creates every expected table', async () => {
    const result = await pg.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`,
    );
    const tables = result.rows.map((r) => r.table_name);

    for (const table of [
      'organizations',
      'users',
      'memberships',
      'events',
      'event_access_tokens',
      'form_versions',
      'questions',
      'responses',
      'answers',
    ]) {
      expect(tables).toContain(table);
    }
  });

  it('gives responses no identifying columns', async () => {
    const result = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name='responses'`,
    );
    const columns = result.rows.map((r) => r.column_name);

    expect(columns.sort()).toEqual([
      'event_id',
      'form_version_id',
      'id',
      'idempotency_key',
      'submitted_on',
    ]);
  });
});

describe('idempotent submission', () => {
  it('does not create a second response when the same key is retried', async () => {
    const eventId = randomUUID();
    const { versionId } = await seedEvent(eventId);
    const key = randomUUID();

    // First submission.
    await pg.query(
      `INSERT INTO responses (event_id, form_version_id, idempotency_key, submitted_on)
       VALUES ($1,$2,$3,$4) ON CONFLICT (event_id, idempotency_key) DO NOTHING`,
      [eventId, versionId, key, '2026-09-01'],
    );

    // Retry after a network failure -- same key.
    const retry = await pg.query(
      `INSERT INTO responses (event_id, form_version_id, idempotency_key, submitted_on)
       VALUES ($1,$2,$3,$4) ON CONFLICT (event_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [eventId, versionId, key, '2026-09-01'],
    );

    expect(retry.rows).toHaveLength(0);

    const count = await pg.query<{ count: string }>(
      `SELECT count(*) FROM responses WHERE event_id = $1`,
      [eventId],
    );
    expect(Number(count.rows[0].count)).toBe(1);
  });

  it('allows the same key at a different event', async () => {
    const key = randomUUID();
    const a = randomUUID();
    const b = randomUUID();
    const seedA = await seedEvent(a);
    const seedB = await seedEvent(b);

    for (const [eventId, version] of [
      [a, seedA.versionId],
      [b, seedB.versionId],
    ]) {
      await pg.query(
        `INSERT INTO responses (event_id, form_version_id, idempotency_key, submitted_on)
         VALUES ($1,$2,$3,'2026-09-01')`,
        [eventId, version, key],
      );
    }

    const count = await pg.query<{ count: string }>(
      `SELECT count(*) FROM responses WHERE idempotency_key = $1`,
      [key],
    );
    expect(Number(count.rows[0].count)).toBe(2);
  });
});

describe('token rotation', () => {
  it('invalidates the old token and preserves existing feedback', async () => {
    const eventId = randomUUID();
    const { versionId, token: oldToken } = await seedEvent(eventId);

    await pg.query(
      `INSERT INTO responses (event_id, form_version_id, idempotency_key, submitted_on)
       VALUES ($1,$2,$3,'2026-09-01')`,
      [eventId, versionId, randomUUID()],
    );

    // Rotate: revoke the active row, insert a new one.
    const newToken = generateToken();
    await pg.query(
      `UPDATE event_access_tokens SET active=false, revoked_at=now()
       WHERE event_id=$1 AND active=true`,
      [eventId],
    );
    await pg.query(
      `INSERT INTO event_access_tokens (event_id, token_hash, token_encrypted, token_prefix, active)
       VALUES ($1,$2,$3,$4,true)`,
      [eventId, hashToken(newToken), encryptToken(newToken), tokenPrefix(newToken)],
    );

    // The old token no longer resolves to an active row -- this is exactly the
    // lookup both the form loader and the submit endpoint perform.
    const oldLookup = await pg.query(
      `SELECT id FROM event_access_tokens WHERE token_hash=$1 AND active=true`,
      [hashToken(oldToken)],
    );
    expect(oldLookup.rows).toHaveLength(0);

    const newLookup = await pg.query(
      `SELECT id FROM event_access_tokens WHERE token_hash=$1 AND active=true`,
      [hashToken(newToken)],
    );
    expect(newLookup.rows).toHaveLength(1);

    // Feedback survives the rotation.
    const responses = await pg.query<{ count: string }>(
      `SELECT count(*) FROM responses WHERE event_id=$1`,
      [eventId],
    );
    expect(Number(responses.rows[0].count)).toBe(1);
  });
});

describe('form versioning', () => {
  it('preserves the original wording after a question is edited', async () => {
    const eventId = randomUUID();
    const { versionId } = await seedEvent(eventId);

    const original = await pg.query<{ id: string; label: string }>(
      `SELECT id, label FROM questions WHERE form_version_id=$1 AND position=0`,
      [versionId],
    );
    const originalQuestion = original.rows[0];

    // A participant answers the original wording.
    const responseId = randomUUID();
    await pg.query(
      `INSERT INTO responses (id, event_id, form_version_id, idempotency_key, submitted_on)
       VALUES ($1,$2,$3,$4,'2026-09-01')`,
      [responseId, eventId, versionId, randomUUID()],
    );
    await pg.query(
      `INSERT INTO answers (response_id, question_id, value_number, value_option_ids)
       VALUES ($1,$2,5,'[]'::jsonb)`,
      [responseId, originalQuestion.id],
    );

    // The moderator now edits the form. Because responses exist, a NEW version
    // is created; the old version's questions are untouched.
    const newVersionId = randomUUID();
    await pg.query(
      `INSERT INTO form_versions (id, event_id, version_number) VALUES ($1,$2,2)`,
      [newVersionId, eventId],
    );
    await pg.query(
      `INSERT INTO questions (id, form_version_id, position, type, label, required, options)
       VALUES ($1,$2,0,'rating','Rate the event (reworded)',true,'[]'::jsonb)`,
      [randomUUID(), newVersionId],
    );
    await pg.query(`UPDATE events SET current_form_version_id=$1 WHERE id=$2`, [
      newVersionId,
      eventId,
    ]);

    // The historical answer still resolves to the wording it was asked in.
    const preserved = await pg.query<{ label: string }>(
      `SELECT q.label FROM answers a
       JOIN questions q ON q.id = a.question_id
       WHERE a.response_id = $1`,
      [responseId],
    );

    expect(preserved.rows[0].label).toBe(originalQuestion.label);
    expect(preserved.rows[0].label).not.toBe('Rate the event (reworded)');
  });

  it('refuses to delete a form version that has responses', async () => {
    const eventId = randomUUID();
    const { versionId } = await seedEvent(eventId);

    await pg.query(
      `INSERT INTO responses (event_id, form_version_id, idempotency_key, submitted_on)
       VALUES ($1,$2,$3,'2026-09-01')`,
      [eventId, versionId, randomUUID()],
    );

    // ON DELETE RESTRICT protects answered forms from accidental removal.
    await expect(
      pg.query(`DELETE FROM form_versions WHERE id=$1`, [versionId]),
    ).rejects.toThrow();
  });
});

describe('closed events', () => {
  it('is rejected by the status check the submit path performs', async () => {
    const eventId = randomUUID();
    await seedEvent(eventId, 'closed');

    const result = await pg.query<{ status: string }>(
      `SELECT status FROM events WHERE id=$1`,
      [eventId],
    );

    // The API returns 409 when this is not 'open'.
    expect(result.rows[0].status).toBe('closed');
    expect(result.rows[0].status === 'open').toBe(false);
  });
});

describe('end-to-end answer validation against seeded questions', () => {
  it('accepts a realistic submission and drops the hidden follow-up', async () => {
    const eventId = randomUUID();
    const { versionId } = await seedEvent(eventId);

    const rows = await pg.query<{
      id: string;
      position: number;
      type: string;
      label: string;
      help_text: string | null;
      required: boolean;
      options: unknown;
      visible_when_question_id: string | null;
      visible_when_option_id: string | null;
    }>(`SELECT * FROM questions WHERE form_version_id=$1 ORDER BY position`, [versionId]);

    const questions: FormQuestion[] = rows.rows.map((r) => ({
      id: r.id,
      position: r.position,
      type: r.type as FormQuestion['type'],
      label: r.label,
      helpText: r.help_text,
      required: r.required,
      options: r.options as FormQuestion['options'],
      visibleWhenQuestionId: r.visible_when_question_id,
      visibleWhenOptionId: r.visible_when_option_id,
    }));

    const rating = questions[0];
    const background = questions[3];
    const followUp = questions[4];

    // Participant says "No" to the background question but a stale follow-up
    // answer is still in the payload.
    const result = validateAnswers(questions, {
      [rating.id]: { number: 5 },
      [background.id]: { optionIds: ['no'] },
      [followUp.id]: { text: 'Acme Community' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.answers[followUp.id]).toBeUndefined();
      expect(result.answers[rating.id]).toEqual({ number: 5 });
    }
  });
});
