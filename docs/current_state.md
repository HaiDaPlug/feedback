# Current State — HelpBnk Event Feedback

_Investigated 2026-09-14. This file is a snapshot, not documentation — see [README.md](README.md) and [docs/ANONYMITY.md](docs/ANONYMITY.md) for the durable docs._

## TL;DR

The app is built, migrated against a real Neon database, has an admin account provisioned, and has been **verified end-to-end in a real browser against the real database** (see "Browser + real-database verification" below) — every documented behavior (anonymity, validation, idempotency, link rotation, closed-event rejection, CSV export) checked out with no bugs found. All 84 automated tests pass, typecheck is clean, lint is clean. This is not a git repository yet.

**Latest session (2026-09-14, later):** a whole-app UI polish pass — see "UI polish pass" below. Every screen was recomposed on a shared design foundation, then re-verified by screenshot at desktop and phone widths against the running app. No behaviour, copy, or data flow changed.

**Dev server is currently running** on `http://localhost:3500` for manual click-through testing. If it's no longer running when you pick this back up: `npm run dev -- -p 3500`. Watch for the "Another next dev server is already running" message — Next.js occasionally leaves a stale lock from a killed process; if you hit that and the port it names isn't actually responding, kill that PID (`taskkill /PID <pid> /F`) and restart.

## What it is

Anonymous event-feedback tool for HelpBnk. Moderators (authenticated, membership-gated) create an event, build a question form, share a link/QR code, and read aggregated anonymous results. Participants answer on their phone with no account and no identifying data stored (see [docs/ANONYMITY.md](docs/ANONYMITY.md) — the schema physically has no columns for participant identity, IP, user-agent, or precise timestamp).

## Stack

Next.js 16 (App Router) + TypeScript, Tailwind v4, Neon Postgres via Drizzle ORM (plain SQL migrations, not `db push`), Auth.js v5 (credentials + bcrypt), Vitest with PGlite for real-Postgres integration tests.

## Verified right now

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Clean |
| `npx eslint .` | Clean |
| `npx vitest run` | 84/84 passed, 8 test files |
| Not a git repo | Confirmed (`git` context says `Is a git repository: false`) |
| `.env.local` present, gitignored | Yes — `DATABASE_URL`, `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `APP_BASE_URL=http://localhost:3500` |
| Neon DB reachable | Yes, queried directly |
| DB tables | `_migrations`, `answers`, `event_access_tokens`, `events`, `form_versions`, `memberships`, `organizations`, `questions`, `responses`, `users` — all 9 app tables + migration tracker |
| Admin account | `hai@khyteteam.com`, membership role `admin`, created 2026-09-07 |
| `events` row count | 1 — an event named "HelpBnk" (Closed, 14 Sept 2026, 0 responses) created by the user during manual click-through. The polish pass's own test event was deleted afterwards by id. |
| Dev server | **Running now** on port 3500 (started this session). Port 3000 is occupied by an unrelated project ("Khyte CRM", a different Next.js app on the same machine) — its `/login` page happened to also 307-redirect, which looked like a match until inspected closely. This app must be started explicitly, on port 3500 to match `APP_BASE_URL`. |
| Logo | Added 2026-09-17: vector lockup/icon rebuilt from the Brand Guidelines in `public/brand/`, drawn inline by `components/ui/Brandmark.tsx` from `lib/brand-marks.ts`; favicon set in `app/` (`icon.svg`, `favicon.ico`, `apple-icon.png`). Palette is still the provisional green — the guideline palette is the next pass. |

Note: port 3000 is **not** this app — confirmed by inspecting the HTML (`Khyte CRM`, Swedish UI text, `components/auth/LoginForm.tsx`). This app needs `npm run dev -- -p 3500` to match `APP_BASE_URL` in `.env.local`.

## Architecture map

