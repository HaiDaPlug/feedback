import { z } from 'zod';
import { QUESTION_TYPES } from '@/lib/db/schema';
import { RATING_MAX, RATING_MIN, TEXT_LIMITS } from '@/lib/form/types';

/**
 * Zod schemas forming the trust boundary. Every request body crossing into the
 * server is parsed here before any database work happens.
 */

// --- Moderator: events -----------------------------------------------------

export const eventCreateSchema = z.object({
  name: z.string().trim().min(1, 'Event name is required.').max(200),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.'),
  location: z.string().trim().max(200).optional().or(z.literal('')),
  welcomeMessage: z.string().trim().max(1000).optional().or(z.literal('')),
});

export type EventCreateInput = z.infer<typeof eventCreateSchema>;

export const eventUpdateSchema = eventCreateSchema.partial();

export const eventStatusSchema = z.object({
  status: z.enum(['draft', 'open', 'closed']),
});

// --- Moderator: questions --------------------------------------------------

export const questionOptionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().trim().max(200),
});

export const questionInputSchema = z.object({
  /** Existing question id, or omitted for a newly added question. */
  id: z.string().uuid().optional(),
  type: z.enum(QUESTION_TYPES),
  label: z.string().max(500),
  helpText: z.string().max(500).nullable().optional(),
  required: z.boolean(),
  options: z.array(questionOptionSchema).max(20),
  visibleWhenQuestionId: z.string().uuid().nullable().optional(),
  visibleWhenOptionId: z.string().max(64).nullable().optional(),
});

export const questionsSaveSchema = z.object({
  questions: z.array(questionInputSchema).max(50),
});

export type QuestionInput = z.infer<typeof questionInputSchema>;

// --- Moderator: add moderator ---------------------------------------------

export const moderatorCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(200),
  name: z.string().trim().max(120).optional().or(z.literal('')),
  password: z
    .string()
    .min(12, 'Use at least 12 characters.')
    .max(200),
  role: z.enum(['admin', 'moderator']).default('moderator'),
});

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

// --- Participant: submission ----------------------------------------------

/**
 * A single answer. The client sends only the field relevant to the question
 * type; the answer validator enforces the type/field match against the real
 * question definitions.
 */
export const answerValueSchema = z.object({
  text: z.string().max(TEXT_LIMITS.long_text).optional(),
  number: z.number().int().min(RATING_MIN).max(RATING_MAX).optional(),
  optionIds: z.array(z.string().max(64)).max(20).optional(),
});

export const submissionSchema = z.object({
  /** Random per-form-load UUID; makes retries idempotent. */
  idempotencyKey: z.string().uuid('Invalid submission key.'),
  /** The form version the participant actually completed. */
  formVersionId: z.string().uuid(),
  answers: z.record(z.string().uuid(), answerValueSchema),
});

export type SubmissionInput = z.infer<typeof submissionSchema>;

/** Hard cap on request body size, enforced before parsing. */
export const MAX_SUBMISSION_BYTES = 64 * 1024;
