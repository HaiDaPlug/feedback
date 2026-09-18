import type { QuestionOption, QuestionType } from '@/lib/db/schema';

/**
 * The shape of a question as used by rendering and validation. This is a plain
 * structural type (not the Drizzle row) so the participant renderer, the
 * moderator preview, and the server validator can all share one contract.
 */
export type FormQuestion = {
  id: string;
  position: number;
  type: QuestionType;
  label: string;
  helpText: string | null;
  required: boolean;
  options: QuestionOption[];
  visibleWhenQuestionId: string | null;
  visibleWhenOptionId: string | null;
};

/**
 * A participant's in-progress or submitted answer to one question.
 * Exactly one of the value fields is meaningful, determined by question type.
 */
export type AnswerValue = {
  text?: string;
  number?: number;
  optionIds?: string[];
};

/** Map of question id -> answer. */
export type AnswerMap = Record<string, AnswerValue>;

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: 'Short text',
  long_text: 'Long text',
  single_choice: 'Single choice',
  multi_choice: 'Multiple selection',
  rating: 'Rating (1-5)',
};

/** Question types that can drive a conditional rule. */
export const CONDITION_SOURCE_TYPES: QuestionType[] = ['single_choice'];

export const TEXT_LIMITS = {
  short_text: 200,
  long_text: 2000,
} as const;

export const RATING_MIN = 1;
export const RATING_MAX = 5;
