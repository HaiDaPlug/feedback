import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Database schema for HelpBnk Event Feedback.
 *
 * ANONYMITY INVARIANT: the `responses` and `answers` tables below contain no
 * column capable of holding a participant identifier -- no user id, no IP
 * address, no user-agent, no device fingerprint, no session id, and no key that
 * is stable across events. This is deliberate: anonymity is enforced by the
 * absence of the columns, not by application policy. Do not add such a column.
 */

// ---------------------------------------------------------------------------
// Organization and moderators
// ---------------------------------------------------------------------------

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Stored lowercased; uniqueness is therefore case-insensitive in practice. */
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Organization membership. Having a `users` row grants nothing on its own --
 * every moderator route checks for a membership row here. This is what makes
 * "signing in alone must not grant moderator access" true.
 */
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'admin' may add other moderators; 'moderator' may not. */
    role: text('role', { enum: ['admin', 'moderator'] }).notNull().default('moderator'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('memberships_org_user_unique').on(t.orgId, t.userId)],
);

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Calendar date of the event itself. */
    eventDate: date('event_date').notNull(),
    location: text('location'),
    welcomeMessage: text('welcome_message'),
    /**
     * draft  - moderators edit and preview; participant link is inactive.
     * open   - attendees holding the valid link may submit.
     * closed - submissions rejected server-side; existing feedback remains.
     */
    status: text('status', { enum: ['draft', 'open', 'closed'] })
      .notNull()
      .default('draft'),
    /** The form version participants currently see. */
    currentFormVersionId: uuid('current_form_version_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('events_org_idx').on(t.orgId)],
);

/**
 * Participant access tokens.
 *
 * Lookup uses the SHA-256 hash, so the participant path never decrypts anything.
 * The token is ALSO stored encrypted (AES-256-GCM, key held only in the server
 * environment) so a moderator can reopen the Share page later and see the same
 * link -- without that, every visit would force a rotation and invalidate QR
 * codes already printed for a venue. A database dump without the key yields no
 * working links.
 *
 * Exactly one row per event should have `active = true`; rotation revokes the
 * old row and inserts a new one, which invalidates the old link for both loading
 * and submitting while leaving existing responses intact.
 */
export const eventAccessTokens = pgTable(
  'event_access_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    /** AES-256-GCM ciphertext; see lib/token-crypto.ts. */
    tokenEncrypted: text('token_encrypted').notNull(),
    /** First 8 characters of the token, for moderator-facing display only. */
    tokenPrefix: text('token_prefix').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('event_access_tokens_event_idx').on(t.eventId)],
);

// ---------------------------------------------------------------------------
// Form versions and questions
// ---------------------------------------------------------------------------

/**
 * An immutable-once-used snapshot of a form. While a version has zero responses
 * it may be edited in place. The first edit after a response arrives clones the
 * version, preserving the exact question wording and options that participants
 * actually answered.
 */
export const formVersions = pgTable(
  'form_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('form_versions_event_number_unique').on(t.eventId, t.versionNumber)],
);

export const QUESTION_TYPES = [
  'short_text',
  'long_text',
  'single_choice',
  'multi_choice',
  'rating',
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Shape of each entry in the `questions.options` JSON column. */
export type QuestionOption = { id: string; label: string };

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    formVersionId: uuid('form_version_id')
      .notNull()
      .references(() => formVersions.id, { onDelete: 'cascade' }),
    /** Zero-based display order within the form version. */
    position: integer('position').notNull(),
    type: text('type', { enum: QUESTION_TYPES }).notNull(),
    label: text('label').notNull(),
    helpText: text('help_text'),
    required: boolean('required').notNull().default(false),
    /** Choice options; empty array for text and rating questions. */
    options: jsonb('options').$type<QuestionOption[]>().notNull().default([]),
    /**
     * Single conditional rule: show this question only when the referenced
     * single-choice question was answered with the referenced option.
     */
    visibleWhenQuestionId: uuid('visible_when_question_id'),
    visibleWhenOptionId: text('visible_when_option_id'),
  },
  (t) => [index('questions_form_version_idx').on(t.formVersionId, t.position)],
);

// ---------------------------------------------------------------------------
// Anonymous responses
// ---------------------------------------------------------------------------

/**
 * One anonymous submission.
 *
 * Note what is NOT here: no participant id, no IP, no user-agent, no
 * fingerprint, no cross-event key. Timing is stored as a DATE only -- no
 * wall-clock timestamp -- because a precise submission time can identify
 * someone at a small event by correlating with when they left the room.
 */
export const responses = pgTable(
  'responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** The exact form version this participant completed. */
    formVersionId: uuid('form_version_id')
      .notNull()
      .references(() => formVersions.id, { onDelete: 'restrict' }),
    /**
     * Client-generated random UUID used solely to make retries idempotent.
     * Never displayed, never exported, and carries no information about the
     * sender. Unique per event so a retry cannot create a second row.
     */
    idempotencyKey: text('idempotency_key').notNull(),
    /** Coarse date only -- deliberately not a timestamp. See note above. */
    submittedOn: date('submitted_on').notNull(),
  },
  (t) => [
    unique('responses_event_idempotency_unique').on(t.eventId, t.idempotencyKey),
    index('responses_event_idx').on(t.eventId),
  ],
);

export const answers = pgTable(
  'answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    responseId: uuid('response_id')
      .notNull()
      .references(() => responses.id, { onDelete: 'cascade' }),
    /** Stable question id from the answered form version. */
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    /** Populated for short_text and long_text. */
    valueText: text('value_text'),
    /** Populated for rating (1-5). */
    valueNumber: integer('value_number'),
    /** Populated for single_choice (one entry) and multi_choice (zero or more). */
    valueOptionIds: jsonb('value_option_ids').$type<string[]>().notNull().default([]),
  },
  (t) => [index('answers_response_idx').on(t.responseId)],
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Event = typeof events.$inferSelect;
export type EventAccessToken = typeof eventAccessTokens.$inferSelect;
export type FormVersion = typeof formVersions.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Response = typeof responses.$inferSelect;
export type Answer = typeof answers.$inferSelect;
