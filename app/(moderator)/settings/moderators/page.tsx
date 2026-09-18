import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { PageHeader, SectionHeader } from '@/components/ui/Section';
import { requireAdmin } from '@/lib/auth/guards';
import { db } from '@/lib/db/client';
import { memberships, users } from '@/lib/db/schema';
import { AddModeratorForm } from './AddModeratorForm';

export const metadata: Metadata = { title: 'Moderators' };
export const dynamic = 'force-dynamic';

/**
 * Minimal moderator management for administrators.
 *
 * Intentionally small: add an account, see who has access. A full invitation
 * flow (emailed invites, revocation UI, password reset) is out of initial
 * scope -- see README for the CLI provisioning path.
 */
export default async function ModeratorsPage() {
  const admin = await requireAdmin();

  const members = await db
    .select({
      email: users.email,
      name: users.name,
      role: memberships.role,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, admin.orgId));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Moderators"
        description={
          <>People who can create events and read anonymous feedback for {admin.orgName}.</>
        }
      />

      <section className="mt-8">
        <SectionHeader title="Current moderators" />
        <ul className="card mt-4 divide-y divide-hairline">
          {members.map((member) => (
            <li
              key={member.email}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {member.name || member.email}
                </p>
                {member.name && (
                  <p className="truncate text-sm text-ink-muted">{member.email}</p>
                )}
              </div>
              <span className="shrink-0 rounded-full border border-hairline bg-well px-2.5 py-0.5 text-xs font-medium text-ink-muted">
                {member.role === 'admin' ? 'Administrator' : 'Moderator'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <SectionHeader
          title="Add a moderator"
          description="Create an account with a temporary password and share it with them privately. They can use it to sign in immediately."
        />
        <div className="mt-4">
          <AddModeratorForm />
        </div>
      </section>
    </div>
  );
}
