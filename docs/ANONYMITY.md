# Anonymity: what this application guarantees, and what it does not

This document exists so that nobody — moderator, participant, or future
developer — has to guess how strong the anonymity promise is. It is deliberately
honest about the limits.

The participant-facing wording is exactly this, and nothing stronger:

> Your feedback is anonymous. Please avoid including your name or other
> identifying details in your answers.

---

## What is guaranteed

### 1. There is nowhere to put an identifier

Anonymity is enforced by the database schema, not by application policy. The
`responses` and `answers` tables have **no column** capable of holding a
participant identifier:

| Not present | Why it matters |
|---|---|
| `user_id` / `participant_id` | No account is ever associated with feedback |
| `ip_address` | The submitter's network address is never stored |
| `user_agent` | No device or browser fingerprinting |
| `session_id` | No cross-request participant tracking |
| `email` / `name` / `phone` | No direct identifiers, by construction |

A test (`tests/anonymity.test.ts`) asserts these columns are absent from both
the Drizzle schema and the generated migration SQL, so adding one later fails
the build.

### 2. No participant identity exists at all

- Participants never sign in, register, or supply any identifier.
- Feedback is never linked to a moderator account, an attendee record, an
  invitation recipient, or an identity from another HelpBnk system.
- There is **no hidden identity-to-response mapping**. It is not that the
  mapping is protected — it does not exist.
- Response labels ("Response 12") are positional **within one event only**.
  "Response 3" at two different events says nothing about the same person.
  Nothing persists across events.

### 3. Submission timing is deliberately coarse

`responses.submitted_on` is a `DATE`. There is **no wall-clock timestamp**.

This is a specific de-anonymisation defence: at an event with eight attendees, a
submission time of 14:32 combined with "who left the room at 14:32" identifies
someone. Storing only the date removes that correlation. The dashboard and the
CSV export both show the date only.

### 4. The idempotency key carries no information

Each form load generates a random UUID used solely to make retries idempotent.
It is client-generated, unique per event, never displayed, never exported, and
tells nobody anything about who submitted.

### 5. Abuse controls do not create an identity link

The rate limiter hashes the client IP with a **salt regenerated on every cold
start**, truncates it to 12 characters, and keeps it only in an in-memory map
with a short TTL. It is never written to the database, never logged, and never
stored next to a response. See `lib/rate-limit.ts`.

### 6. Access tokens do not leak

- Participant pages send `Referrer-Policy: no-referrer`, so the token-bearing
  URL is never sent to another origin.
- Pages carry `noindex, nofollow, noarchive`, and `/robots.txt` disallows
  everything.
- **No web fonts, analytics, or third-party scripts load on participant pages.**
  The QR code is generated in the browser, so the token is never sent to an
  external QR service.
- Tokens are never written to a log line or an error message.
- Only the SHA-256 hash is used for lookup; the token is additionally stored
  encrypted (AES-256-GCM) under a key held only in the server environment.

### 7. Exports contain no collected identifiers

The CSV contains event details, question wording, and answers. It contains no
idempotency key, no token, no IP, and no time finer than the date. Asserted in
`tests/csv.test.ts`.

---

## What is NOT guaranteed

Please read this section before describing the system to participants.

### 1. Free text can identify the writer

**This is the most important limitation.** A participant who writes *"as the
only person who joined from the Berlin office in March"* has identified
themselves, and no amount of engineering prevents that. This is why the notice
asks participants to avoid identifying details rather than promising the
impossible.

**Do not tell participants that written responses cannot be traced to them.**

### 2. Small samples are inherently revealing

At an event with five attendees, "the person who rated it 1" may be obvious
from context, even with no stored identifiers. Background questions about
previous organizations or communities are therefore **optional by default** in
the template — a specific answer can single someone out in a small group.

### 3. Hosting-layer logs exist outside the application

**On Vercel** (the documented deployment target):

- Vercel records request-level metadata at the platform edge — including client
  IP addresses and user-agent strings — in its own logging infrastructure. This
  happens **outside the application** and cannot be disabled from the app code.
- These platform logs are **not linked to response rows**. They record that a
  request to `/api/f/<token>/submit` happened; they do not contain answers.
- However, someone with access to both the Vercel log stream and the database
  could correlate a request time with a response — which is a further reason
  the database stores dates rather than timestamps.

**Before making broader anonymity claims, review:**

- Vercel log retention settings and who on the team can access them.
- Whether Log Drains forward request logs anywhere else.
- Neon's own query logging and connection-log retention.
- Any monitoring or error-tracking tool added later — **do not add one that
  captures request bodies**, since those contain answers.

### 4. One response per person cannot be guaranteed

An anonymous, shared-link form **cannot** enforce one response per human. Anyone
holding the link can submit more than once from a private window or another
device.

We deliberately do **not** prevent this with email verification, device
fingerprinting, or persistent tracking identifiers, because every one of those
would break anonymity. The idempotency key prevents *accidental duplicates* from
retries and double taps; it does not prevent *deliberate* repeat submission.

This is why the headline metric is labelled **"Responses"** and never "Unique
attendees", and why the dashboard shows **no response-rate percentage** — there
is no verified attendee count to divide by.

### 5. A link proves possession, not attendance

The feedback link is a shared secret, not proof of attendance. It can be
forwarded to someone who never attended. Distribution limits who is *likely* to
have it; it does not verify anything.

**Do not describe results as verified-attendee feedback.** If a link spreads
further than intended, rotate it — the old link stops working immediately for
both loading and submitting, while existing feedback is preserved.

---

## Operational guidance

- **Never add** a column, log line, or analytics event that records who
  submitted feedback.
- **Never add** an error-tracking integration that captures request bodies.
- Keep test fixtures out of production: provision test events in a separate Neon
  branch or database, never alongside real responses.
- If you add a new export or API, re-check it against the "Exports contain no
  collected identifiers" rule above.
