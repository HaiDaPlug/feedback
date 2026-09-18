'use client';

import { useState } from 'react';
import { QuestionBuilder } from '@/components/questions/QuestionBuilder';
import { EventDetailsForm, type EventDetails } from './EventDetailsForm';
import { PreviewFrame } from './preview/PreviewFrame';
import { saveQuestionsAction } from '../../actions';
import type { FormQuestion } from '@/lib/form/types';

/**
 * Client boundary for the event workspace. Server actions are passed down as
 * plain functions so the builder stays a pure client component.
 *
 * On wide screens the builder sits beside a live phone preview fed from the
 * builder's in-memory state, so a moderator sees each edit as attendees will.
 * Autosave still lives inside each form; the workspace only mirrors state.
 */
export function EventWorkspace({
  eventId,
  details,
  questions,
}: {
  eventId: string;
  details: EventDetails;
  questions: FormQuestion[];
}) {
  const [liveDetails, setLiveDetails] = useState(details);
  const [liveQuestions, setLiveQuestions] = useState(questions);

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-8">
      <div className="flex min-w-0 flex-col gap-10">
        <EventDetailsForm eventId={eventId} initial={details} onChange={setLiveDetails} />
        <QuestionBuilder
          eventId={eventId}
          initialQuestions={questions}
          onSave={saveQuestionsAction}
          onQuestionsChange={setLiveQuestions}
        />
      </div>

      {/* Below xl the Preview tab covers this; here it tracks edits live. */}
      <aside className="hidden xl:sticky xl:top-6 xl:block xl:self-start" aria-label="Live preview">
        <PreviewFrame
          eventName={liveDetails.name}
          eventDate={liveDetails.eventDate}
          location={liveDetails.location}
          welcomeMessage={liveDetails.welcomeMessage}
          questions={liveQuestions}
          // The phone's height follows its width, so cap the width by the
          // viewport height (minus the sticky offset and the caption row).
          className="xl:w-[min(24rem,calc((100dvh_-_6rem)*433/882))]"
        />
      </aside>
    </div>
  );
}