```
app/
  (moderator)/          Auth + membership enforced by group layout (lib/auth/guards.ts)
    dashboard/           Event list, "Create event"
    events/[eventId]/    Questions (autosave) · preview · share (link/QR/rotate) · results (+ CSV export)
    settings/moderators/ Admin-only, add moderators
  f/[token]/             PARTICIPANT — public, noindex, no auth, single scrollable page
  api/f/[token]/submit/  Public submission endpoint (idempotent via client-generated key)
lib/
  brand.ts               All brand config (colors, wordmark, logo path) — single source of truth
  auth/config.ts         Auth.js v5 setup; trustHost gated on APP_BASE_URL/AUTH_URL being set
  auth/guards.ts         requireModerator() — the actual authorization check
  db/schema.ts           Drizzle schema; heavy inline comments on the anonymity invariant
  db/queries/            events.ts, forms.ts, participant.ts
  form/                  visibility.ts (conditional-question source of truth, shared client+server),
                          validate-answers.ts, validate-form.ts, default-template.ts
  results/                aggregate.ts, csv.ts (formula-injection-safe)
  tokens.ts / token-crypto.ts   Token generation, SHA-256 hash for lookup, AES-256-GCM at rest
scripts/
  load-env.ts             dotenv loader matching Next.js .env.local precedence (CLI scripts need this explicitly)
  migrate.ts               applies drizzle/*.sql, tracked in _migrations
  provision-admin.ts       idempotent org+admin bootstrap
```

Key design points worth remembering:
- **Anonymity is structural, not policy.** `responses`/`answers` tables have no columns that could hold participant identity. `submittedOn` is a `date`, not a timestamp, specifically so submission time can't be correlated with who left a room.
- **Form versioning**: a version with zero responses is edited in place; first edit after a response exists clones the version so historical answers keep their original wording/options.
- **Token rotation** invalidates old links for both load and submit, but preserves existing responses.
- **`lib/form/visibility.ts`** is imported by both the participant renderer and the server-side validator — the client is never trusted about which conditional questions were visible.

## Two bugs fixed last session (both in place now)

1. **`UntrustedHost` blocked all sign-in** — Auth.js v5 rejects unverified Host headers by default. Fixed in `lib/auth/config.ts` by setting `trustHost` conditionally on `APP_BASE_URL`/`AUTH_URL` being configured, so an unconfigured deployment still defaults to strict. Confirmed present in the file as read.
2. **CLI scripts couldn't read `.env.local`** — bare `dotenv/config` only loads `.env`. Fixed via `scripts/load-env.ts`, imported first in `provision-admin.ts` and `migrate.ts`, matching Next.js's precedence (`.env.local` wins over `.env`; real env vars win over both).

## End-to-end verification already performed (per last session, not re-run today)

Full HTTP-level pass against real Neon: sign-in reject/accept, event creation with 5 template questions + conditional rule, share link + QR generation, anonymous load (200, branding, anonymity notice), anonymous submit (201), stale hidden-answer stripping, idempotent retry, missing-required-field 422, results + CSV correctness (no identifiers, "Responses" language), CSV requires auth (401), link rotation kills old link (404) while preserving feedback, closed event rejects submission (409). Test fixtures were deleted afterward; account was kept.

## Browser + real-database verification (2026-09-14, this session)

Ran the actual app (`npm run dev -- -p 3500`, matching `APP_BASE_URL`) and drove it with headless Chromium (Playwright) plus direct `curl`/DB queries against the real Neon database — not the test suite, not mocks.

| Check | Result |
|---|---|
| Login (correct + wrong password) | Correct credentials → session + `/dashboard`; screenshots confirm clean UI |
| Create event | Redirects to real event UUID; 5 default template questions with conditional rule present |
| Question builder | All fields, reordering, conditional "show when" UI render correctly |
| Preview (desktop + mobile 390px viewport) | Renders participant form accurately; conditional Q5 correctly hidden until Q4="Yes" |
| Open collection | Status pill flips Draft → Collecting |
| Share page | Link + QR code generated; explanatory copy present |
| Anonymous submit (real payload, all question types) | `201 {"ok":true,"duplicate":false}`; DB row has exactly the 5 expected answer rows, no identity columns, `submitted_on` is a date |
| Idempotent retry (same key) | `201 {"ok":true,"duplicate":true}`, still one row |
| Required-field validation | Missing required rating → `422` with per-question error |
| Invalid option id | Rejected with `422` |
| Results page | Correct rating average/histogram, free-text answers, choice percentages, anonymized "Response 1" card with date only |
| CSV export, authenticated | `200`, clean CSV, no identifiers |
| CSV export, unauthenticated | `401` |
| Rotate link | New token generated, old token `active=false`; old link's **page load** shows a friendly "not valid" screen (not a raw error), old link's **submit** returns `404` |
| Close collection | Status → Closed; submit against closed event (even with the still-active new link) → `409` with clear message |
| Console/page errors during the whole flow | None |

