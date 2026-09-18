import { randomUUID } from 'node:crypto';
import type { QuestionType, QuestionOption } from '@/lib/db/schema';

/**
 * The default feedback template preloaded into every new event.
 *
 * Deliberately short enough to complete comfortably on a phone, and free of any
 * question asking for a name, contact detail, or other direct identifier.
 *
 * The two background questions (previous organizations / which ones) are
 * OPTIONAL by default: at a small event, a specific answer can identify someone.
 */

export type TemplateQuestion = {
  /** Local key used only to wire up the conditional rule before ids exist. */
  key: string;
  type: QuestionType;
  label: string;
  helpText: string | null;
  required: boolean;
  options: QuestionOption[];
  /** Key of the controlling question, resolved to a real id at insert time. */
  visibleWhenKey?: string;
  /** Option id within the controlling question. */
  visibleWhenOptionId?: string;
};

const YES_OPTION_ID = 'yes';
const NO_OPTION_ID = 'no';

export const DEFAULT_TEMPLATE: TemplateQuestion[] = [
  {
    key: 'overall',
    type: 'rating',
    label: 'How was the event overall?',
    helpText: null,
    required: true,
    options: [],
  },
  {
    key: 'valuable',
    type: 'long_text',
    label: 'What was the most valuable part of the event?',
    helpText: null,
    required: false,
    options: [],
  },
  {
    key: 'improve',
    type: 'long_text',
    label: 'What could we improve next time?',
    helpText: null,
    required: false,
    options: [],
  },
  {
    key: 'background',
    type: 'single_choice',
    label: 'Have you previously been part of other organizations or communities?',
    helpText: 'Optional.',
    required: false,
    options: [
      { id: YES_OPTION_ID, label: 'Yes' },
      { id: NO_OPTION_ID, label: 'No' },
    ],
  },
  {
    key: 'background_which',
    type: 'short_text',
    label: 'Which organizations or communities?',
    helpText: 'Optional. Only share what you are comfortable sharing.',
    required: false,
    options: [],
    visibleWhenKey: 'background',
    visibleWhenOptionId: YES_OPTION_ID,
  },
];

/**
 * Materialize the template into insert-ready rows for a form version, assigning
 * real question ids and resolving the conditional rule's key reference.
 */
export function buildTemplateQuestions(formVersionId: string) {
  const idsByKey = new Map<string, string>();
  for (const question of DEFAULT_TEMPLATE) {
    idsByKey.set(question.key, randomUUID());
  }

  return DEFAULT_TEMPLATE.map((question, index) => ({
    id: idsByKey.get(question.key)!,
    formVersionId,
    position: index,
    type: question.type,
    label: question.label,
    helpText: question.helpText,
    required: question.required,
    options: question.options,
    visibleWhenQuestionId: question.visibleWhenKey
      ? (idsByKey.get(question.visibleWhenKey) ?? null)
      : null,
    visibleWhenOptionId: question.visibleWhenOptionId ?? null,
  }));
}
