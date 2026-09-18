import './load-env';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';

/**
 * Apply SQL migrations in `drizzle/` in filename order.
 *
 * Each applied file is recorded in `_migrations`, so re-running is safe and
 * only new files execute. Statements within a file are separated by the
 * `--> statement-breakpoint` marker that drizzle-kit emits.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle');

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.',
    );
    process.exit(1);
  }

  const sql = neon(connectionString);

  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const applied = new Set(
    (await sql`SELECT name FROM _migrations`).map((row) => row.name as string),
  );

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found in drizzle/.');
    return;
  }

  let ran = 0;

  for (const file of files) {
    if (applied.has(file)) continue;

    const contents = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const statements = contents
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean);

    console.log(`Applying ${file} (${statements.length} statements)...`);

    for (const statement of statements) {
      await sql.query(statement);
    }

    await sql`INSERT INTO _migrations (name) VALUES (${file})`;
    ran += 1;
  }

  console.log(
    ran === 0 ? 'Database is already up to date.' : `Applied ${ran} migration(s).`,
  );
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
