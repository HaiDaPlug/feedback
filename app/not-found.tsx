import Link from 'next/link';
import { Brandmark } from '@/components/ui/Brandmark';
import { buttonClass } from '@/components/ui/Button';

export default function NotFound() {
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
          <circle cx="9" cy="9" r="5.5" />
          <path d="m13.25 13.25 3.25 3.25" />
        </svg>
      </div>

      <h1 className="text-display mt-6 text-ink">Page not found</h1>
      <p className="mt-3 text-base leading-7 text-ink-muted">
        The page you are looking for does not exist or you do not have access to it.
      </p>

      <div className="mt-8">
        <Link href="/dashboard" className={buttonClass({ variant: 'secondary' })}>
          Go to events
        </Link>
      </div>
    </main>
  );
}
