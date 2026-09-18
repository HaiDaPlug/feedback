'use client';

import { useMemo, useState } from 'react';
import { Brandmark } from '@/components/ui/Brandmark';
import { Button } from '@/components/ui/Button';
import { Eyebrow, Notice } from '@/components/ui/Section';
import { QuestionRenderer } from '@/components/questions/QuestionRenderer';
import { visibleQuestions } from '@/lib/form/visibility';
import type { AnswerMap, FormQuestion } from '@/lib/form/types';

/**
 * Phone-width preview using the real participant renderer and the real
 * visibility module, so conditional questions behave exactly as they will live.
 * The submit button is inert.
 *
 * Used centred on the Preview tab and, at desktop widths, as the sticky live
 * sidebar of the workspace (where `className` makes it scroll internally).
 */
export function PreviewFrame({
  eventName,
  eventDate,
  location,
  welcomeMessage,
  questions,
  className = '',
}: {
  eventName: string;
  eventDate: string;
  location: string | null;
  welcomeMessage: string | null;
  questions: FormQuestion[];
  className?: string;
}) {
  const [answers, setAnswers] = useState<AnswerMap>({});
  const shown = useMemo(() => visibleQuestions(questions, answers), [questions, answers]);

  const formattedDate = useMemo(() => {
    const [year, month, day] = eventDate.split('-').map(Number);
    // Mid-edit the date can be blank; show nothing rather than "Invalid Date".
    if (!year || !month || !day) return null;
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }, [eventDate]);

  const subtitle = [formattedDate, location].filter(Boolean).join(' · ');

  return (
    <div className={`card-raised w-full max-w-sm rounded-[1.25rem] bg-canvas p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>Live preview</Eyebrow>
        <span className="text-xs text-ink-faint">Nothing is saved</span>
      </div>

      {/* Mirrors the participant page header. */}
      <div className="mt-6 flex flex-col gap-5">
        <div className="border-b border-hairline pb-4">
          <Brandmark height={22} showProductName />
        </div>

        <div>
          {subtitle && <p className="text-eyebrow text-brand">{subtitle}</p>}
          <h3 className={`text-display text-ink ${subtitle ? 'mt-2' : ''}`}>
            {eventName || 'Untitled event'}
          </h3>
        </div>

        {welcomeMessage && (
          <p className="max-w-prose text-base leading-7 text-ink">{welcomeMessage}</p>
        )}

        <Notice tone="info">
          <span className="flex gap-2.5">
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
              className="mt-0.5 shrink-0 text-brand"
            >
              <rect x="3" y="7" width="10" height="7" rx="1.5" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
            </svg>
            <span>
              Your feedback is anonymous. Please avoid including your name or other
              identifying details in your answers.
            </span>
          </span>
        </Notice>
      </div>

      <div className="mt-8 flex flex-col gap-8">
        {shown.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No questions yet. They appear here as you add them.
          </p>
        ) : (
          shown.map((question, i) => (
            <QuestionRenderer
              key={question.id}
              index={i + 1}
              question={question}
              value={answers[question.id] ?? {}}
              onChange={(value) =>
                setAnswers((prev) => ({ ...prev, [question.id]: value }))
              }
            />
          ))
        )}
      </div>

      <div className="mt-8">
        <Button type="button" size="lg" fullWidth disabled>
          Submit feedback
        </Button>
        <p className="mt-2 text-center text-xs text-ink-faint">
          Anonymous. Nothing else is collected.
        </p>
      </div>
    </div>
  );
}
