'use client';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Autosave status shared by every autosaving surface (event details, question
 * builder). Always visible once the first edit lands, so a moderator never has
 * to wonder whether their work is safe.
 *
 *  - idle:   nothing rendered (the form matches what is stored)
 *  - saving: quiet pulse
 *  - saved:  quiet tick
 *  - error:  danger text with an inline retry; edits stay on screen
 */
export function SaveIndicator({
  state,
  onRetry,
  className = '',
}: {
  state: SaveState;
  onRetry: () => void;
  className?: string;
}) {
  if (state === 'idle') return null;

  if (state === 'error') {
    return (
      <span
        role="status"
        className={`inline-flex items-center gap-2 text-sm font-medium text-danger ${className}`}
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-danger" />
        Couldn&rsquo;t save
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md px-1.5 py-0.5 underline decoration-danger/40 underline-offset-2 hover:decoration-danger"
        >
          Retry
        </button>
      </span>
    );
  }

  const saving = state === 'saving';

  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 text-sm text-ink-muted ${className}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${saving ? 'animate-pulse bg-ink-faint' : 'bg-ok'}`}
      />
      {saving ? 'Saving' : 'Saved'}
    </span>
  );
}
