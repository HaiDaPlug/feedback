import { describe, expect, it } from 'vitest';
import { validateAnswers } from '@/lib/form/validate-answers';
import type { AnswerMap, FormQuestion } from '@/lib/form/types';

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

describe('validateAnswers', () => {
  it('accepts a valid submission', () => {
    const questions = [question({ id: 'q1', type: 'rating', required: true })];
    const result = validateAnswers(questions, { q1: { number: 4 } });

    expect(result.ok).toBe(true);
  });

  it('rejects a missing required answer', () => {
    const questions = [question({ id: 'q1', type: 'rating', required: true })];
    const result = validateAnswers(questions, {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatchObject({ questionId: 'q1' });
    }
  });

  it('rejects an out-of-range rating', () => {
    const questions = [question({ id: 'q1', type: 'rating' })];

    expect(validateAnswers(questions, { q1: { number: 9 } }).ok).toBe(false);
    expect(validateAnswers(questions, { q1: { number: 0 } }).ok).toBe(false);
  });

  it('rejects an option id that does not belong to the question', () => {
    const questions = [
      question({
        id: 'q1',
        type: 'single_choice',
        options: [{ id: 'yes', label: 'Yes' }],
      }),
    ];

    const result = validateAnswers(questions, { q1: { optionIds: ['smuggled'] } });
    expect(result.ok).toBe(false);
  });

  it('rejects more than one option on a single-choice question', () => {
    const questions = [
      question({
        id: 'q1',
        type: 'single_choice',
        options: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
      }),
    ];

    expect(validateAnswers(questions, { q1: { optionIds: ['a', 'b'] } }).ok).toBe(false);
  });

  it('accepts several options on a multi-select question', () => {
    const questions = [
      question({
        id: 'q1',
        type: 'multi_choice',
        options: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
      }),
    ];

    expect(validateAnswers(questions, { q1: { optionIds: ['a', 'b'] } }).ok).toBe(true);
  });

  it('rejects an answer for a question that is not in this form version', () => {
    const questions = [question({ id: 'q1' })];
    const result = validateAnswers(questions, { 'not-in-form': { text: 'hello' } });

    expect(result.ok).toBe(false);
  });

  it('rejects text longer than the limit', () => {
    const questions = [question({ id: 'q1', type: 'short_text' })];
    const result = validateAnswers(questions, { q1: { text: 'x'.repeat(500) } });

    expect(result.ok).toBe(false);
  });

  describe('hidden questions', () => {
    const controller = question({
      id: 'q-background',
      position: 0,
      type: 'single_choice',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
    });

    const hiddenRequired = question({
      id: 'q-which',
      position: 1,
      // Required, but only when visible.
      required: true,
      visibleWhenQuestionId: 'q-background',
      visibleWhenOptionId: 'yes',
    });

    it('does not block submission on a hidden required question', () => {
      const answers: AnswerMap = { 'q-background': { optionIds: ['no'] } };
      const result = validateAnswers([controller, hiddenRequired], answers);

      expect(result.ok).toBe(true);
    });

    it('enforces the requirement once the question becomes visible', () => {
      const answers: AnswerMap = { 'q-background': { optionIds: ['yes'] } };
      const result = validateAnswers([controller, hiddenRequired], answers);

      expect(result.ok).toBe(false);
    });

    it('strips a stale hidden answer from the accepted result', () => {
      const answers: AnswerMap = {
        'q-background': { optionIds: ['no'] },
        'q-which': { text: 'should not be stored' },
      };

      const result = validateAnswers([controller, hiddenRequired], answers);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.answers['q-which']).toBeUndefined();
      }
    });
  });
});
