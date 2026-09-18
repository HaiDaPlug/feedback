import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/Section';
import { StatusPill } from '@/components/ui/StatusPill';
import { requireModerator } from '@/lib/auth/guards';
import { listEvents } from '@/lib/db/queries/events';

export const metadata: Metadata = { title: 'Events' };
export const dynamic = 'force-dynamic';

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const ROW_LINK_CLASS =
  'inline-flex min-h-9 items-center rounded-md px-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink';

export default async function DashboardPage() {
  const moderator = await requireModerator();
  const events = await listEvents(moderator.orgId);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Events"
        description="Create an event, share its link, and read anonymous feedback."
        actions={
          <Link href="/events/new" className={buttonClass()}>
            Create event
          </Link>
        }
      />

      {events.length === 0 ? (
        // Honest empty state -- no fictional sample data.
        <div className="mt-8 rounded-2xl border border-dashed border-hairline-strong bg-surface px-6 py-14 text-center sm:py-16">
          <h2 className="text-title text-ink">No events yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-5 text-ink-muted">
            Create your first event to get a feedback form and a shareable link. It takes
            about a minute -- you only need a name and a date.
          </p>
          <Link href="/events/new" className={buttonClass({ className: 'mt-6' })}>
            Create event
          </Link>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {events.map((event) => (
            <li
              key={event.id}
              className="card p-4 transition-colors hover:border-hairline-strong sm:p-5"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
                <div className="min-w-0">
                  <Link
                    href={`/events/${event.id}`}
                    className="text-base font-semibold text-ink transition-colors hover:text-brand"
                  >
                    {event.name}
                  </Link>
                  <p className="mt-1 text-sm text-ink-muted">
                    {formatDate(event.eventDate)}
                    {event.location ? ` · ${event.location}` : ''}
                  </p>
                </div>
                <div className="pt-0.5">
                  <StatusPill status={event.status} />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-hairline pt-3">
                {/* Labelled "Responses" -- anonymous submissions do not prove
                    unique attendance. */}
                <p className="text-sm">
                  <span className="font-medium tabular-nums text-ink">{event.responseCount}</span>{' '}
                  <span className="text-ink-muted">
                    {event.responseCount === 1 ? 'response' : 'responses'}
                  </span>
                </p>

                <div className="-mr-2 flex items-center gap-1">
                  <Link href={`/events/${event.id}`} className={ROW_LINK_CLASS}>
                    Edit
                  </Link>
                  <Link href={`/events/${event.id}/share`} className={ROW_LINK_CLASS}>
                    Share
                  </Link>
                  <Link href={`/events/${event.id}/results`} className={ROW_LINK_CLASS}>
                    Feedback
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
