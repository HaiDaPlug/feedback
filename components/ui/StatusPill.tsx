/**
 * Event status. The brand yellow has exactly one job in the app: marking the
 * live "Collecting" state, so it reads as the active moment at a glance.
 */
const STYLES = {
  draft: { pill: 'bg-well text-ink-muted border-hairline', dot: 'bg-ink-faint' },
  open: { pill: 'bg-yellow-soft text-navy border-yellow/70', dot: 'bg-yellow' },
  closed: { pill: 'bg-navy/8 text-navy border-navy/15', dot: 'bg-navy' },
} as const;

const LABELS = {
  draft: 'Draft',
  open: 'Collecting',
  closed: 'Closed',
} as const;

export type EventStatus = keyof typeof STYLES;

export function StatusPill({ status }: { status: EventStatus }) {
  const style = STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5 ${style.pill}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {LABELS[status]}
    </span>
  );
}

export { LABELS as EVENT_STATUS_LABELS };
