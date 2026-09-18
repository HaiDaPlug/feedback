import { describe, expect, it } from 'vitest';
import {
  isQuestionVisible,
  stripHiddenAnswers,
  visibleQuestions,
} from '@/lib/form/visibility';
import type { AnswerMap, FormQuestion } from '@/lib/form/types';

/**
 * Conditional visibility is shared by the participant renderer and the server
 * validator, so a bug here is both a UX bug and a data-integrity bug.
 */

function question(overrides: Partial<FormQuestion> & { id: string }): FormQuestion {
  return {
    position: 0,
    type: 'short_text',
    label: 'Question',
    helpText: null,
    required: false,
    options: [],
    visibleWhenQuestionId: null,
    visibleWhenOptionId: null,
    ...overrides,
  };
}

const BACKGROUND = question({
  id: 'q-background',
  position: 0,
  type: 'single_choice',
  label: 'Have you previously been part of other organizations?',
  options: [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
  ],
});

const FOLLOW_UP = question({
  id: 'q-which',
  position: 1,
  label: 'Which organizations?',
  visibleWhenQuestionId: 'q-background',
  visibleWhenOptionId: 'yes',
});

describe('isQuestionVisible', () => {
  it('shows a question with no rule', () => {
    expect(isQuestionVisible(BACKGROUND, {})).toBe(true);
  });

  it('hides a conditional question when the controller is unanswered', () => {
    expect(isQuestionVisible(FOLLOW_UP, {})).toBe(false);
  });

  it('shows a conditional question when the option matches', () => {
    const answers: AnswerMap = { 'q-background': { optionIds: ['yes'] } };
    expect(isQuestionVisible(FOLLOW_UP, answers)).toBe(true);
  });

  it('hides a conditional question when a different option is chosen', () => {
    const answers: AnswerMap = { 'q-background': { optionIds: ['no'] } };
    expect(isQuestionVisible(FOLLOW_UP, answers)).toBe(false);
  });
});

describe('visibleQuestions', () => {
  it('returns questions in position order', () => {
    const questions = [
      question({ id: 'b', position: 1, label: 'Second' }),
      question({ id: 'a', position: 0, label: 'First' }),
    ];

    expect(visibleQuestions(questions, {}).map((q) => q.id)).toEqual(['a', 'b']);
  });

  it('hides a question whose controlling question is itself hidden', () => {
    // A -> B -> C chain where A is answered "no", so B is hidden and C, which
    // depends on B, must be hidden too even though C's own rule cannot match.
    const chain = [
      BACKGROUND,
      question({
        id: 'q-mid',
        position: 1,
        type: 'single_choice',
        options: [{ id: 'opt', label: 'Opt' }],
        visibleWhenQuestionId: 'q-background',
        visibleWhenOptionId: 'yes',
      }),
      question({
        id: 'q-leaf',
        position: 2,
        visibleWhenQuestionId: 'q-mid',
        visibleWhenOptionId: 'opt',
      }),
    ];

    const answers: AnswerMap = {
      'q-background': { optionIds: ['no'] },
      'q-mid': { optionIds: ['opt'] },
    };

    expect(visibleQuestions(chain, answers).map((q) => q.id)).toEqual(['q-background']);
  });
});

describe('stripHiddenAnswers', () => {
  it('drops a stale answer after the controlling answer changes', () => {
    // The participant answered "Yes", typed a follow-up, then switched to "No".
    // The follow-up text must not be persisted.
    const answers: AnswerMap = {
      'q-background': { optionIds: ['no'] },
      'q-which': { text: 'Acme Community' },
    };

    const cleaned = stripHiddenAnswers([BACKGROUND, FOLLOW_UP], answers);

    expect(cleaned).toEqual({ 'q-background': { optionIds: ['no'] } });
    expect(cleaned['q-which']).toBeUndefined();
  });

  it('keeps the follow-up answer while it is visible', () => {
    const answers: AnswerMap = {
      'q-background': { optionIds: ['yes'] },
      'q-which': { text: 'Acme Community' },
    };

    expect(stripHiddenAnswers([BACKGROUND, FOLLOW_UP], answers)).toEqual(answers);
  });
});
