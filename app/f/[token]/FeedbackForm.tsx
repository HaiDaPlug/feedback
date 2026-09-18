'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QuestionRenderer } from '@/components/questions/QuestionRenderer';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Section';
import { visibleQuestions } from '@/lib/form/visibility';
import type { AnswerMap, AnswerValue, FormQuestion } from '@/lib/form/types';

/**
 * The participant feedback form.
 *
 * Behaviours that matter:
 *  - One scrollable page, no step wizard.
 *  - Answers live in React state, so a failed submission NEVER loses typed text.
 *  - A single idempotency key is generated per form load and reused on every
 *    retry, so repeated taps or a network retry cannot create a second record.
 *  - Success renders only after the server confirms the write.
 */

type SubmitState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'error'; message: string; fieldErrors: Record<string, string> };

export function FeedbackForm({
  token,
  formVersionId,
  questions,
}: {
  token: string;
  formVersionId: string;
  questions: FormQuestion[];
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [state, setState] = useState<SubmitState>({ phase: 'idle' });

  // Stable for the lifetime of this form load. Retrying reuses it; a genuinely
  // new submission only happens after a fresh page load.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const errorSummaryRef = useRef<HTMLDivElement | null>(null);

  // Visibility is recomputed on every render from the same module the server
  // uses, so what the participant sees and what the server validates agree.
  const shown = useMemo(() => visibleQuestions(questions, answers), [questions, answers]);

  const setAnswer = useCallback((questionId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (state.phase === 'submitting') return;

    setState({ phase: 'submitting' });

    // Send only answers for questions currently visible. The server strips
    // hidden answers again regardless -- this is convenience, not the guarantee.
    const visibleIds = new Set(shown.map((q) => q.id));
    const payload: AnswerMap = {};
    for (const [questionId, value] of Object.entries(answers)) {
      if (visibleIds.has(questionId)) payload[questionId] = value;
    }

    try {
      const response = await fetch(`/api/f/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey, formVersionId, answers: payload }),
      });

      const body = await response.json().catch(() => ({}));

      if (response.ok) {
        router.push(`/f/${token}/thanks`);
        return;
      }

      const fieldErrors: Record<string, string> = {};
      if (Array.isArray(body.errors)) {
        for (const error of body.errors) {
          if (error?.questionId && error?.message) {
            fieldErrors[error.questionId] = error.message;
          }
        }
      }

      setState({
        phase: 'error',
        message:
          body.message ??
          'We could not save your feedback. Your answers are still here -- please try again.',
        fieldErrors,
      });

      // Move focus to the first problem so it is not missed on a small screen.
      const firstErrorId = Object.keys(fieldErrors)[0];
      requestAnimationFrame(() => {
        const target = firstErrorId ? fieldRefs.current[firstErrorId] : null;
        if (target) target.focus();
        else errorSummaryRef.current?.focus();
      });
    } catch {
      setState({
        phase: 'error',
        message:
          'We could not reach the server. Your answers are still here -- check your connection and try again.',
        fieldErrors: {},
      });
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
    }
  }

  const fieldErrors = state.phase === 'error' ? state.fieldErrors : {};

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-9">
      {state.phase === 'error' && (
        // The wrapper is the programmatic focus target; the Notice carries the
        // alert semantics.
        <div ref={errorSummaryRef} tabIndex={-1} className="outline-none">
          <Notice tone="danger" role="alert">
            {state.message}
          </Notice>
        </div>
      )}

      {shown.map((question, i) => (
        <QuestionRenderer
          key={question.id}
          index={i + 1}
          question={question}
          value={answers[question.id] ?? {}}
          onChange={(value) => setAnswer(question.id, value)}
          error={fieldErrors[question.id]}
          fieldRef={(el) => {
            fieldRefs.current[question.id] = el;
          }}
        />
      ))}

      <div className="pb-safe sticky bottom-0 -mx-4 border-t border-hairline bg-canvas/90 px-4 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button
          type="submit"
          size="lg"
          fullWidth
          disabled={state.phase === 'submitting'}
          aria-busy={state.phase === 'submitting'}
        >
          {state.phase === 'submitting' ? 'Sending...' : 'Submit feedback'}
        </Button>
        <p className="mt-2 text-center text-xs text-ink-faint">
          Anonymous. Nothing else is collected.
        </p>
      </div>
    </form>
  );
}
