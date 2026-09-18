'use client';

import { useMemo, useState } from 'react';
import { Brandmark } from '@/components/ui/Brandmark';
import { Button } from '@/components/ui/Button';
import { Iphone, IPHONE_ISLAND_INSET_PCT } from '@/components/ui/Iphone';
import { Eyebrow } from '@/components/ui/Section';
import { QuestionRenderer } from '@/components/questions/QuestionRenderer';
import { visibleQuestions } from '@/lib/form/visibility';
import type { AnswerMap, FormQuestion } from '@/lib/form/types';

/**
 * Phone-width preview using the real participant renderer and the real
 * visibility module, so conditional questions behave exactly as they will live.
 * The submit button is inert.
 *
 * Rendered inside an iPhone frame: the screen scrolls internally, so the
 * frame keeps its size while the content grows. Used centred on the Preview
 * tab and, at desktop widths, as the sticky live sidebar of the workspace
 * (where `className` constrains the phone's width to the viewport height).
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
    <div className={`w-full max-w-sm ${className}`}>
      <div className="flex items-center justify-between gap-3 px-1">
        <Eyebrow>Live preview</Eyebrow>
        <span className="text-xs text-ink-faint">Nothing is saved</span>
      </div>

      <Iphone className="mt-3">
        {/* Screen: same canvas, motif and gutters as the participant page,
            with the top inset pushed below the Dynamic Island. */}
        <div
          className="bg-brand-motif min-h-full bg-canvas px-4 pb-6"
          style={{ paddingTop: `${IPHONE_ISLAND_INSET_PCT + 5}%` }}
        >
          {/* Mirrors the participant page header. */}
          <div className="flex flex-col gap-5">
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
      </Iphone>
    </div>
  );
}
