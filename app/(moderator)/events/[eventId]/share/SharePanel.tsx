'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import QRCode from 'qrcode';
import { Brandmark } from '@/components/ui/Brandmark';
import { Button } from '@/components/ui/Button';
import { CONTROL_CLASS, Label } from '@/components/ui/Field';
import { Notice, SectionHeader } from '@/components/ui/Section';
import { rotateTokenAction } from '../../../actions';

/**
 * Sharing controls: copy link, QR code, download, rotate, and honest guidance
 * about what a shared link does and does not prove.
 *
 * The QR is rendered locally in the browser via the `qrcode` package -- the
 * token is never sent to a third-party QR service, which would leak it.
 */

/** Rendered size of the QR canvas. Declared up front so the box never shifts. */
const QR_SIZE = 240;

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="m3.25 8.5 3 3 6.5-7" />
    </svg>
  );
}

export function SharePanel({
  eventId,
  eventName,
  status,
  initialUrl,
  baseUrl,
}: {
  eventId: string;
  eventName: string;
  status: 'draft' | 'open' | 'closed';
  initialUrl: string | null;
  baseUrl: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [copied, setCopied] = useState(false);
  const [confirmingRotate, setConfirmingRotate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!url || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: QR_SIZE,
      margin: 2,
      errorCorrectionLevel: 'M',
    }).catch(() => setError('Could not render the QR code.'));
  }, [url]);

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy automatically. Select the link and copy it manually.');
    }
  }

  function downloadQr() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `${eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-feedback-qr.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function rotate() {
    setError(null);
    startTransition(async () => {
      const result = await rotateTokenAction(eventId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setUrl(`${baseUrl.replace(/\/+$/, '')}/f/${result.token}`);
      setConfirmingRotate(false);
    });
  }

  return (
    <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="flex min-w-0 flex-col gap-6">
        <SectionHeader
          title="Share this event"
          description="Send this link or show the QR code at the event."
        />

        {status !== 'open' && (
          <Notice tone="warn">
            {status === 'draft'
              ? 'This event is still a draft. Open collection before sharing the link — attendees cannot submit yet.'
              : 'Collection is closed. The link will not accept new feedback until you reopen it.'}
          </Notice>
        )}

        {error && (
          <Notice tone="danger" role="alert">
            {error}
          </Notice>
        )}

        {url ? (
          <div>
            <Label htmlFor="feedback-link">Feedback link</Label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              {/* Stays 16px on phones so iOS does not zoom on focus; compact mono from sm up. */}
              <input
                id="feedback-link"
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className={`${CONTROL_CLASS} min-w-0 bg-well font-mono sm:text-sm`}
              />
              <Button type="button" onClick={copyLink} className="shrink-0 sm:min-w-28">
                {copied ? (
                  <>
                    <CheckIcon />
                    Copied
                  </>
                ) : (
                  'Copy link'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <Notice tone="neutral">
            No link is available for this event. Generate a new one below.
          </Notice>
        )}
      </section>

      {/* Anchored to the right column on wide screens; directly under the link on narrow ones. */}
      {url && (
        /* Navy poster card: the one thing on this page that gets shown to a room. */
        <aside className="flex flex-col items-center gap-5 rounded-2xl bg-navy p-5 text-white shadow-raised lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <div className="flex w-full items-center justify-between gap-3">
            <Brandmark tone="mono" height={20} />
            <span className="text-eyebrow text-cyan">Scan to answer</span>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <canvas
              ref={canvasRef}
              width={QR_SIZE}
              height={QR_SIZE}
              aria-label={`QR code for ${eventName} feedback form`}
            />
          </div>
          <p className="text-center text-sm leading-5 text-white/75">
            Display this at the event so attendees can scan and start answering.
          </p>
          <Button type="button" variant="inverse" fullWidth onClick={downloadQr}>
            Download QR code
          </Button>
        </aside>
      )}

      <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-2">
        {/* Honest description of what the link does and does not prove. */}
        <section className="rounded-lg bg-well p-4">
          <h3 className="text-sm font-medium text-ink">How this link works</h3>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-6 text-ink-muted">
            <li>
              Anyone holding the link can open the form and submit feedback. There is no
              sign-in.
            </li>
            <li>
              <strong className="font-medium text-ink">A link can be forwarded.</strong>{' '}
              Sharing it with attendees limits who is likely to have it, but it does not
              prove that a respondent attended. Please don&rsquo;t describe results as
              verified-attendee feedback.
            </li>
            <li>The form is excluded from search engines and is not listed publicly.</li>
            <li>
              If the link spreads further than you intended, rotate it below and share the
              new one.
            </li>
          </ul>
        </section>

        {/* Destructive action, kept away from the primary Copy button. */}
        <section className="mt-2 flex flex-col gap-4 border-t border-hairline pt-6">
          <SectionHeader
            as="h3"
            title="Rotate link"
            description="Creates a new link and immediately stops the old one from working — including any QR code already printed. Feedback already collected is kept."
          />

          {confirmingRotate ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="danger" onClick={rotate} disabled={pending}>
                {pending ? 'Rotating...' : 'Yes, rotate the link'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmingRotate(false)}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="self-start"
              onClick={() => setConfirmingRotate(true)}
            >
              {url ? 'Rotate link' : 'Generate link'}
            </Button>
          )}
        </section>
      </div>
    </div>
  );
}
