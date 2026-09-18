'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TextArea, TextInput } from '@/components/ui/Field';
import { SaveIndicator, type SaveState } from '@/components/ui/SaveIndicator';
import { SectionHeader } from '@/components/ui/Section';
import { updateEventAction } from '../../actions';

const AUTOSAVE_DELAY_MS = 900;

export type EventDetails = {
  name: string;
  eventDate: string;
  location: string | null;
  welcomeMessage: string | null;
};

/** Event details with the same autosave contract as the question builder. */
export function EventDetailsForm({
  eventId,
  initial,
  onChange,
}: {
  eventId: string;
  initial: EventDetails;
  /** Mirrors every edit upward so the workspace can feed the live preview. */
  onChange?: (details: EventDetails) => void;
}) {
  const [details, setDetails] = useState<EventDetails>(initial);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const savedSnapshot = useRef(JSON.stringify(initial));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    async (next: EventDetails) => {
      const snapshot = JSON.stringify(next);
      setSaveState('saving');

      const result = await updateEventAction(eventId, {
        name: next.name,
        eventDate: next.eventDate,
        location: next.location ?? '',
        welcomeMessage: next.welcomeMessage ?? '',
      });

      if (result.ok) {
        savedSnapshot.current = snapshot;
        setSaveState('saved');
      } else {
        setSaveState('error');
      }
    },
    [eventId],
  );

  useEffect(() => {
    const snapshot = JSON.stringify(details);
    if (snapshot === savedSnapshot.current) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(details), AUTOSAVE_DELAY_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [details, save]);

  // Live mirror for the workspace preview. Autosave above is untouched.
  useEffect(() => {
    onChange?.(details);
  }, [details, onChange]);

  return (
    <section className="flex flex-col gap-4">
      <SectionHeader
        title="Event details"
        actions={<SaveIndicator state={saveState} onRetry={() => void save(details)} />}
      />

      <div className="card grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <div className="sm:col-span-2">
          <TextInput
            id="event-name"
            label="Event name"
            value={details.name}
            onChange={(e) => setDetails({ ...details, name: e.target.value })}
            maxLength={200}
          />
        </div>

        <TextInput
          id="event-date"
          label="Event date"
          type="date"
          value={details.eventDate}
          onChange={(e) => setDetails({ ...details, eventDate: e.target.value })}
        />

        <TextInput
          id="event-location"
          label="Location"
          optional
          value={details.location ?? ''}
          onChange={(e) => setDetails({ ...details, location: e.target.value })}
          maxLength={200}
        />

        <div className="sm:col-span-2">
          <TextArea
            id="event-welcome"
            label="Welcome message"
            optional
            value={details.welcomeMessage ?? ''}
            onChange={(e) => setDetails({ ...details, welcomeMessage: e.target.value })}
            rows={2}
            maxLength={1000}
          />
        </div>
      </div>
    </section>
  );
}
