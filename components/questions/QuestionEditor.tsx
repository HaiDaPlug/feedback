'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  CONTROL_CLASS,
  Checkbox,
  ErrorText,
  SELECT_CLASS,
  TextInput,
} from '@/components/ui/Field';
import { Eyebrow } from '@/components/ui/Section';
import { QUESTION_TYPE_LABELS, type FormQuestion } from '@/lib/form/types';
import { QUESTION_TYPES, type QuestionType } from '@/lib/db/schema';
import type { FormIssue } from '@/lib/form/validate-form';

/**
 * Editor for a single question. Presentational: all state lives in the parent
 * builder, which owns autosave.
 *
 * Hierarchy: the question text dominates; type and required sit in one quiet
 * row beneath it; help text, options, and the display rule only take space
 * when they apply.
 */

const CHOICE_TYPES: QuestionType[] = ['single_choice', 'multi_choice'];

/** Icon-only controls share one footprint: a 36px square at Button size "sm". */
const ICON_BUTTON_CLASS = 'min-w-9 px-2';

/**
 * The ghost variant sets its own hover colour, which Tailwind emits after ours
 * regardless of class order, so the destructive hover needs the important flag.
 */
const DESTRUCTIVE_HOVER_CLASS = 'hover:text-danger!';

const ICON_PATHS = {
  up: 'M4 10l4-4 4 4',
  down: 'M4 6l4 4 4-4',
  close: 'M4 4l8 8M12 4l-8 8',
} as const;