All test events, responses, and answers created during this pass were deleted afterward (cascade delete via the parent `events` row). The admin account and its membership were left untouched. `events` table is back to 0 rows.

**Everything matched the documented behavior exactly.** No app bugs found. (Two apparent failures during testing turned out to be test-script issues, not app issues — see below.)

### Notes from testing, not app bugs
- My first attempt mistook an **unrelated app** ("Khyte CRM", a different Next.js project) already running on port 3000 for this one — both happened to redirect `/` to `/login`. Confirmed by inspecting response HTML (Swedish UI text, different component paths). This app was not actually running until started explicitly on port 3500 in this session.
- `dotenv@17.4.2` prints a random one-line "tip" banner on every load, one of which happens to be a third-party product ad (`vestauth.com`) baked into the dotenv package itself (`node_modules/dotenv/lib/main.js`). Not a compromise of this project — just an upstream dependency behavior worth knowing about if it shows up in terminal output or logs.
- A raw sequential UUID like `22222222-2222-2222-2222-222222222222` is correctly rejected by this Zod version's stricter RFC 4122 UUID check (version/variant nibbles enforced) — use `crypto.randomUUID()`-style values for any manual testing.
- The rating control renders as a visually-hidden native `<input type="radio">` inside a clickable `<label>`, not a `<button>` — relevant only if scripting against it.

## UI polish pass (2026-09-14, later session)

Goal: make creating questions and answering them feel seamless and premium without changing the brand, behaviour, or copy. Approach: one shared design foundation written first, then four parallel agents polishing disjoint file sets on top of it, then a screenshot critique pass against the real app.

### Design foundation (use these; do not re-invent)

| File | What it provides |
|---|---|
| `app/globals.css` | Extra tokens (`brand-soft`, `well`, `ink-faint`, `hairline-strong`, two shadows); utilities `text-display` / `text-title` / `text-eyebrow` (the only three heading styles), `card` / `card-raised` (surfaces), `select-chevron`. The global `:focus-visible` rule now lives in `@layer base` so controls can override it. |
| `components/ui/Section.tsx` | `PageHeader`, `SectionHeader`, `Eyebrow`, `Notice` (tones: neutral / info / ok / warn / danger). Every page title, section title, and inline notice goes through these. |
| `components/ui/Button.tsx` | `sm` size, pressed states, and `buttonClass()` for `<Link>` / `<a>` that must look like buttons. |
| `components/ui/Field.tsx` | `TextInput` / `TextArea` / `Select` / `Checkbox` with `optional` markers; `CONTROL_CLASS` / `SELECT_CLASS` for bare controls. All local `inputClass` copies were deleted. |
| `components/ui/SaveIndicator.tsx` | The single autosave status (idle / saving / saved / error + retry). |
| `components/ui/StatusPill.tsx` | Same API, now with a status dot. |

Rhythm rules the code follows: sections 40px apart, groups 24px, fields 16px, label→control 6px; cards never nest (subordinate groups use a `bg-well` well); one primary button per region.

### What changed per area

- **Question builder** (`QuestionEditor`, `QuestionBuilder`, `EventDetailsForm`, `EventWorkspace`): question text is the dominant field; type + required sit in a compact row; help text is revealed on demand; reorder/remove are quiet icon buttons; the conditional rule is a borderless well. At `xl:` the workspace is two columns with a **sticky live preview** fed from in-memory state (new optional `onQuestionsChange` / `onChange` callbacks; autosave untouched).
- **Preview** (`PreviewFrame`): an iPhone mockup (`components/ui/Iphone.tsx`, adapted from Magic UI with interactive `children` instead of media) whose screen mirrors the participant page exactly and scrolls internally. The participant anonymity banner was removed on 2026-09-18 at the user's request; the "Anonymous. Nothing else is collected." line under Submit remains.
- **Participant form** (`QuestionRenderer`, `FeedbackForm`, `f/[token]/page.tsx`, thanks, invalid link): numbered questions, 18px labels, Lowest/Highest anchors under the rating, character counter past 80% of a text limit, composed header, quiet sticky submit bar. **Accessibility fix:** keyboard focus on the custom rating/choice controls was invisible (native input is `sr-only`); the label now shows a ring via `has-[:focus-visible]`.
- **Moderator shell, dashboard, create event, event header/tabs, settings, auth, error pages**: `max-w-6xl` shell, `PageHeader` everywhere, dashboard rows as cards with a stat + quiet actions, login/no-access/not-found as centred compositions.
- **Results**: stat row (Responses, Questions, Export CSV), answer-kind eyebrow per card, readable bars on a `bg-well` track, wrapping choice labels, `dl` grid for individual responses.
- **Share**: two columns at `lg:` with the QR card anchored right; rotate separated as a quiet danger zone.

