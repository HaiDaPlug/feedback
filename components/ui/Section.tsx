import type { ReactNode } from 'react';

/**
 * Page and section headings.
 *
 * Three levels only, so hierarchy reads instantly:
 *   PageHeader   -- one per screen (text-display)
 *   SectionHeader -- groups within a screen (text-title)
 *   Eyebrow      -- small caps label above a stat or group
 *
 * `actions` sits on the trailing edge on wide screens and wraps under on narrow
 * ones. `description` is optional and always quiet.
 */

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className = '',
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-4 ${className}`}>
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="text-display text-ink">{title}</h1>
        {description && (
          <p className="mt-2 max-w-prose text-base leading-6 text-ink-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
  as: Heading = 'h2',
  className = '',
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  as?: 'h2' | 'h3';
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-x-6 gap-y-2 ${className}`}>
      <div className="min-w-0 flex-1">
        <Heading className="text-title text-ink">{title}</Heading>
        {description && (
          <p className="mt-1 max-w-prose text-sm leading-5 text-ink-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`text-eyebrow block text-ink-faint ${className}`}>{children}</span>;
}

/**
 * Inline notice. `tone` picks the colour; the layout is identical so notices
 * never fight each other for attention.
 */
export function Notice({
  tone = 'neutral',
  children,
  role,
  className = '',
}: {
  tone?: 'neutral' | 'info' | 'ok' | 'warn' | 'danger';
  children: ReactNode;
  role?: 'alert' | 'status';
  className?: string;
}) {
  const TONES = {
    neutral: 'border-hairline bg-surface text-ink-muted',
    info: 'border-brand/20 bg-brand-soft text-ink',
    ok: 'border-ok/25 bg-ok/5 text-ok',
    warn: 'border-warn/25 bg-warn/5 text-warn',
    danger: 'border-danger/30 bg-danger/5 text-danger',
  } as const;

  return (
    <div
      role={role}
      className={`rounded-lg border px-3.5 py-3 text-sm leading-5 ${TONES[tone]} ${className}`}
    >
      {children}
    </div>
  );
}
