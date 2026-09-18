import type { Metadata } from 'next';
import { Brandmark } from '@/components/ui/Brandmark';
import { FormLookupError, getFormByToken } from '@/lib/db/queries/participant';
import { FeedbackForm } from './FeedbackForm';
import { InvalidLink } from './InvalidLink';

// Never cached or statically rendered: the token must be resolved server-side
// on every request so a rotated link stops working immediately.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Share your feedback',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

function formatEventDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function ParticipantFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let form;
  try {
    form = await getFormByToken(token);
  } catch (error) {
    // Temporary outage: tell the participant to retry rather than showing a
    // raw error, and do NOT claim their link is invalid -- it may be fine.
    if (error instanceof FormLookupError) {
      return (
        <InvalidLink
          title="We couldn't load this form"
          message="Something went wrong on our side. Your link is probably fine — please wait a moment and reload the page."
        />
      );
    }
    throw error;
  }

  // Unknown, malformed, and revoked tokens all render identically so a probe
  // cannot tell them apart.
  if (!form) {
    return (
      <InvalidLink
        title="This feedback link is not valid"
        message="The link may have been replaced with a newer one. Please check with the event organizer for the current link."
      />
    );
  }

  if (form.status === 'draft') {
    return (
      <InvalidLink
        title="This form is not open yet"
        message="The organizer has not opened feedback for this event. Please try again later."
      />
    );
  }

  if (form.status === 'closed') {
    return (
      <InvalidLink
        title="Feedback is closed"
        message="This event is no longer collecting feedback. Thank you for your interest."
      />
    );
  }

  return (
    <main className="bg-brand-motif mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-8 flex flex-col gap-6">
        {/* Small brand row, separated from the event by a hairline, so the
            lockup and the event name never read as one stacked heading. */}
        <div className="border-b border-hairline pb-4">
          <Brandmark height={22} showProductName />
        </div>

        <div>
          <p className="text-eyebrow text-brand">
            {formatEventDate(form.eventDate)}
            {form.location ? ` · ${form.location}` : ''}
          </p>
          <h1 className="text-display mt-2 text-ink">{form.eventName}</h1>
        </div>

        {form.welcomeMessage && (
          <p className="max-w-prose text-base leading-7 text-ink">{form.welcomeMessage}</p>
        )}

        {/*
          No anonymity banner by design: the form never asks for identifying
          fields, and the line under the submit button states that nothing
          else is collected. Moderators are reminded not to ask for names on
          the Questions tab instead.
        */}
      </header>

      <FeedbackForm
        token={token}
        formVersionId={form.formVersionId}
        questions={form.questions}
      />
    </main>
  );
}