### Verification performed

Typecheck, lint, and all 84 tests pass. A Playwright script created one test event, drove every screen at 1440px and 390px, submitted a real anonymous response, and screenshotted 20 states; the test event was then deleted by id (cascade). No console errors except the browser's automatic `/favicon.ico` request (no icon exists yet). Two issues found in the screenshots were fixed: a stacked triple focus ring on inputs (unlayered global rule) and an indented "Optional" marker when it wrapped.

The screenshot harness is not checked in. It used `playwright-core` from a sibling project (`../digital-rapport/node_modules/playwright-core`) with the Chromium build in `%LOCALAPPDATA%\ms-playwright\chromium-1243`, against the dev server on port 3500. Worth turning into `scripts/ui-check.cjs` with `playwright-core` as a devDependency (see next steps).

## Improvements we can do next

Ordered roughly by value for the two core jobs.

### Creating questions
1. **Undo after remove.** A removed question is gone immediately. A short "Question removed — Undo" notice fits the "nothing is silently discarded" ethos.
2. **Duplicate question.** Common when building several similar choice questions.
3. **Drag-and-drop reordering** alongside the existing up/down buttons (keep the buttons for keyboard users).
4. **Enter to add the next option** in the options list, and delete-on-empty for the last option.
5. **Form health in the header.** Show the count of unresolved validation issues next to the save indicator so a problem in question 5 is visible from the top.
6. **Conditional rules from multiple-selection questions.** `CONDITION_SOURCE_TYPES` is `['single_choice']` only; `visibility.ts` would need an "includes" rule.
7. **Custom rating anchors** per question (e.g. "Poor" / "Excellent") instead of the fixed Lowest/Highest.
8. **Question templates.** A small library of proven questions to insert, seeded from `default-template.ts`.

### Answering
1. **Progress in the sticky bar** ("3 of 5 answered") so a participant knows how much is left without scrolling.
2. **Answers survive a reload.** Keep in-progress answers in `sessionStorage` keyed by form version so a locked phone or accidental refresh does not lose typed text. Local-only, so no anonymity impact, but document it in `docs/ANONYMITY.md`.
3. **Smooth scroll to the first error** in addition to focusing it.
4. **Dark mode tokens.** Evening events on OLED phones; the palette is light-only today and would need a dark set in `@theme` plus `color-scheme`.
5. **Localisation readiness.** All participant copy is inline English; extracting it to one module is the first step if HelpBnk runs events in other languages.

### Results and share
1. **Print-ready QR poster** (A4 PDF or print stylesheet: event name, QR, short instruction) generated locally like the QR itself.
2. **Copy a per-question summary** (text) for pasting into a report.
3. **Cross-event comparison** for the rating question when several events share the template.
4. **Response count on the Feedback tab label.**

### Product and codebase hygiene
- **`git init`** before more changes accumulate — this pass touched ~30 files with no version control.
- **Brand assets.** Logo into `public/`, set `lib/brand.ts → logo.src`; add a favicon (fixes the only console error).
- **Default template nit.** The "previously part of other organizations" question has help text "Optional.", which now duplicates the renderer's Optional marker. Content decision; one-line change in `lib/form/default-template.ts`.
- **Shared `BackLink`** in `Section.tsx`: the chevron back link is duplicated in `events/new` and the event layout.
- **`hideLabel` on `TextInput` / `Select`** so the question-text and answer-type controls can use the primitives instead of `CONTROL_CLASS` + sr-only labels.
- **Check in the screenshot harness** as `scripts/ui-check.cjs` (devDependency `playwright-core`; reuse the local Chromium) so future UI work can be verified the same way.
- **Rotate the admin password** (still the one echoed in earlier terminal output).

