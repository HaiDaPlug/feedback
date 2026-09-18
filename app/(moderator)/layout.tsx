import Link from 'next/link';
import { Brandmark } from '@/components/ui/Brandmark';
import { SignOutButton } from '@/components/ui/SignOutButton';
import { requireModerator } from '@/lib/auth/guards';

/**
 * Moderator shell.
 *
 * `requireModerator()` runs here, so every route in this group is gated by both
 * authentication AND an organization membership check before any child renders.
 * Individual actions re-check on the server -- this layout is defence in depth,
 * not the only guard.
 */
export default async function ModeratorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const moderator = await requireModerator();

  return (
    <div className="min-h-dvh">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
          <Link href="/dashboard" className="shrink-0 rounded-md">
            <Brandmark />
          </Link>

          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            {moderator.role === 'admin' && (
              <Link
                href="/settings/moderators"
                className="hidden min-h-9 items-center rounded-md px-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-canvas hover:text-ink sm:inline-flex"
              >
                Moderators
              </Link>
            )}
            <span className="hidden max-w-64 truncate px-2 text-sm text-ink-faint md:inline-block">
              {moderator.email}
            </span>
            <SignOutButton variant="ghost" size="sm" />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</div>
    </div>
  );
}
