'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Section';
import { setEventStatusAction } from '../../actions';

/**
 * Open / close collection.
 *
 * One explicit action, no confirmation dialog -- both directions are reversible
 * and closing preserves all existing feedback.
 */
export function CollectionToggle({
  eventId,
  status,
}: {
  eventId: string;
  status: 'draft' | 'open' | 'closed';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(next: 'draft' | 'open' | 'closed') {
    setError(null);
    startTransition(async () => {
      const result = await setEventStatusAction(eventId, next);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {status === 'open' ? (
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => change('closed')}
        >
          {pending ? 'Working...' : 'Close collection'}
        </Button>
      ) : (
        <Button type="button" disabled={pending} onClick={() => change('open')}>
          {pending ? 'Working...' : 'Open collection'}
        </Button>
      )}

      {error && (
        <Notice tone="danger" role="alert" className="max-w-xs">
          {error}
        </Notice>
      )}
    </div>
  );
}
