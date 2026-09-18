import type { Metadata } from 'next';
import { Brandmark } from '@/components/ui/Brandmark';

export const metadata: Metadata = {
  title: 'Thank you',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

/**
 * Confirmation screen.
 *
 * Deliberately a dead end: it thanks the participant and asks for nothing --
 * no contact details, no account, no share prompt, no next task.
 */
export default function ThanksPage() {
  return (
    <main className="bg-brand-motif mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10 sm:px-6">
      <Brandmark />

      <div className="mt-10">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-brand-fg"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </div>

        <h1 className="text-display mt-6 text-ink">Thank you for your feedback</h1>
        <p className="mt-3 text-base leading-7 text-ink-muted">
          Your response has been recorded anonymously. You can close this page.
        </p>
      </div>
    </main>
  );
}
