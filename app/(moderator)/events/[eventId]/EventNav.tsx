'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Workspace navigation. Questions, preview, sharing, and results sit side by
 * side so a moderator can move between them without leaving the event.
 */
const TABS = [
  { segment: '', label: 'Questions' },
  { segment: '/preview', label: 'Preview' },
  { segment: '/share', label: 'Share' },
  { segment: '/results', label: 'Feedback' },
] as const;

export function EventNav({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const base = `/events/${eventId}`;

  return (
    // Bleeds to the viewport edge on phones so the row scrolls rather than
    // clips. The 4px vertical padding keeps focus rings inside the scroll box.
    <nav
      aria-label="Event sections"
      className="-mx-4 mt-5 overflow-x-auto px-4 py-1 sm:-mx-6 sm:px-6"
    >
      <ul className="flex min-w-max gap-1 border-b border-hairline">
        {TABS.map((tab) => {
          const href = `${base}${tab.segment}`;
          const active = tab.segment === '' ? pathname === base : pathname === href;

          return (
            <li key={tab.label} className="-mb-px">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors',
                  active
                    ? 'border-brand text-ink'
                    : 'border-transparent text-ink-muted hover:border-hairline-strong hover:text-ink',
                ].join(' ')}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
