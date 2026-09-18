'use client';

import { Button } from './Button';
import type { SaveState } from './SaveIndicator';

/**
 * Save status and an explicit Save button, as one unit.
 *
 * The pill answers "is my work on the server?" at a glance, in the brand's
 * own colours: green when everything is stored, yellow while there are edits
 * not yet saved, red if a save failed. The button is only live when there is
 * something to save, so a greyed-out button is itself reassurance.
 */
export type SaveControlsState = {
  state: SaveState;
  /** True when the on-screen form differs from what is stored. */
  dirty: boolean;
  save: () => void;
};

const PILLS = {
  saved: { className: 'bg-ok/10 text-ok', dot: 'bg-ok', label: 'Saved' },
  saving: { className: 'bg-well text-ink-muted', dot: 'animate-pulse bg-ink-faint', label: 'Saving' },
  dirty: { className: 'bg-yellow-soft text-navy', dot: 'bg-yellow', label: 'Unsaved changes' },
  error: { className: 'bg-danger/10 text-danger', dot: 'bg-danger', label: 'Not saved' },
} as const;

export function SaveControls({
  state,
  dirty,
  save,
  className = '',
}: SaveControlsState & { className?: string }) {
  const pill =
    state === 'saving'
      ? PILLS.saving
      : state === 'error'
        ? PILLS.error
        : dirty
          ? PILLS.dirty
          : PILLS.saved;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span
        role="status"
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-4 ${pill.className}`}
      >
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${pill.dot}`} />
        {pill.label}
      </span>
      <Button
        type="button"
        size="sm"
        variant={state === 'error' ? 'primary' : 'secondary'}
        onClick={save}
        disabled={!dirty || state === 'saving'}
      >
        Save
      </Button>
    </div>
  );
}
