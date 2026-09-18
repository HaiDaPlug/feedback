import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import {
  checkRateLimit,
  clientIpForRateLimit,
  LOGIN_EMAIL_LIMIT,
  LOGIN_IP_LIMIT,
} from '@/lib/rate-limit';
import { credentialsSchema } from '@/lib/validation/schemas';

/** Surfaced to the sign-in form as `result.code`, so it can say why. */
export class RateLimitedSignin extends CredentialsSignin {
  code = 'rate_limited';
}

/**
 * Moderator authentication.
 *
 * IMPORTANT: authenticating here proves only "this person holds valid
 * credentials". It grants NO access on its own. Every moderator route and
 * action additionally calls `requireModerator()` (see ./guards.ts), which
 * checks for an organization membership row server-side.
 */

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Seven days, not the 30-day default: this is an admin tool that reads
  // feedback, and a forgotten laptop should not stay signed in for a month.
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
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
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // Brute-force control: a budget per source address and a budget per
        // account, so neither one attacker nor one targeted account can be
        // hammered. Counted before the password check so failures and
        // successes cost the same. Keys are salted hashes held in memory only.
        const ip = clientIpForRateLimit(request.headers);
        const byIp = checkRateLimit(ip, LOGIN_IP_LIMIT);
        const byEmail = checkRateLimit(email, LOGIN_EMAIL_LIMIT);
        if (!byIp.allowed || !byEmail.allowed) throw new RateLimitedSignin();

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
