import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { credentialsSchema } from '@/lib/validation/schemas';

/**
 * Moderator authentication.
 *
 * IMPORTANT: authenticating here proves only "this person holds valid
 * credentials". It grants NO access on its own. Every moderator route and
 * action additionally calls `requireModerator()` (see ./guards.ts), which
 * checks for an organization membership row server-side.
 */

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  /**
   * Auth.js rejects requests whose Host header it cannot verify, which protects
   * against host-header injection. Vercel is recognised automatically; any other
   * origin (a self-hosted deployment, or a local production build on a
   * non-default port) must be declared via AUTH_URL / APP_BASE_URL.
   *
   * We trust the host only when that origin is configured, so a deployment with
   * no configured URL keeps the strict default rather than silently accepting
   * any Host header.
   */
  trustHost: Boolean(
    process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? process.env.APP_BASE_URL,
  ),
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        // Compare against a dummy hash when the user is absent so that the
        // response time does not reveal whether an email is registered.
        const hash = user?.passwordHash ?? DUMMY_HASH;
        const valid = await bcrypt.compare(password, hash);

        if (!user || !valid) return null;

        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

/**
 * A valid bcrypt hash of a value no user can supply. Used only to keep the
 * failed-login path doing the same work as the success path.
 */
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.mLwGZ8fbYqjJmtHhVzRDLxWXbLLK';
