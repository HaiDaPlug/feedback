import './load-env';
import { parseArgs } from 'node:util';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db/client';
import { memberships, organizations, users } from '../lib/db/schema';

/**
 * Provision the HelpBnk organization and its first administrator.
 *
 * Usage:
 *   npm run provision:admin -- --email you@helpbnk.com --password 'a-long-password'
 *
 * Optional:
 *   --name "Your Name"      display name
 *   --org  "HelpBnk"        organization name (default: HelpBnk)
 *   --role moderator        grant plain moderator instead of admin
 *
 * Safe to re-run: an existing user is granted membership rather than
 * duplicated, and an existing password is only changed if --password is given.
 */

const DEFAULT_ORG_NAME = 'HelpBnk';
const DEFAULT_ORG_SLUG = 'helpbnk';
const MIN_PASSWORD_LENGTH = 12;

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      password: { type: 'string' },
      name: { type: 'string' },
      org: { type: 'string' },
      role: { type: 'string' },
    },
  });

  const email = values.email?.trim().toLowerCase();
  const password = values.password;
  const role = (values.role ?? 'admin') as 'admin' | 'moderator';

  if (!email || !password) {
    console.error(
      'Usage: npm run provision:admin -- --email you@helpbnk.com --password \'a-long-password\'',
    );
    process.exit(1);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  if (role !== 'admin' && role !== 'moderator') {
    console.error("--role must be 'admin' or 'moderator'.");
    process.exit(1);
  }

  // --- Organization --------------------------------------------------------
  const orgName = values.org ?? DEFAULT_ORG_NAME;

  let [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, DEFAULT_ORG_SLUG))
    .limit(1);

  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({ name: orgName, slug: DEFAULT_ORG_SLUG })
      .returning();
    console.log(`Created organization "${org.name}".`);
  } else {
    console.log(`Using existing organization "${org.name}".`);
  }

  // --- User ----------------------------------------------------------------
  const passwordHash = await bcrypt.hash(password, 12);

  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (user) {
    await db
      .update(users)
      .set({ passwordHash, ...(values.name ? { name: values.name } : {}) })
      .where(eq(users.id, user.id));
    console.log(`Updated password for existing user ${email}.`);
  } else {
    [user] = await db
      .insert(users)
      .values({ email, passwordHash, name: values.name ?? null })
      .returning();
    console.log(`Created user ${email}.`);
  }

  // --- Membership ----------------------------------------------------------
  await db
    .insert(memberships)
    .values({ orgId: org.id, userId: user.id, role })
    .onConflictDoUpdate({
      target: [memberships.orgId, memberships.userId],
      set: { role },
    });

  console.log(`Granted ${role} access to ${email} in "${org.name}".`);
  console.log('\nDone. Sign in at /login.');
}

main().catch((error) => {
  console.error('Provisioning failed:', error);
  process.exit(1);
});
