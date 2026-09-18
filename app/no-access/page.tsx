import type { Metadata } from 'next';
import { Brandmark } from '@/components/ui/Brandmark';
import { SignOutButton } from '@/components/ui/SignOutButton';

export const metadata: Metadata = {
  title: 'No moderator access',
  robots: { index: false, follow: false },
};

/**
 * Shown when someone signs in successfully but holds no organization
 * membership. This is the visible half of "signing in alone must not grant
 * moderator access".
 */
export default function NoAccessPage() {
  return (
    <main className="bg-brand-motif mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <Brandmark />

      <div
        aria-hidden="true"
        className="mt-10 flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand"
      >
        <svg
          viewBox="0 0 20 20"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="9" width="12" height="8" rx="1.5" />
          <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
        </svg>
      </div>

      <h1 className="text-display mt-6 text-ink">Your account is not a moderator</h1>
      <p className="mt-3 text-base leading-7 text-ink-muted">
        You are signed in, but this account has not been granted access to the HelpBnk
        moderator workspace. Ask an existing administrator to add you.
      </p>

      <div className="mt-8">
        <SignOutButton variant="secondary" />
      </div>
    </main>
  );
}
