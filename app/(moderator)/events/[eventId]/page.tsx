import { notFound } from 'next/navigation';
import { requireModerator } from '@/lib/auth/guards';
import { getEvent, getQuestions } from '@/lib/db/queries/events';
import { EventWorkspace } from './EventWorkspace';

export const dynamic = 'force-dynamic';

export default async function EventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const moderator = await requireModerator();

  const event = await getEvent(eventId, moderator.orgId);
  if (!event?.currentFormVersionId) notFound();

  const questions = await getQuestions(event.currentFormVersionId);

  return (
    <EventWorkspace
      eventId={eventId}
      details={{
        name: event.name,
        eventDate: event.eventDate,
        location: event.location,
        welcomeMessage: event.welcomeMessage,
      }}
      questions={questions}
    />
  );
}
