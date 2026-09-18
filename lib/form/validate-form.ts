import { CONDITION_SOURCE_TYPES, type FormQuestion } from './types';

/**
 * Moderator-side form validation: catches structural problems in the question
 * set before a form can be opened for collection.
 */

export type FormIssue = {
  questionId: string | null;
  field: 'label' | 'options' | 'condition' | 'form';
  message: string;
};

const CHOICE_TYPES = new Set(['single_choice', 'multi_choice']);

export function validateForm(questions: FormQuestion[]): FormIssue[] {
  const issues: FormIssue[] = [];
  const ordered = [...questions].sort((a, b) => a.position - b.position);
  const positionById = new Map(ordered.map((q, index) => [q.id, index]));
  const byId = new Map(ordered.map((q) => [q.id, q]));

  if (ordered.length === 0) {
    issues.push({
      questionId: null,
      field: 'form',
      message: 'Add at least one question before opening this event.',
    });
  }

  for (const question of ordered) {
    // --- Label -----------------------------------------------------------
    if (!question.label.trim()) {
      issues.push({
        questionId: question.id,
        field: 'label',
        message: 'Question text cannot be blank.',
      });
    }

    // --- Options ---------------------------------------------------------
    if (CHOICE_TYPES.has(question.type)) {
      const options = question.options ?? [];
      const labels = options.map((o) => o.label.trim());

      if (options.length < 2) {
        issues.push({
          questionId: question.id,
          field: 'options',
          message: 'Choice questions need at least two options.',
        });
      }

      if (labels.some((label) => !label)) {
        issues.push({
          questionId: question.id,
          field: 'options',
          message: 'Options cannot be blank.',
        });
      }

      const seen = new Set<string>();
      const duplicated = labels.some((label) => {
        const key = label.toLowerCase();
        if (!key) return false;
        if (seen.has(key)) return true;
        seen.add(key);
        return false;
      });

      if (duplicated) {
        issues.push({
          questionId: question.id,
          field: 'options',
          message: 'Options must be unique.',
        });
      }
    }

    // --- Conditional rule ------------------------------------------------
    const { visibleWhenQuestionId, visibleWhenOptionId } = question;

    if (visibleWhenQuestionId || visibleWhenOptionId) {
      if (!visibleWhenQuestionId || !visibleWhenOptionId) {
        issues.push({
          questionId: question.id,
          field: 'condition',
          message: 'Choose both a question and an option for the display rule.',
        });
        continue;
      }

      const source = byId.get(visibleWhenQuestionId);

      if (!source) {
        issues.push({
          questionId: question.id,
          field: 'condition',
          message: 'The question this rule depends on no longer exists.',
        });
        continue;
      }

      if (!CONDITION_SOURCE_TYPES.includes(source.type)) {
        issues.push({
          questionId: question.id,
          field: 'condition',
          message: 'Display rules can only depend on a single-choice question.',
        });
        continue;
      }

      const sourceIndex = positionById.get(source.id) ?? -1;
      const selfIndex = positionById.get(question.id) ?? -1;

      if (sourceIndex >= selfIndex) {
        issues.push({
          questionId: question.id,
          field: 'condition',
          message: 'Display rules can only depend on an earlier question.',
        });
        continue;
      }

      const optionExists = (source.options ?? []).some(
        (option) => option.id === visibleWhenOptionId,
      );

      if (!optionExists) {
        issues.push({
          questionId: question.id,
          field: 'condition',
          message: 'The option this rule depends on has been removed.',
        });
      }
    }
  }

  return issues;
}

/** Convenience helper for gating the "Open collection" action. */
export function isFormPublishable(questions: FormQuestion[]): boolean {
  return validateForm(questions).length === 0;
}
