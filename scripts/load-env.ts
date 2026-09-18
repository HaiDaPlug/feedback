import { config } from 'dotenv';

/**
 * Environment loading for CLI scripts.
 *
 * Next.js loads `.env.local` automatically, but a plain `tsx` script does not.
 * These scripts are run by hand against a real database, so they must read the
 * same file the README tells you to create.
 *
 * Precedence matches Next.js: `.env.local` wins over `.env`. Values already
 * present in the real environment (CI, a shell export) always win over both,
 * because dotenv does not overwrite existing variables.
 */
config({ path: '.env.local' });
config({ path: '.env' });
