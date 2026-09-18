'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QuestionEditor } from './QuestionEditor';
import { Button } from '@/components/ui/Button';
import { SaveControls, type SaveControlsState } from '@/components/ui/SaveControls';
import type { SaveState } from '@/components/ui/SaveIndicator';
import { Eyebrow, Notice, SectionHeader } from '@/components/ui/Section';
import { validateForm } from '@/lib/form/validate-form';
import {
  CONDITION_SOURCE_TYPES,
  QUESTION_TYPE_LABELS,
  type FormQuestion,
} from '@/lib/form/types';
import { QUESTION_TYPES, type QuestionType } from '@/lib/db/schema';

/**
 * The question builder.
 *
 * Save contract: edits are debounced and saved automatically, and a Save
 * button saves immediately. The status is visible at all times. Nothing is
 * ever silently discarded -- when a save fails a warning says so, the edits
 * stay on screen, and both the button and the warning offer a retry.
 *
 * Ids: the server may re-key questions (it does when a version with
 * responses is cloned). After every successful save the builder records the
 * server's id for each question in `idAlias` and sends those ids from then
 * on, while the on-screen list keeps its original ids so React keys, focus,
 * and in-flight typing are undisturbed.
 */

const AUTOSAVE_DELAY_MS = 900;

export type SaveResult = {
  ok: boolean;
  message?: string;
  questions?: FormQuestion[];
};

