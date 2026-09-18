'use client';

import { CONTROL_CLASS } from '@/components/ui/Field';
import { RATING_MAX, RATING_MIN, TEXT_LIMITS } from '@/lib/form/types';
import type { AnswerValue, FormQuestion } from '@/lib/form/types';

/**
 * Participant-facing question rendering.
 *
 * Mobile-first throughout: full-width controls, 44px+ touch targets, 16px type
 * (prevents iOS zoom-on-focus), and native inputs so the correct phone keyboard
 * appears. Choice and rating controls are real radio/checkbox inputs visually
 * restyled, so keyboard and screen-reader behaviour comes for free. The native
 * input is visually hidden, so keyboard focus is surfaced on the row/cell via
 * `:has(:focus-visible)`.
 *
 * `index` is optional: the participant form passes the number the participant
 * actually sees (conditional questions renumber naturally); the moderator
 * preview omits it.
 */

const FOCUS_RING =
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand';

export function QuestionRenderer({
  question,
  value,
  onChange,
  error,
  fieldRef,
  index,
}: {
  question: FormQuestion;
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
  error?: string;
  fieldRef?: (el: HTMLElement | null) => void;
  /** Visible question number. When omitted, no numeral is rendered. */
  index?: number;
}) {
  const errorId = `${question.id}-error`;
  const helpId = `${question.id}-help`;
  const describedBy =
    [question.helpText ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') ||
    undefined;
  const numbered = typeof index === 'number';

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="block text-lg font-medium leading-snug text-ink">
        <span
          className={
            numbered ? 'grid grid-cols-[1.5rem_minmax(0,1fr)] items-baseline' : 'block'
          }
        >
          {numbered && (
            <span
              aria-hidden="true"
              className="text-sm font-semibold tabular-nums text-ink-faint"
            >
              {index}
            </span>
          )}
          <span>
            {question.label}
            {question.required ? (
              <>
                <span className="ml-1 text-danger" aria-hidden="true">
                  *
                </span>
                <span className="sr-only"> (required)</span>
              </>
            ) : (
              // A real space, not a margin: if the marker wraps to its own line it
              // must start flush with the label rather than indented.
              <>
                {' '}
                <span className="text-sm font-normal whitespace-nowrap text-ink-faint">
                  Optional
                </span>
              </>
            )}
          </span>
        </span>
      </legend>

      <div className={numbered ? 'pl-6' : undefined}>
        {question.helpText && (
          <p id={helpId} className="mt-1 text-sm leading-5 text-ink-muted">
            {question.helpText}
          </p>
        )}

        <div className="mt-3">
          <Control
            question={question}
            value={value}
            onChange={onChange}
            describedBy={describedBy}
            invalid={Boolean(error)}
            fieldRef={fieldRef}
          />
        </div>

        {error && (
          <p id={errorId} role="alert" className="mt-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </fieldset>
  );
}

function Control({
  question,
  value,
  onChange,
  describedBy,
  invalid,
  fieldRef,
}: {
  question: FormQuestion;
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
  describedBy?: string;
  invalid: boolean;
  fieldRef?: (el: HTMLElement | null) => void;
}) {
  switch (question.type) {
    case 'short_text': {
      const text = value.text ?? '';
      return (
        <>
          <input
            ref={fieldRef as (el: HTMLInputElement | null) => void}
            type="text"
            className={`${CONTROL_CLASS} min-h-12`}
            value={text}
            maxLength={TEXT_LIMITS.short_text}
            onChange={(e) => onChange({ text: e.target.value })}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            enterKeyHint="next"
            autoComplete="off"
          />
          <CharacterCount length={text.length} max={TEXT_LIMITS.short_text} />
        </>
      );
    }

    case 'long_text': {
      const text = value.text ?? '';
      return (
        <>
          <textarea
            ref={fieldRef as (el: HTMLTextAreaElement | null) => void}
            className={`${CONTROL_CLASS} min-h-32 resize-y`}
            rows={4}
            value={text}
            maxLength={TEXT_LIMITS.long_text}
            onChange={(e) => onChange({ text: e.target.value })}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            enterKeyHint="enter"
            autoComplete="off"
          />
          <CharacterCount length={text.length} max={TEXT_LIMITS.long_text} />
        </>
      );
    }

    case 'rating':
      return (
        <RatingControl
          question={question}
          value={value}
          onChange={onChange}
          describedBy={describedBy}
          fieldRef={fieldRef}
        />
      );

    case 'single_choice':
    case 'multi_choice':
      return (
        <ChoiceControl
          question={question}
          value={value}
          onChange={onChange}
          describedBy={describedBy}
          fieldRef={fieldRef}
        />
      );
  }
}

/**
 * Quiet character counter. Stays out of the way until the value passes 80% of
 * the limit; the live region is always present so the first announcement is
 * not missed.
 */
function CharacterCount({ length, max }: { length: number; max: number }) {
  const show = length >= Math.ceil(max * 0.8);
  return (
    <p
      aria-live="polite"
      className={show ? 'mt-1.5 text-right text-xs tabular-nums text-ink-faint' : 'sr-only'}
    >
      {show ? `${length} / ${max}` : ''}
    </p>
  );
}

/**
 * 1-5 rating as five tappable cells rather than stars: unambiguous on a phone,
 * accessible as a radio group, and readable without relying on icon meaning.
 * The anchor row under the cells says which end is which.
 */
function RatingControl({
  question,
  value,
  onChange,
  describedBy,
  fieldRef,
}: {
  question: FormQuestion;
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
  describedBy?: string;
  fieldRef?: (el: HTMLElement | null) => void;
}) {
  const scores = Array.from(
    { length: RATING_MAX - RATING_MIN + 1 },
    (_, i) => RATING_MIN + i,
  );

  return (
    <>
      <div
        className="grid grid-cols-5 gap-2"
        role="radiogroup"
        aria-describedby={describedBy}
        aria-label={question.label}
      >
        {scores.map((score, index) => {
          const selected = value.number === score;
          return (
            <label
              key={score}
              className={[
                'flex min-h-14 cursor-pointer items-center justify-center rounded-xl border',
                'text-lg font-semibold select-none transition-colors duration-150',
                FOCUS_RING,
                selected
                  ? 'border-brand bg-brand text-brand-fg'
                  : 'border-hairline-strong bg-surface text-ink hover:border-ink-faint',
              ].join(' ')}
            >
              <input
                ref={index === 0 ? (fieldRef as (el: HTMLInputElement | null) => void) : undefined}
                type="radio"
                name={question.id}
                value={score}
                checked={selected}
                onChange={() => onChange({ number: score })}
                className="sr-only"
              />
              {score}
              <span className="sr-only">
                {score === RATING_MIN ? ' (lowest)' : score === RATING_MAX ? ' (highest)' : ''}
              </span>
            </label>
          );
        })}
      </div>
      <div aria-hidden="true" className="mt-1.5 flex justify-between text-xs text-ink-faint">
        <span>Lowest</span>
        <span>Highest</span>
      </div>
    </>
  );
}

function ChoiceControl({
  question,
  value,
  onChange,
  describedBy,
  fieldRef,
}: {
  question: FormQuestion;
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
  describedBy?: string;
  fieldRef?: (el: HTMLElement | null) => void;
}) {
  const multiple = question.type === 'multi_choice';
  const selected = new Set(value.optionIds ?? []);

  function toggle(optionId: string) {
    if (!multiple) {
      onChange({ optionIds: [optionId] });
      return;
    }

    const next = new Set(selected);
    if (next.has(optionId)) next.delete(optionId);
    else next.add(optionId);
    onChange({ optionIds: [...next] });
  }

  return (
    <div
      className="flex flex-col gap-2"
      role={multiple ? 'group' : 'radiogroup'}
      aria-describedby={describedBy}
      aria-label={question.label}
    >
      {question.options.map((option, index) => {
        const isSelected = selected.has(option.id);
        return (
          <label
            key={option.id}
            className={[
              'flex min-h-13 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3',
              'text-base text-ink select-none transition-colors duration-150',
              FOCUS_RING,
              isSelected
                ? 'border-brand bg-brand-soft'
                : 'border-hairline-strong bg-surface hover:border-ink-faint',
            ].join(' ')}
          >
            <input
              ref={index === 0 ? (fieldRef as (el: HTMLInputElement | null) => void) : undefined}
              type={multiple ? 'checkbox' : 'radio'}
              name={question.id}
              value={option.id}
              checked={isSelected}
              onChange={() => toggle(option.id)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={[
                'flex h-5 w-5 shrink-0 items-center justify-center border transition-colors duration-150',
                multiple ? 'rounded' : 'rounded-full',
                isSelected
                  ? 'border-brand bg-brand text-brand-fg'
                  : 'border-hairline-strong bg-surface',
              ].join(' ')}
            >
              {isSelected &&
                (multiple ? (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2.5 6.5 5 9l4.5-6" />
                  </svg>
                ) : (
                  <span className="block h-2 w-2 rounded-full bg-brand-fg" />
                ))}
            </span>
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
