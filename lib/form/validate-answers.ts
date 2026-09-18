import {
  RATING_MAX,
  RATING_MIN,
  TEXT_LIMITS,
  type AnswerMap,
  type FormQuestion,
} from './types';
import { stripHiddenAnswers, visibleQuestions } from './visibility';

/**
 * Server-side answer validation.
 *
 * Runs on every submission and trusts nothing the client sent. It re-computes
 * visibility from the submitted answers rather than believing a client claim
 * about which questions were shown, so:
 *
 *   - a hidden required question can never block submission, and
 *   - answers to hidden questions are dropped before they reach the database.
 */

export type AnswerError = { questionId: string; message: string };

export type ValidationResult =
  | { ok: true; answers: AnswerMap }
  | { ok: false; errors: AnswerError[] };

function isBlank(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

export function validateAnswers(
  questions: FormQuestion[],
  submitted: AnswerMap,
): ValidationResult {
  const errors: AnswerError[] = [];
  const knownIds = new Set(questions.map((q) => q.id));

  // Reject answers for question ids that do not belong to this form version.
  // These are dropped rather than fatal, but an unknown id signals a stale or
  // tampered payload, so we surface it.
  for (const questionId of Object.keys(submitted)) {
    if (!knownIds.has(questionId)) {
      errors.push({
        questionId,
        message: 'This question is no longer part of the form.',
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  // Visibility is computed here, from the submitted answers.
  const visible = visibleQuestions(questions, submitted);
  const cleaned = stripHiddenAnswers(questions, submitted);

  for (const question of visible) {
    const answer = cleaned[question.id];
    const optionIds = new Set((question.options ?? []).map((o) => o.id));

    switch (question.type) {
      case 'short_text':
      case 'long_text': {
        const text = answer?.text;
        const limit = TEXT_LIMITS[question.type];

        if (question.required && isBlank(text)) {
          errors.push({ questionId: question.id, message: 'This question is required.' });
          break;
        }

        if (text !== undefined && typeof text !== 'string') {
          errors.push({ questionId: question.id, message: 'Invalid answer.' });
          break;
        }

        if (text && text.length > limit) {
          errors.push({
            questionId: question.id,
            message: `Please keep this under ${limit} characters.`,
          });
        }
        break;
      }

      case 'rating': {
        const value = answer?.number;

        if (value === undefined || value === null) {
          if (question.required) {
            errors.push({ questionId: question.id, message: 'This question is required.' });
          }
          break;
        }

        if (
          !Number.isInteger(value) ||
          value < RATING_MIN ||
          value > RATING_MAX
        ) {
          errors.push({
            questionId: question.id,
            message: `Choose a rating from ${RATING_MIN} to ${RATING_MAX}.`,
          });
        }
        break;
      }

      case 'single_choice': {
        const selected = answer?.optionIds ?? [];

        if (selected.length === 0) {
          if (question.required) {
            errors.push({ questionId: question.id, message: 'This question is required.' });
          }
          break;
        }

        if (selected.length > 1) {
          errors.push({
            questionId: question.id,
            message: 'Choose one option.',
          });
          break;
        }

        if (!optionIds.has(selected[0])) {
          errors.push({ questionId: question.id, message: 'Choose one of the listed options.' });
        }
        break;
      }

      case 'multi_choice': {
        const selected = answer?.optionIds ?? [];

        if (selected.length === 0) {
          if (question.required) {
            errors.push({ questionId: question.id, message: 'This question is required.' });
          }
          break;
        }

        if (new Set(selected).size !== selected.length) {
          errors.push({ questionId: question.id, message: 'Duplicate selection.' });
          break;
        }

        if (selected.some((id) => !optionIds.has(id))) {
          errors.push({
            questionId: question.id,
            message: 'Choose from the listed options.',
          });
        }
        break;
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, answers: cleaned };
}