## Incident: question loss and fix (2026-09-18)

A moderator's 9-question form ("Doorbell of Dreams") vanished after editing. Cause: editing a form that already had responses cloned it into version 2 with fresh question ids (correct), but the browser kept the old ids. The next autosave deleted version 2's questions and then failed inserting rows whose ids still belonged to version 1 (primary-key collision). With the HTTP driver having no transactions, the delete stuck; every later autosave failed the same way, and the on-screen state hid it until a reload.

Fix (all in place, pinned by `tests/save-questions.test.ts`, which runs the real `saveQuestions` against PGlite and fails on the old code):
- `lib/db/queries/forms.ts`: upsert first, prune second (a failed write can never empty a version); stale/foreign ids are re-keyed instead of colliding; the upsert only ever updates rows inside the target version; the event pointer moves last; the result is verified before returning.
- `saveQuestionsAction` returns the canonical ids and reports failures instead of throwing; `QuestionBuilder` adopts the ids via an alias map, has an explicit Save button, and shows a red "not saved" notice on failure.
- Feedback itself was never at risk: `answers.question_id` and `responses.form_version_id` are `ON DELETE RESTRICT`, so answered rows cannot be deleted (also pinned by a test).
- Recovery: the 9 questions were copied from version 1 into version 2 (fresh ids); the blank multi-choice question added after the loss sits at position 10.

## Security pass (2026-09-18)

Reviewed auth, guards, tokens, submission endpoint, export, headers, dependencies (`npm audit --omit=dev`: 0). Applied:
- Sign-in rate limiting per IP (20/15 min) and per email (10/15 min) in `lib/auth/config.ts`, surfaced to the form as a distinct message. Policies in `lib/rate-limit.ts`; tested.
- Session lifetime 7 days (was 30).
- Headers: CSP (same-origin everything; inline script/style allowed because Next emits them; `unsafe-eval` dev only), HSTS, Permissions-Policy, site-wide Referrer-Policy with `no-referrer` kept on `/f/*`.
- Malformed event ids now resolve to "not found" instead of a database error (fixes `/events/new/preview` 500).

Residual risks, by design: the participant token is in the URL, so hosting-provider request logs can contain it (mitigated by rotation and noindex/no-referrer); the rate limiter is per-instance in memory on serverless; CSP permits inline scripts (a nonce-based CSP would need a proxy layer).

## Manual click-through testing (in progress, 2026-09-14)

Handed off to the user to click through the real UI themselves at `http://localhost:3500/login` (login: `hai@khyteteam.com` / see below for current password) while the dev server runs in the background. Session paused here — resume by asking what was found, or re-verifying the server is still up.

**Login password**: rotated 2026-09-18; it lives in the user's password manager and is not recorded here. To rotate again:
```
npm run provision:admin -- --email hai@khyteteam.com --password 'your-new-password'
```
Safe to re-run — updates the existing account rather than duplicating it. Prefer `npx tsx scripts/provision-admin.ts ...` if the terminal is being logged, since `npm run` echoes its arguments.

## Outstanding / not yet done

- **Logo, favicon (2026-09-17) and brand pass (2026-09-18) done.** Palette is now the guideline's (primary `#0090e8`, navy `#052c4f`, cyan `#6fdcfa`, yellow `#f2d205` reserved for the "Collecting" status, ink `#020204`), Inter is loaded via `next/font/google` (self-hosted, no third-party request), and four brand moments were added: split blue-gradient login, navy QR poster card on Share, navy stat tile on Feedback, faint Y-motif backdrop on participant/terminal pages. New `inverse` button variant for navy surfaces. The guideline PDF lists the primary as `#00D47E` (a green); the rendered swatch `#0090e8` is what's used. Awaiting the user's manual QA.
- ~~`/events/new/preview` 500~~ fixed 2026-09-18 (`getEvent` and `assertEventInOrg` treat non-UUIDs as not found).
- **Git:** initialised 2026-09-18 and pushed to `https://github.com/HaiDaPlug/feedback` (`main`). `.env.local` is ignored; only `.env.example` is tracked.
- Participant links are live/open by design (no review gate) — keep events in **Draft** until ready to collect real responses.
- Admin password rotated 2026-09-18. The previous one appears in earlier transcripts and in this file's git history; it no longer works.
- See "Improvements we can do next" above for the product backlog.