function Icon({ name }: { name: keyof typeof ICON_PATHS }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

export function QuestionEditor({
  question,
  index,
  total,
  issues,
  earlierChoiceQuestions,
  onChange,
  onRemove,
  onMove,
}: {
  question: FormQuestion;
  index: number;
  total: number;
  issues: FormIssue[];
  /** Single-choice questions positioned before this one -- valid rule sources. */
  earlierChoiceQuestions: FormQuestion[];
  onChange: (next: FormQuestion) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const issueFor = (field: FormIssue['field']) =>
    issues.find((issue) => issue.field === field)?.message;

  const isChoice = CHOICE_TYPES.includes(question.type);
  const ruleSource = earlierChoiceQuestions.find(
    (q) => q.id === question.visibleWhenQuestionId,
  );

  // Help text is revealed on demand so a fresh question is one field, not four.
  // Once open it stays open, so clearing the text never hides the field mid-edit.
  const [helpOpen, setHelpOpen] = useState(Boolean(question.helpText));
  const helpVisible = helpOpen || Boolean(question.helpText);

  function update(patch: Partial<FormQuestion>) {
    onChange({ ...question, ...patch });
  }

  function updateOption(optionId: string, label: string) {
    update({
      options: question.options.map((o) => (o.id === optionId ? { ...o, label } : o)),
    });
  }

  function addOption() {
    update({
      options: [
        ...question.options,
        { id: crypto.randomUUID(), label: `Option ${question.options.length + 1}` },
      ],
    });
  }

  function removeOption(optionId: string) {
    const nextOptions = question.options.filter((o) => o.id !== optionId);
    // If the removed option was the rule target, clear the rule rather than
    // leaving it dangling.
    const clearsRule = question.visibleWhenOptionId === optionId;
    update({
      options: nextOptions,
      ...(clearsRule ? { visibleWhenQuestionId: null, visibleWhenOptionId: null } : {}),
    });
  }

  function changeType(type: QuestionType) {
    const needsOptions = CHOICE_TYPES.includes(type);
    update({
      type,
      options:
        needsOptions && question.options.length === 0
          ? [
              { id: crypto.randomUUID(), label: 'Option 1' },
              { id: crypto.randomUUID(), label: 'Option 2' },
            ]
          : needsOptions
            ? question.options
            : [],
    });
  }

  const labelError = issueFor('label');
  const optionsError = issueFor('options');
  const conditionError = issueFor('condition');

  return (
    <li className="card p-4 transition-colors hover:border-hairline-strong focus-within:border-hairline-strong sm:p-5">
      {/* --- Header: numeral and quiet actions --- */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-well text-xs font-semibold tabular-nums text-ink-muted">
          <span className="sr-only">Question </span>
          {index + 1}
        </span>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={ICON_BUTTON_CLASS}
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Move "${question.label || 'question'}" up`}
          >
            <Icon name="up" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={ICON_BUTTON_CLASS}
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Move "${question.label || 'question'}" down`}
          >
            <Icon name="down" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={DESTRUCTIVE_HOVER_CLASS}
            onClick={onRemove}
            aria-label={`Remove "${question.label || 'question'}"`}
          >
            Remove
          </Button>
        </div>
      </div>

      {/* --- Question text: the dominant field --- */}
      <div className="mt-3">
        <label htmlFor={`${question.id}-label`} className="sr-only">
          Question text
        </label>
        <input
          id={`${question.id}-label`}
          value={question.label}
          onChange={(e) => update({ label: e.target.value })}
          maxLength={500}
          placeholder="Type your question"
          className={`${CONTROL_CLASS} text-[17px] font-medium`}
          aria-invalid={labelError ? true : undefined}
          aria-describedby={labelError ? `${question.id}-label-error` : undefined}
        />
        {labelError && <ErrorText id={`${question.id}-label-error`}>{labelError}</ErrorText>}
      </div>

      {/* --- Type and required --- */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="w-full sm:max-w-56">
          <label htmlFor={`${question.id}-type`} className="sr-only">
            Answer type
          </label>
          <select
            id={`${question.id}-type`}
            value={question.type}
            onChange={(e) => changeType(e.target.value as QuestionType)}
            className={SELECT_CLASS}
          >
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {QUESTION_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        <Checkbox
          label="Required"
          checked={question.required}
          onChange={(e) => update({ required: e.target.checked })}
        />

        {/* Same thing as picking "Multiple selection" in the type list, but
            discoverable from the question itself. */}
        {isChoice && (
          <Checkbox
            label="Allow choosing more than one"
            checked={question.type === 'multi_choice'}
            onChange={(e) => changeType(e.target.checked ? 'multi_choice' : 'single_choice')}
          />
        )}
      </div>

      {/* --- Help text (revealed on demand) --- */}
      {helpVisible ? (
        <div className="mt-4">
          <TextInput
            id={`${question.id}-help-text`}
            label="Help text"
            optional
            value={question.helpText ?? ''}
            onChange={(e) => update({ helpText: e.target.value || null })}
            maxLength={500}
            // Only ever true when the field was just revealed by the button
            // above: on page load the field is mounted only if text exists.
            autoFocus={!question.helpText}
          />
        </div>
      ) : (
        <div className="-ml-3 mt-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setHelpOpen(true)}>
            Add help text
          </Button>
        </div>
      )}

      {/* --- Options --- */}
      {isChoice && (
        <div className="mt-4">
          <Eyebrow>Options</Eyebrow>

          <ul className="mt-2 flex flex-col gap-2">
            {question.options.map((option, optionIndex) => (
              <li key={option.id} className="flex items-center gap-2">
                <input
                  value={option.label}
                  onChange={(e) => updateOption(option.id, e.target.value)}
                  maxLength={200}
                  aria-label={`Option ${optionIndex + 1}`}
                  className={`${CONTROL_CLASS} min-w-0`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`${ICON_BUTTON_CLASS} ${DESTRUCTIVE_HOVER_CLASS} shrink-0`}
                  onClick={() => removeOption(option.id)}
                  aria-label={`Remove option ${optionIndex + 1}`}
                >
                  <Icon name="close" />
                </Button>
              </li>
            ))}
          </ul>

          {optionsError && (
            <ErrorText id={`${question.id}-options-error`}>{optionsError}</ErrorText>
          )}

          <div className="-ml-3 mt-2">
            <Button type="button" variant="ghost" size="sm" onClick={addOption}>
              <span aria-hidden="true">+</span>
              Add option
            </Button>
          </div>
        </div>
      )}

      {/* --- Conditional rule --- */}
      {earlierChoiceQuestions.length > 0 && (
        <div className="mt-4 rounded-lg bg-well p-3">
          <Eyebrow>Show only when</Eyebrow>

          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <select
              aria-label="Controlling question"
              value={question.visibleWhenQuestionId ?? ''}
              onChange={(e) =>
                update({
                  visibleWhenQuestionId: e.target.value || null,
                  visibleWhenOptionId: null,
                })
              }
              className={`${SELECT_CLASS} min-w-0 sm:flex-1`}
            >
              <option value="">Always show</option>
              {earlierChoiceQuestions.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label || 'Untitled question'}
                </option>
              ))}
            </select>

            {ruleSource && (
              <select
                aria-label="Required answer"
                value={question.visibleWhenOptionId ?? ''}
                onChange={(e) =>
                  update({ visibleWhenOptionId: e.target.value || null })
                }
                className={`${SELECT_CLASS} min-w-0 sm:flex-1`}
              >
                <option value="">Choose an answer</option>
                {ruleSource.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    is &ldquo;{option.label}&rdquo;
                  </option>
                ))}
              </select>
            )}
          </div>

          {conditionError && (
            <ErrorText id={`${question.id}-condition-error`}>{conditionError}</ErrorText>
          )}
        </div>
      )}
    </li>
  );
}