export function QuestionBuilder({
  eventId,
  initialQuestions,
  onSave,
  onQuestionsChange,
  onSaveControlsChange,
}: {
  eventId: string;
  initialQuestions: FormQuestion[];
  onSave: (eventId: string, input: { questions: unknown[] }) => Promise<SaveResult>;
  /** Mirrors every edit upward so the workspace can feed the live preview. */
  onQuestionsChange?: (questions: FormQuestion[]) => void;
  /**
   * Mirrors the save status and a save trigger upward. When provided, the
   * workspace renders the controls beside the live preview on wide screens
   * and this builder hides its own copy there (`xl:hidden`), so the controls
   * exist exactly once at every width.
   */
  onSaveControlsChange?: (controls: SaveControlsState) => void;
}) {
  const [questions, setQuestions] = useState<FormQuestion[]>(initialQuestions);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Serialized snapshot of what is known to be persisted, so we do not save on
  // first mount or re-save an unchanged form.
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initialQuestions));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Client id -> id the server actually stored it under.
  const idAlias = useRef(new Map<string, string>());

  const issues = useMemo(() => validateForm(questions), [questions]);
  const dirty = JSON.stringify(questions) !== savedSnapshot;

  const save = useCallback(
    async (next: FormQuestion[]) => {
      if (timer.current) clearTimeout(timer.current);
      const snapshot = JSON.stringify(next);
      const serverId = (id: string | null) => (id ? (idAlias.current.get(id) ?? id) : null);
      setSaveState('saving');

      const result = await onSave(eventId, {
        questions: next.map((question) => ({
          id: serverId(question.id),
          type: question.type,
          label: question.label,
          helpText: question.helpText,
          required: question.required,
          options: question.options,
          visibleWhenQuestionId: serverId(question.visibleWhenQuestionId),
          visibleWhenOptionId: question.visibleWhenOptionId,
        })),
      });

      if (result.ok) {
        // Adopt the server's ids by position: it saved exactly what we sent,
        // in order, possibly under different ids.
        result.questions?.forEach((saved, index) => {
          const sent = next[index];
          if (sent && saved.id !== sent.id) idAlias.current.set(sent.id, saved.id);
        });
        setSavedSnapshot(snapshot);
        setSaveError(null);
        setSaveState('saved');
      } else {
        setSaveError(result.message ?? 'Could not save.');
        setSaveState('error');
      }
    },
    [eventId, onSave],
  );

  // Debounced autosave.
  useEffect(() => {
    if (!dirty) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(questions), AUTOSAVE_DELAY_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [questions, dirty, save]);

  // Warn before leaving with unsaved edits -- never imply they were saved.
  useEffect(() => {
    function handler(event: BeforeUnloadEvent) {
      if (dirty) event.preventDefault();
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Live mirror for the workspace preview. Autosave above is untouched.
  useEffect(() => {
    onQuestionsChange?.(questions);
  }, [questions, onQuestionsChange]);

  useEffect(() => {
    onSaveControlsChange?.({ state: saveState, dirty, save: () => void save(questions) });
  }, [saveState, dirty, questions, save, onSaveControlsChange]);

  function addQuestion(type: QuestionType) {
    const needsOptions = type === 'single_choice' || type === 'multi_choice';
    setQuestions((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        position: prev.length,
        type,
        label: '',
        helpText: null,
        required: false,
        options: needsOptions
          ? [
              { id: crypto.randomUUID(), label: 'Option 1' },
              { id: crypto.randomUUID(), label: 'Option 2' },
            ]
          : [],
        visibleWhenQuestionId: null,
        visibleWhenOptionId: null,
      },
    ]);
  }

  function move(index: number, direction: -1 | 1) {
    setQuestions((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;

      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((question, i) => ({ ...question, position: i }));
    });
  }

  function remove(id: string) {
    setQuestions((prev) =>
      prev
        .filter((question) => question.id !== id)
        // Clear any rule that pointed at the removed question.
        .map((question) =>
          question.visibleWhenQuestionId === id
            ? { ...question, visibleWhenQuestionId: null, visibleWhenOptionId: null }
            : question,
        )
        .map((question, index) => ({ ...question, position: index })),
    );
  }

  function change(next: FormQuestion) {
    setQuestions((prev) => {
      // A question that stops being a valid rule source (e.g. switched to
      // multiple selection) can no longer drive other questions.
      const lostRuleSource = !CONDITION_SOURCE_TYPES.includes(next.type);
      return prev.map((q) => {
        if (q.id === next.id) return next;
        if (lostRuleSource && q.visibleWhenQuestionId === next.id) {
          return { ...q, visibleWhenQuestionId: null, visibleWhenOptionId: null };
        }
        return q;
      });
    });
  }

  const count = questions.length;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <SectionHeader
          title="Questions"
          description={
            count > 0 ? `${count} ${count === 1 ? 'question' : 'questions'}` : undefined
          }
          actions={
            <SaveControls
              state={saveState}
              dirty={dirty}
              save={() => void save(questions)}
              className={onSaveControlsChange ? 'xl:hidden' : ''}
            />
          }
        />

        {saveState === 'error' && (
          <Notice tone="danger" role="alert">
            <strong className="font-semibold">Your latest edits are not saved.</strong>{' '}
            {saveError} They are still on this screen; press Save to try again, and
            don&rsquo;t leave or reload the page until it says Saved.
          </Notice>
        )}

        {/* Standing reminder -- keeps identifying fields out of forms. */}
        <Notice tone="info">
          Feedback is anonymous. Please don&rsquo;t ask for names, contact details, or
          personal information specific enough to identify someone.
        </Notice>
      </div>

      {count === 0 ? (
        <div className="rounded-xl border border-dashed border-hairline px-6 py-10 text-center">
          <p className="text-base font-medium text-ink">No questions yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            Pick a type to add your first question.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <TypeChips onAdd={addQuestion} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-4">
            {questions.map((question, index) => (
              <QuestionEditor
                key={question.id}
                question={question}
                index={index}
                total={questions.length}
                issues={issues.filter((issue) => issue.questionId === question.id)}
                earlierChoiceQuestions={questions
                  .slice(0, index)
                  .filter((q) => CONDITION_SOURCE_TYPES.includes(q.type))}
                onChange={change}
                onRemove={() => remove(question.id)}
                onMove={(direction) => move(index, direction)}
              />
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Eyebrow className="w-full sm:w-auto">Add a question</Eyebrow>
            <div className="flex flex-wrap gap-2">
              <TypeChips onAdd={addQuestion} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** One chip per question type; the same set serves the empty state and the add row. */
function TypeChips({ onAdd }: { onAdd: (type: QuestionType) => void }) {
  return (
    <>
      {QUESTION_TYPES.map((type) => (
        <Button
          key={type}
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onAdd(type)}
        >
          <span aria-hidden="true" className="text-ink-faint">
            +
          </span>
          <span className="sr-only">Add </span>
          {QUESTION_TYPE_LABELS[type]}
        </Button>
      ))}
    </>
  );
}
