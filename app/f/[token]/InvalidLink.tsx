import { Brandmark } from '@/components/ui/Brandmark';

/**
 * Shown for links that cannot open a form: unknown, malformed, revoked, or an
 * event that is not currently collecting. Carries no detail that would help
 * someone probe for valid tokens.
 */
export function InvalidLink({ title, message }: { title: string; message: string }) {
  return (
    <main className="bg-brand-motif mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10 sm:px-6">
      <Brandmark />

      <div className="mt-10">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5" />
            <path d="M12 8h.01" />
          </svg>
        </div>

        <h1 className="text-display mt-6 text-ink">{title}</h1>
        <p className="mt-3 text-base leading-7 text-ink-muted">{message}</p>
      </div>
    </main>
  );
}
