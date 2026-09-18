import { describe, expect, it } from 'vitest';
import { isFormPublishable, validateForm } from '@/lib/form/validate-form';
import { DEFAULT_TEMPLATE, buildTemplateQuestions } from '@/lib/form/default-template';
import type { FormQuestion } from '@/lib/form/types';

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

describe('validateForm', () => {
  it('accepts a simple valid form', () => {
    expect(validateForm([question({ id: 'q1' })])).toEqual([]);
  });

  it('rejects an empty form', () => {
    expect(validateForm([])).toHaveLength(1);
  });

  it('rejects a blank question label', () => {
    const issues = validateForm([question({ id: 'q1', label: '   ' })]);
    expect(issues.some((i) => i.field === 'label')).toBe(true);
  });

  it('rejects a choice question with fewer than two options', () => {
    const issues = validateForm([
      question({
        id: 'q1',
        type: 'single_choice',
        options: [{ id: 'a', label: 'Only one' }],
      }),
    ]);

    expect(issues.some((i) => i.field === 'options')).toBe(true);
  });

  it('rejects duplicate option labels', () => {
    const issues = validateForm([
      question({
        id: 'q1',
        type: 'multi_choice',
        options: [
          { id: 'a', label: 'Same' },
          { id: 'b', label: 'same' },
        ],
      }),
    ]);

    expect(issues.some((i) => i.field === 'options')).toBe(true);
  });

  it('rejects a blank option', () => {
    const issues = validateForm([
      question({
        id: 'q1',
        type: 'single_choice',
        options: [
          { id: 'a', label: 'Fine' },
          { id: 'b', label: '  ' },
        ],
      }),
    ]);

    expect(issues.some((i) => i.field === 'options')).toBe(true);
  });

  describe('conditional rules', () => {
    const source = question({
      id: 'q-source',
      position: 0,
      type: 'single_choice',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
    });

    it('accepts a rule on an earlier single-choice question', () => {
      const issues = validateForm([
        source,
        question({
          id: 'q-dep',
          position: 1,
          visibleWhenQuestionId: 'q-source',
          visibleWhenOptionId: 'yes',
        }),
      ]);

      expect(issues).toEqual([]);
    });

    it('rejects a rule pointing at a later question', () => {
      const issues = validateForm([
        question({
          id: 'q-dep',
          position: 0,
          visibleWhenQuestionId: 'q-source',
          visibleWhenOptionId: 'yes',
        }),
        { ...source, position: 1 },
      ]);

      expect(issues.some((i) => i.field === 'condition')).toBe(true);
    });

    it('rejects a rule pointing at a non-single-choice question', () => {
      const issues = validateForm([
        question({ id: 'q-text', position: 0, type: 'long_text' }),
        question({
          id: 'q-dep',
          position: 1,
          visibleWhenQuestionId: 'q-text',
          visibleWhenOptionId: 'yes',
        }),
      ]);

      expect(issues.some((i) => i.field === 'condition')).toBe(true);
    });

    it('rejects a rule pointing at a removed option', () => {
      const issues = validateForm([
        source,
        question({
          id: 'q-dep',
          position: 1,
          visibleWhenQuestionId: 'q-source',
          visibleWhenOptionId: 'deleted-option',
        }),
      ]);

      expect(issues.some((i) => i.field === 'condition')).toBe(true);
    });

    it('rejects a half-configured rule', () => {
      const issues = validateForm([
        source,
        question({ id: 'q-dep', position: 1, visibleWhenQuestionId: 'q-source' }),
      ]);

      expect(issues.some((i) => i.field === 'condition')).toBe(true);
    });
  });
});

describe('default template', () => {
  const questions = buildTemplateQuestions('form-version-1').map((q) => ({
    ...q,
    helpText: q.helpText ?? null,
  })) as FormQuestion[];

  it('is publishable as shipped', () => {
    expect(isFormPublishable(questions)).toBe(true);
  });

  it('matches the specified five questions', () => {
    expect(DEFAULT_TEMPLATE).toHaveLength(5);
    expect(questions[0].label).toBe('How was the event overall?');
    expect(questions[0].type).toBe('rating');
    expect(questions[0].required).toBe(true);
  });

  it('keeps every question except the overall rating optional', () => {
    expect(questions.filter((q) => q.required)).toHaveLength(1);
  });

  it('keeps background questions optional, since answers can identify someone', () => {
    const background = questions.find((q) =>
      q.label.startsWith('Have you previously been part'),
    );
    const which = questions.find((q) => q.label.startsWith('Which organizations'));

    expect(background?.required).toBe(false);
    expect(which?.required).toBe(false);
  });

  it('wires the follow-up to appear only on Yes', () => {
    const background = questions.find((q) =>
      q.label.startsWith('Have you previously been part'),
    );
    const which = questions.find((q) => q.label.startsWith('Which organizations'));

    expect(which?.visibleWhenQuestionId).toBe(background?.id);
    expect(which?.visibleWhenOptionId).toBe('yes');
  });

  it('asks for no direct identifiers', () => {
    const labels = DEFAULT_TEMPLATE.map((q) => q.label.toLowerCase()).join(' ');

    for (const forbidden of ['your name', 'email', 'phone', 'contact']) {
      expect(labels).not.toContain(forbidden);
    }
  });
});
