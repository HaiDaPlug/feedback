import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { requireModerator } from '@/lib/auth/guards';
import { getActiveToken, getEvent } from '@/lib/db/queries/events';
import { feedbackUrl } from '@/lib/tokens';
import { SharePanel } from './SharePanel';

export const dynamic = 'force-dynamic';

/**
 * Resolve the public base URL for building participant links.
 *
 * The link follows the host the moderator is using right now, so the same
 * code produces a working link on localhost, a tunnel, a preview deployment,
 * and the production domain without any per-environment configuration.
 * Proxies (Vercel, most hosts) pass the original host and scheme in the
 * x-forwarded-* headers, which take precedence over the internal Host.
 * APP_BASE_URL is only the fallback when no request headers are available;
 * its main job is telling Auth.js which host to trust (lib/auth/config.ts).
 */
async function resolveBaseUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host');

  if (!host) return process.env.APP_BASE_URL ?? 'http://localhost:3000';

  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = headerList.get('x-forwarded-proto') ?? (isLocal ? 'http' : 'https');

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
