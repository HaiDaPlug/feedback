import type { AnswerMap, FormQuestion } from './types';

/**
 * Conditional question visibility.
 *
 * This module is the SINGLE SOURCE OF TRUTH for which questions are visible.
 * It is imported by both the participant form renderer and the server-side
 * submission validator. Duplicating this logic is how hidden-question bugs get
 * in: the client cannot be trusted, so the server must compute visibility the
 * same way rather than believing what was submitted.
 *
 * Rule supported: show question Q when a previous single-choice question's
 * answer matches a specified option. A question with no rule is always visible.
 */

/** Is one question visible, given the current answers? */
export function isQuestionVisible(question: FormQuestion, answers: AnswerMap): boolean {
  const { visibleWhenQuestionId, visibleWhenOptionId } = question;

  // No rule configured -> always visible.
  if (!visibleWhenQuestionId || !visibleWhenOptionId) return true;

  const controllingAnswer = answers[visibleWhenQuestionId];
  if (!controllingAnswer) return false;

  const selected = controllingAnswer.optionIds ?? [];
  return selected.includes(visibleWhenOptionId);
}

/**
 * Resolve visibility for a whole form.
 *
 * Rules may only reference an EARLIER question (enforced at build time by
 * `validateForm`), so a single pass in position order is sufficient and a
 * question whose controller is itself hidden resolves to hidden.
 */
export function visibleQuestions(
  questions: FormQuestion[],
  answers: AnswerMap,
): FormQuestion[] {
  const ordered = [...questions].sort((a, b) => a.position - b.position);
  const visibleIds = new Set<string>();
  const result: FormQuestion[] = [];

  for (const question of ordered) {
    const { visibleWhenQuestionId } = question;

    // A rule pointing at a hidden question means this question is hidden too:
    // the participant never saw the controlling question, so it cannot match.
    if (visibleWhenQuestionId && !visibleIds.has(visibleWhenQuestionId)) continue;

    if (isQuestionVisible(question, answers)) {
      visibleIds.add(question.id);
      result.push(question);
    }
  }

  return result;
}

/** Ids of the currently visible questions. */
export function visibleQuestionIds(
  questions: FormQuestion[],
  answers: AnswerMap,
): Set<string> {
  return new Set(visibleQuestions(questions, answers).map((q) => q.id));
}

/**
 * Drop answers belonging to questions that are not visible.
 *
 * Used on the server immediately before insert so that stale answers -- e.g. a
 * participant typed a follow-up, then changed the controlling answer to "No" --
 * are never persisted.
 */
export function stripHiddenAnswers(
  questions: FormQuestion[],
  answers: AnswerMap,
): AnswerMap {
  const visible = visibleQuestionIds(questions, answers);
  const cleaned: AnswerMap = {};

  for (const [questionId, value] of Object.entries(answers)) {
    if (visible.has(questionId)) cleaned[questionId] = value;
  }

  return cleaned;
}
