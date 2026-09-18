import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { auth } from './config';
import { db } from '@/lib/db/client';
import { events, memberships, organizations, users } from '@/lib/db/schema';

/**
 * Server-side authorization guards.
 *
 * The rule enforced here: a valid session is NOT authorization. Moderator
 * access requires a membership row linking the signed-in user to an
 * organization. Every dashboard page, server action, and API route that reads
 * feedback or manages events goes through one of these.
 */

export type ModeratorContext = {
  userId: string;
  email: string;
  name: string | null;
  orgId: string;
  orgName: string;
  role: 'admin' | 'moderator';
};

/**
 * Resolve the signed-in user's moderator context, or null if they are not
 * signed in or hold no membership.
 */
export async function getModerator(): Promise<ModeratorContext | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      orgId: organizations.id,
      orgName: organizations.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, userId))
    .limit(1);

  return row ?? null;
}

/**
 * Guard for pages: redirects to login when unauthenticated, or to a "no access"
 * notice when the account exists but holds no membership.
 */
export async function requireModerator(): Promise<ModeratorContext> {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const moderator = await getModerator();
  if (!moderator) redirect('/no-access');

  return moderator;
}

/** Guard for admin-only pages (adding moderators). */
export async function requireAdmin(): Promise<ModeratorContext> {
  const moderator = await requireModerator();
  if (moderator.role !== 'admin') redirect('/dashboard');
  return moderator;
}

/**
 * Guard for API routes and server actions: throws instead of redirecting so the
 * caller can return a 401/403 status.
 */
export class AuthorizationError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export async function requireModeratorApi(): Promise<ModeratorContext> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthorizationError('Sign in required.', 401);
  }

  const moderator = await getModerator();
  if (!moderator) {
    throw new AuthorizationError('Your account is not a HelpBnk moderator.', 403);
  }

  return moderator;
}

/**
 * Confirm an event belongs to the moderator's organization. Prevents a
 * moderator of one organization from reaching another organization's event by
 * guessing its id.
 */
export async function assertEventInOrg(eventId: string, orgId: string): Promise<void> {
  const [row] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.orgId, orgId)))
    .limit(1);

  if (!row) throw new AuthorizationError('Event not found.', 403);
}
