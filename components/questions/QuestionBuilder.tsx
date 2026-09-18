'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QuestionEditor } from './QuestionEditor';
import { Button } from '@/components/ui/Button';
import { SaveIndicator, type SaveState } from '@/components/ui/SaveIndicator';
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
 * Autosave contract: edits are debounced and saved automatically, with a
 * visible state at all times. Nothing is ever silently discarded -- when a save
 * fails the status says so and offers a retry, and the edits stay on screen.
 */

const AUTOSAVE_DELAY_MS = 900;

export function QuestionBuilder({
  eventId,
  initialQuestions,
  onSave,
  onQuestionsChange,
}: {
  eventId: string;
  initialQuestions: FormQuestion[];
  onSave: (
    eventId: string,
    input: { questions: unknown[] },
  ) => Promise<{ ok: boolean; message?: string }>;
  /** Mirrors every edit upward so the workspace can feed the live preview. */
  onQuestionsChange?: (questions: FormQuestion[]) => void;
}) {
  const [questions, setQuestions] = useState<FormQuestion[]>(initialQuestions);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // Serialized snapshot of what is known to be persisted, so we do not save on
  // first mount or re-save an unchanged form.
  const savedSnapshot = useRef(JSON.stringify(initialQuestions));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const issues = useMemo(() => validateForm(questions), [questions]);

  const save = useCallback(
    async (next: FormQuestion[]) => {
      const snapshot = JSON.stringify(next);
      setSaveState('saving');

      const result = await onSave(eventId, {
        questions: next.map((question) => ({
          id: question.id,
          type: question.type,
          label: question.label,
          helpText: question.helpText,
          required: question.required,
          options: question.options,
          visibleWhenQuestionId: question.visibleWhenQuestionId,
          visibleWhenOptionId: question.visibleWhenOptionId,
        })),
      });

      if (result.ok) {
        savedSnapshot.current = snapshot;
        setSaveState('saved');
      } else {
        setSaveState('error');
      }
    },
    [eventId, onSave],
  );

  // Debounced autosave.
  useEffect(() => {
    const snapshot = JSON.stringify(questions);
    if (snapshot === savedSnapshot.current) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(questions), AUTOSAVE_DELAY_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [questions, save]);

  // Warn before leaving with unsaved edits -- never imply they were saved.
  useEffect(() => {
    function handler(event: BeforeUnloadEvent) {
      if (JSON.stringify(questions) !== savedSnapshot.current) {
        event.preventDefault();
      }
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [questions]);

  // Live mirror for the workspace preview. Autosave above is untouched.
  useEffect(() => {
    onQuestionsChange?.(questions);
  }, [questions, onQuestionsChange]);

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

  const count = questions.length;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <SectionHeader
          title="Questions"
          description={
            count > 0 ? `${count} ${count === 1 ? 'question' : 'questions'}` : undefined
          }
          actions={<SaveIndicator state={saveState} onRetry={() => void save(questions)} />}
        />

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
                onChange={(next) =>
                  setQuestions((prev) =>
                    prev.map((q) => (q.id === next.id ? next : q)),
                  )
                }
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
