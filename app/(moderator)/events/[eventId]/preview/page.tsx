import { notFound } from 'next/navigation';
import { SectionHeader } from '@/components/ui/Section';
import { requireModerator } from '@/lib/auth/guards';
import { getEvent, getQuestions } from '@/lib/db/queries/events';
import { PreviewFrame } from './PreviewFrame';

export const dynamic = 'force-dynamic';

/**
 * Participant preview.
 *
 * Renders the real participant components against the current form version so
 * what a moderator sees is what attendees get. Nothing here writes a response.
 */
export default async function PreviewPage({
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
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Preview"
        description="This is what attendees see on their phone. Answers here are not saved."
      />

      <div className="flex justify-center">
        <PreviewFrame
          eventName={event.name}
          eventDate={event.eventDate}
          location={event.location}
          welcomeMessage={event.welcomeMessage}
          questions={questions}
        />
      </div>
    </div>
  );
}
