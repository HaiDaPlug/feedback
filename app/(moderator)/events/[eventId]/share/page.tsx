import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { requireModerator } from '@/lib/auth/guards';
import { getActiveToken, getEvent } from '@/lib/db/queries/events';
import { feedbackUrl } from '@/lib/tokens';
import { SharePanel } from './SharePanel';

export const dynamic = 'force-dynamic';

/**
 * Resolve the public base URL for building participant links.
 * APP_BASE_URL wins; otherwise fall back to the request host so local
 * development and preview deployments produce working links.
 */
async function resolveBaseUrl(): Promise<string> {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;

  const headerList = await headers();
  const host = headerList.get('host') ?? 'localhost:3000';
  const proto = headerList.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');

  return `${proto}://${host}`;
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const moderator = await requireModerator();

  const event = await getEvent(eventId, moderator.orgId);
  if (!event) notFound();

  const active = await getActiveToken(eventId);
  const baseUrl = await resolveBaseUrl();

  return (
    <SharePanel
      eventId={eventId}
      eventName={event.name}
      status={event.status}
      initialUrl={active ? feedbackUrl(active.token, baseUrl) : null}
      baseUrl={baseUrl}
    />
  );
}
