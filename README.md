# HelpBnk Event Feedback

Anonymous event feedback collection. Moderators create an event, share a link or
QR code, and read aggregated results. Attendees answer on their phone without
signing in or giving any identifying information.

- **Moderator dashboard** — authenticated, membership-checked, mobile-friendly.
- **Participant form** — anonymous, no account, single scrollable page.

> **Read [`docs/ANONYMITY.md`](docs/ANONYMITY.md) before describing this system
> to participants.** It states precisely what is and is not guaranteed.

---

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Neon (serverless Postgres) |
| Data layer | Drizzle ORM + plain SQL migrations |
| Auth | Auth.js v5, credentials (email + bcrypt) |
| Tests | Vitest, with PGlite for real-Postgres integration tests |

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Create a Neon database

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the **pooled** connection string (host contains `-pooler`).

### 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```bash
# Paste your Neon connection string
DATABASE_URL="postgresql://...-pooler...neon.tech/neondb?sslmode=require"

# Generate each of these:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
AUTH_SECRET="..."
TOKEN_ENCRYPTION_KEY="..."

APP_BASE_URL="http://localhost:3000"
```

### 4. Run migrations

```bash
npm run db:migrate
```

Applies everything in `drizzle/`, tracking applied files in a `_migrations`
table. Safe to re-run.

### 5. Provision the first administrator

```bash
npm run provision:admin -- --email you@helpbnk.com --password 'a-long-password'
```

This creates the HelpBnk organization, the user, and an **admin** membership.
Safe to re-run — it updates the password rather than duplicating the account.

Options: `--name "Your Name"`, `--org "HelpBnk"`, `--role moderator`.

### 6. Run

```bash
npm run dev
```

Sign in at <http://localhost:3000/login>.

---

## Adding more moderators

Two supported paths:

**In the app (recommended).** An admin opens **Moderators** in the header, enters
an email and a temporary password, and shares it privately. The new moderator can
sign in immediately.

**From the CLI.**

```bash
npm run provision:admin -- --email them@helpbnk.com --password '...' --role moderator
```

> **Signing in is not authorization.** Authentication only proves valid
> credentials. Every moderator route additionally checks for an organization
> membership row server-side (`lib/auth/guards.ts`). An account without a
> membership lands on `/no-access` and can read nothing.

A full invitation-management interface (emailed invites, revocation UI, password
reset) is intentionally out of initial scope.

---

## Using the app

1. **Create event** — name and date are required; location and welcome message
   are optional. Five default questions are added automatically.
2. **Questions** — add, edit, reorder (↑/↓), and remove. Changes autosave, with
   a visible *Saving / Saved / Couldn't save* state.
3. **Preview** — the real participant form at phone width. Nothing is saved.
4. **Open collection** — attendees can now submit.
5. **Share** — copy the link, download the QR code, or rotate the link.
6. **Feedback** — summaries, individual responses, and CSV export.

### Event states

| State | Moderators | Participants |
|---|---|---|
| **Draft** | Edit and preview | Link does not open the form |
| **Open** | Edit and preview | Can submit with a valid link |
| **Closed** | Read feedback | Submissions rejected server-side |

### Rotating a link

Creates a new link and immediately invalidates the old one for **both loading
and submitting** — including any QR code already printed. **Existing feedback is
preserved.**

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Run tests |
| `npm run typecheck` | TypeScript check |
| `npm run db:generate` | Generate a migration after editing `lib/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Browse the database |
| `npm run provision:admin` | Create the org and an admin/moderator |

---

## Branding

All brand configuration lives in **[`lib/brand.ts`](lib/brand.ts)**.

The current palette and wordmark are **provisional placeholders**. To apply
official HelpBnk assets:

1. Put the logo in `public/` and set `logo.src` (e.g. `'/helpbnk-logo.svg'`).
2. Replace the hex values in `colors`.
3. Mirror those hex values in the `@theme` block at the top of
   [`app/globals.css`](app/globals.css).

No component hardcodes a brand value, so this is the only place to edit.

---

## Architecture

```
app/
  (moderator)/          Auth + membership enforced by the group layout
    dashboard/            Event list, "Create event"
    events/[eventId]/     Questions · preview · share · results
    settings/moderators/  Admin-only
  f/[token]/            PARTICIPANT — public, noindex, no auth
  api/f/[token]/submit/ Public submission endpoint
lib/
  brand.ts              All brand configuration
  auth/                 Auth.js config + server-side guards
  db/                   Drizzle schema and queries
  form/                 Visibility, validation, default template
  results/              Aggregation + CSV
  tokens.ts             Token generation and hashing
  token-crypto.ts       AES-256-GCM at rest
```

**`lib/form/visibility.ts` is the single source of truth for conditional
questions.** Both the participant renderer and the server validator import it —
the client is never trusted to say which questions were visible.

### Form versioning

A form version with no responses is edited in place. The first edit **after** a
response exists clones the version, so historical answers keep the exact wording
and options they were given. Each response records the version it completed.

### Concurrent edits while someone is answering

| Event | Result |
|---|---|
| Moderator edits the form | Submission returns 409; the participant is asked to reload. **Their typed answers stay on screen.** |
| Moderator closes collection | Submission returns 409 with a clear message |
| Moderator rotates the link | Old token returns 404 for load and submit |

Invalid submissions never discard the participant's text.

---

## Testing

```bash
npm test
```

82 tests covering the security-critical surface:

- **Token handling** — generation, hashing, encryption round-trip, malformed
  input rejection.
- **Conditional visibility** — hidden questions never block submission; stale
  hidden answers are dropped.
- **Answer validation** — required fields, option ids, rating range, text limits,
  unknown question ids.
- **Form validation** — blank labels, missing/duplicate options, invalid rules.
- **CSV** — formula-injection escaping, no identifiers, no wall-clock times.
- **Anonymity** — schema and migration contain no identifying columns.
- **Integration (real Postgres via PGlite)** — idempotent retries, token
  rotation preserving feedback, form-version preservation, closed-event
  rejection.

---

## Deployment (Vercel)

1. Push to a Git repository and import it in Vercel.
2. Set environment variables: `DATABASE_URL`, `AUTH_SECRET`,
   `TOKEN_ENCRYPTION_KEY`, and `APP_BASE_URL` (your production URL).
3. Deploy, then run `npm run db:migrate` against the production database.
4. Run `provision:admin` once against production.

> **Logging note.** Vercel records request metadata (including IPs and
> user-agents) at the platform edge, outside the application. Those logs are not
> linked to response rows, but review retention and log-drain settings before
> making broader anonymity claims. See
> [`docs/ANONYMITY.md`](docs/ANONYMITY.md#3-hosting-layer-logs-exist-outside-the-application).

Keep test events in a separate Neon branch so fixtures never mix with real
responses.

---

## Scope

**Included:** events, question builder, links and QR codes, anonymous
submission, results, CSV export, moderator auth.

**Deliberately excluded:** ticketing, payments, CRM, marketing campaigns, AI
analysis, automated follow-ups, and any public directory of events or forms.
