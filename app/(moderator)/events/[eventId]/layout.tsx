import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/Section';
import { StatusPill } from '@/components/ui/StatusPill';
import { requireModerator } from '@/lib/auth/guards';
import { getEvent } from '@/lib/db/queries/events';
import { EventNav } from './EventNav';
import { CollectionToggle } from './CollectionToggle';

export const dynamic = 'force-dynamic';

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const moderator = await requireModerator();

  // Scoped to the moderator's organization: an event id from another org
  // resolves to a 404 rather than leaking its existence.
  const event = await getEvent(eventId, moderator.orgId);
  if (!event) notFound();

  return (
    <div>
      <Link
        href="/dashboard"
        className="-ml-1.5 inline-flex min-h-9 items-center gap-1 rounded-md pr-2 pl-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 3.5 5.5 8l4.5 4.5" />
        </svg>
        Events
      </Link>

      <PageHeader
        className="mt-4"
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="min-w-0">{event.name}</span>
            <span className="shrink-0 tracking-normal">
              <StatusPill status={event.status} />
            </span>
          </span>
        }
        actions={<CollectionToggle eventId={eventId} status={event.status} />}
      />

      <EventNav eventId={eventId} />

      {/* The workspace takes the full container width so it can split into a
          two-column layout with a sticky preview on wide screens. */}
      <div className="mt-7">{children}</div>
    </div>
  );
}
