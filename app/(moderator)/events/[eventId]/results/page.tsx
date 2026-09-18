import { notFound } from 'next/navigation';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/Button';
import { Eyebrow, SectionHeader } from '@/components/ui/Section';
import { requireModerator } from '@/lib/auth/guards';
import { getEvent } from '@/lib/db/queries/events';
import { getEventResults, getIndividualResponses } from '@/lib/results/aggregate';
import type { QuestionResult } from '@/lib/results/aggregate';
import { RATING_MAX } from '@/lib/form/types';

export const dynamic = 'force-dynamic';

/** Small-caps label above each summary card, derived from the summary shape. */
function answerKind(question: QuestionResult): string {
  if (question.rating) return 'Rating';
  if (question.choice) return question.choice.allowsMultiple ? 'Multiple selection' : 'Single choice';
  return 'Written answers';
}

/**
 * Horizontal share bar. Purely visual: the numerals beside it carry the data,
 * so it is hidden from assistive tech.
 */
function Bar({ share, className = '' }: { share: number; className?: string }) {
  const clamped = Math.min(100, Math.max(0, share));
  return (
    <span aria-hidden="true" className={`block overflow-hidden rounded-full bg-well ${className}`}>
      <span
        className="block h-full rounded-full bg-brand transition-[width] duration-200"
        style={{ width: `${clamped}%` }}
      />
    </span>
  );
}

function DownloadIcon() {
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
      <path d="M8 2.5v8M4.75 7.25 8 10.5l3.25-3.25M2.5 13h11" />
    </svg>
  );
}

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const moderator = await requireModerator();

  const event = await getEvent(eventId, moderator.orgId);
  if (!event) notFound();

  const results = await getEventResults(eventId);
  const individual = await getIndividualResponses(eventId);

  if (results.responseCount === 0) {
    return (
      <div className="max-w-3xl rounded-xl border border-dashed border-hairline bg-surface px-6 py-14 text-center">
        <h2 className="text-title text-ink">No feedback yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-5 text-ink-muted">
          {event.status === 'open'
            ? 'Responses will appear here as attendees submit the form.'
            : 'Open collection and share the link to start collecting feedback.'}
        </p>
        <Link href={`/events/${eventId}/share`} className={buttonClass({ className: 'mt-6' })}>
          Share this event
        </Link>
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      {/* Headline stats on navy: the one dark surface on the page, so the
          numbers read first. A single column keeps the bars below readable. */}
      <section className="flex flex-wrap items-center justify-between gap-x-10 gap-y-5 rounded-2xl bg-navy p-5 text-white sm:p-6">
        <dl className="flex flex-wrap gap-x-12 gap-y-4">
          <div>
            {/* "Responses" -- never "unique attendees". Anonymous submissions
                cannot prove one response per person. */}
            <dt className="text-eyebrow text-cyan">Responses</dt>
            <dd className="mt-1 text-4xl font-bold tracking-[-0.03em] tabular-nums">
              {results.responseCount}
            </dd>
          </div>
          <div>
            <dt className="text-eyebrow text-cyan">Questions</dt>
            <dd className="mt-1 text-4xl font-bold tracking-[-0.03em] tabular-nums">
              {results.questions.length}
            </dd>
          </div>
        </dl>

        <a
          href={`/events/${eventId}/results/export`}
          className={buttonClass({ variant: 'inverse', className: 'w-full sm:w-auto' })}
        >
          <DownloadIcon />
          Export CSV
        </a>
      </section>

      <section className="flex flex-col gap-6">
        <SectionHeader title="Summary" />

        <div className="flex flex-col gap-4">
          {results.questions.map((question) => (
            <article key={`${question.questionId}-${question.label}`} className="card p-5">
              <Eyebrow>{answerKind(question)}</Eyebrow>
              <h3 className="text-title mt-1 text-ink">{question.label}</h3>

              {question.rating && (
                <div className="mt-4 flex flex-col gap-4">
                  <p className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="sr-only">Average </span>
                    <span className="text-2xl font-semibold tabular-nums text-ink">
                      {question.rating.average.toFixed(1)}
                    </span>
                    <span className="text-ink-muted">/ {RATING_MAX}</span>
                    <span className="ml-1 text-sm text-ink-muted">
                      ({question.rating.answered}{' '}
                      {question.rating.answered === 1 ? 'answer' : 'answers'})
                    </span>
                  </p>

                  <ul className="flex flex-col gap-2">
                    {question.rating.distribution.map((bucket) => {
                      const share =
                        question.rating!.answered > 0
                          ? (bucket.count / question.rating!.answered) * 100
                          : 0;
                      return (
                        <li
                          key={bucket.score}
                          className="grid grid-cols-[1.25rem_minmax(0,1fr)_2.5rem] items-center gap-3"
                        >
                          <span className="text-sm tabular-nums text-ink-muted">{bucket.score}</span>
                          <Bar share={share} className="h-2.5" />
                          <span className="text-right text-sm tabular-nums text-ink-muted">
                            {bucket.count}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {question.choice && (
                <div className="mt-4 flex flex-col gap-3">
                  <ul className="flex flex-col gap-3">
                    {question.choice.options.map((option) => (
                      <li
                        key={option.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1"
                      >
                        <span className="text-sm leading-5 text-ink">{option.label}</span>
                        <span className="text-sm leading-5 tabular-nums text-ink-muted">
                          {option.count} ({option.percentage.toFixed(0)}%)
                        </span>
                        <Bar share={option.percentage} className="col-span-2 h-2" />
                      </li>
                    ))}
                  </ul>

                  {question.choice.allowsMultiple && (
                    <p className="text-xs leading-4 text-ink-faint">
                      Participants could select more than one option, so the totals can
                      exceed the number of responses.
                    </p>
                  )}
                </div>
              )}

              {question.text && (
                <div className="mt-4">
                  {question.text.entries.length === 0 ? (
                    <p className="text-sm text-ink-faint">No written answers.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {question.text.entries.map((entry, index) => (
                        <li
                          key={index}
                          className="rounded-lg bg-well px-3.5 py-3 text-sm leading-6 whitespace-pre-wrap text-ink"
                        >
                          {entry}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <SectionHeader
          title="Individual responses"
          description="Labels are numbered within this event only and do not identify anyone or connect responses across events."
        />

        <ul className="flex flex-col gap-4">
          {individual.map((response) => (
            <li key={response.label} className="card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{response.label}</span>
                {/* Coarse date only -- no precise submission time. */}
                <span className="text-xs tabular-nums text-ink-faint">{response.submittedOn}</span>
              </div>

              <dl className="mt-4 grid gap-y-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-baseline sm:gap-x-6">
                {response.answers.map((answer, index) => (
                  <div key={index} className="sm:contents">
                    <dt className="text-xs font-medium leading-5 text-ink-muted">{answer.label}</dt>
                    <dd className="text-sm leading-6 whitespace-pre-wrap text-ink">
                      {answer.display || <span className="text-ink-faint">—</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
