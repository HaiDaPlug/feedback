import type { Metadata } from 'next';
import Link from 'next/link';
import { createEventAction } from '../../actions';
import { requireModerator } from '@/lib/auth/guards';
import { Button, buttonClass } from '@/components/ui/Button';
import { TextArea, TextInput } from '@/components/ui/Field';
import { Notice, PageHeader } from '@/components/ui/Section';

export const metadata: Metadata = { title: 'Create event' };

/**
 * Event creation.
 *
 * Deliberately one short screen: name and date are required, location and
 * welcome message are optional, and there is no wizard or confirmation step.
 * Submitting creates the event with the default question template already in
 * place and drops the moderator straight into the workspace.
 */
export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireModerator();
  const { error } = await searchParams;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-xl">
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
        title="Create event"
        description="We will add a short feedback form for you. You can edit the questions next."
      />

      {error && (
        <Notice tone="danger" role="alert" className="mt-6">
          {error}
        </Notice>
      )}

      <form action={createEventAction} className="card mt-8 p-5 sm:p-6">
        <div className="flex flex-col gap-4">
          <TextInput id="name" name="name" label="Event name" required maxLength={200} autoFocus />

          <TextInput
            id="eventDate"
            name="eventDate"
            label="Event date"
            type="date"
            required
            defaultValue={today}
          />

          <TextInput id="location" name="location" label="Location" optional maxLength={200} />

          <TextArea
            id="welcomeMessage"
            name="welcomeMessage"
            label="Welcome message"
            optional
            helpText="Shown at the top of the feedback form."
            rows={3}
            maxLength={1000}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg">
            Create event
          </Button>
          <Link href="/dashboard" className={buttonClass({ variant: 'ghost', size: 'lg' })}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
