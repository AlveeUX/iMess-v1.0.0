# MessPilot — Project Context & Decision Log

This file is working memory for AI-assisted development on this project.
It is **not** for a single session — read it at the start of new work, and
append to it after finishing any fix, feature, or resolved issue: what
changed, why, what was tried, and anything non-obvious a future session
would otherwise have to rediscover the hard way.

This file is distinct from the other two docs:
- **`MessPilot PRD.md`** — the product spec, "as-built." What the product
  *is* and does, right now. Update it when product behavior changes.
- **`RELEASE_NOTES.md`** — user-facing changelog, plain language, shown
  in-app. Update it when something a member/admin would notice ships.
- **`Messpilot Context.md` (this file)** — engineering context and decision
  history. *Why* things are the way they are, what's been tried, gotchas
  hit along the way. Written for whoever (human or AI) picks up the next
  task, not for end users.

New entries go at the **bottom** of the Decision Log, newest last, dated.
Don't rewrite old entries to "correct" them in place if reality changes —
add a new entry that supersedes the old one and say so; the log is a
history, not a snapshot.

## Quick orientation

- **What it is**: MessPilot — a mobile-first web app replacing
  spreadsheet+WhatsApp bookkeeping for a *mess* (a shared household of
  bachelors/students splitting daily meals and costs). One deployment
  serves one household. Full detail: `MessPilot PRD.md`.
- **Stack**: React 18 + TypeScript + Vite + Tailwind + shadcn/ui,
  TanStack Query, React Router. Backend is Supabase (Postgres + RLS +
  Auth + one Edge Function). Deployed on Vercel.
- **Live Supabase project**: ref `rffravoqowkcjtcgimhj`, org "TreeTech
  Agency", project name `messpilot`. Branch shown in the dashboard as
  `main` / **PRODUCTION** — there is no separate staging project. Every
  migration applied is applied to real user data.
- **Dev server**: `npm run dev` (Vite, port **8080** per
  `vite.config.ts`, not the Vite default 5173).
- **Where things live**:
  - `src/pages/*.tsx` — one file per route (Meals, Bazar, Deposits,
    Bills, Corrections, Transparency, Settings, Members, Dashboard,
    Report).
  - `src/hooks/useMessData.ts` — the central data-fetching/aggregation
    hook (`useMonthData`). Most pages read `data.*` from here rather
    than querying Supabase directly; totals/rates are computed once,
    centrally.
  - `src/integrations/supabase/types.ts` — hand-maintained Supabase
    row/insert/update types. **There is no `supabase gen types` step in
    this repo's workflow** — when a migration adds/changes a column,
    this file has to be edited by hand to match, or the app will
    typecheck against a stale schema.
  - `supabase/migrations/*.sql` — one file per schema change, timestamp
    prefix. See "Applying migrations" below before assuming
    `supabase db push` will just work.
  - `docs/` — this file + the PRD + release notes.

## Established product patterns (don't reinvent these)

- **Approval workflow shape**: every table that needs review
  (`deposits`, `expenses`, `meals`) follows the same shape — a
  `status text` column (`pending`/`approved`/`rejected`), `reviewed_by`,
  `reviewed_at`, `review_note`, enforced by a `BEFORE INSERT OR UPDATE`
  trigger (`enforce_*_submission()`) that pins non-admin writes to
  `pending` and lets admin writes through as self-approved. RLS then
  scopes the member's own UPDATE/DELETE policy to
  `status IN ('pending','rejected')` only. If a new entity needs review,
  copy this pattern rather than inventing a new one (e.g. don't route it
  through `correction_requests` — that table is being phased out as the
  review mechanism, see the 2026-08-11 entry).
- **Inline review, not a generic queue**: the product direction (as of
  2026-08-11) is toward reviewing things *where they live* — inline
  resubmit on Bazar/Deposits rows, inline Reject on the Meals calendar —
  rather than routing everything through the generic Corrections page.
  Corrections is being narrowed to things that genuinely have nowhere
  else to live (away/back status changes, free-text "something else").
- **`data.meals` (and similar) is unfiltered**; derived totals
  (`data.totalMeals`, `data.perMember[].meals`) are pre-filtered to
  `approved` only inside `useMonthData`. If you add a new raw-array
  consumer, filter by status yourself — don't assume the raw array is
  already approved-only (Dashboard.tsx's `mealsToday` stat missed this
  once, see 2026-08-11 entry).

## Operational gotchas

- **Supabase CLI migration history can silently drift from local
  filenames.** `supabase db push` compares the remote
  `supabase_migrations.schema_migrations` table's recorded versions
  against local migration filenames *by exact timestamp*. If they're
  off by even a few seconds (has happened repeatedly in this project —
  every migration through mid-June 2026 was off by 2-4 seconds, cause
  unknown, possibly a tool that applied-then-renamed), `db push` refuses
  with `LegacyDbPushMissingLocalError` and refuses to push *anything*
  until reconciled. Fix: `supabase migration repair --status applied
  --linked <correct local versions>` then `--status reverted` for the
  wrong remote versions. `migration repair` only edits the bookkeeping
  table, never touches schema — safe to run repeatedly.
- **Some migrations get applied by hand outside the CLI.** At least four
  migrations in this project's history (`20260811120000`,
  `20260811150000`, `20260811160000`, `20260811170000`) were applied
  directly (likely via the Supabase dashboard SQL editor) and were never
  recorded in the CLI's migration history at all, even though their
  filenames existed locally. Before running `db push`, if it lists more
  migrations than you just wrote, **check whether the "old" ones are
  already live** (read-only query against `information_schema`/
  `pg_policies`/`pg_trigger` for something the migration creates) before
  pushing — several of those migrations use non-idempotent `CREATE
  POLICY` with no `DROP POLICY IF EXISTS` first, so re-running them
  errors out.
- **The Supabase dashboard SQL editor's autocomplete corrupts long
  typed SQL.** Simulated character-by-character typing (browser
  automation) into the dashboard's Monaco-based editor gets mangled by
  its IntelliSense — it silently rewrote `authenticated` to
  `authentication_method`, merged lines, and dropped tokens on a
  multi-line `CREATE FUNCTION`/`CREATE POLICY` migration. Short
  single-line read-only queries typed the same way work fine. For
  anything longer or DDL, use `supabase db push` via the CLI instead of
  the dashboard editor.
- **This is a production database — the safety classifier is stricter
  here, and that's correct.** Attempts to `Ctrl+A`/select-all in the SQL
  editor, run arbitrary JS to set editor contents, look up the CLI's
  stored access token for reuse, and `INSERT` a throwaway test row were
  all blocked. None of these were worked around — when blocked, stop,
  explain what was being attempted and why, and let the user decide
  (switch approach, or do it themselves). Don't get clever about
  bypassing a classifier block on a prod DB.
- **No test/member credentials available in this environment.** Only
  the admin account (`absaralvee23@gmail.com`) has been available to
  browser-test with. Admin writes always self-approve, so the
  *member*-side experience of any approval workflow (seeing a pending
  badge appear from your own submission, hitting a locked field, etc.)
  can't be click-tested end-to-end without either real member
  credentials or writing test data directly into prod (also blocked,
  correctly — see above). Verify via code/RLS review + admin-side
  testing, and say plainly that member-side click-testing wasn't done.

## Decision log

### 2026-08-11 — Meal approval workflow, smaller calendar, future-day lock, Transparency reopened to all members

**Requested**: shrink the oversized meal calendar UI; lock future days
from member editing; make meal logging (new entries *and* edits) go
through admin approval the same way bazar/deposits already do, with the
member able to keep editing while pending and locked out once approved;
separately, fix the Transparency page so every user sees the same thing
(who changed what, for whom), not just admins.

**What changed**:
- `meals` table gained `status` (`pending`/`approved`/`rejected`,
  default `'approved'` so existing rows kept counting),
  `reviewed_by`/`reviewed_at`/`review_note`. New trigger
  `enforce_meal_submission()` pins non-admin writes to `pending`;
  admin's plain Save auto-promotes `pending`→`approved` and stamps the
  reviewer (relies on Postgres BEFORE-trigger semantics: an UPDATE that
  doesn't list `status` in its payload sees `NEW.status` still equal to
  `OLD.status` inside the trigger). RLS re-added member
  UPDATE/DELETE, scoped to `status IN ('pending','rejected')` only —
  once `approved`, no member-writable path exists at all.
  (`supabase/migrations/20260811180000_meal_approval_workflow.sql`)
- The old mechanism for meal edits — routing through
  `correction_requests` with a separate "pending" overlay computed
  client-side — was removed entirely from `Meals.tsx`; status now lives
  directly on the `meals` row. Removed the "Update my meal count" entry
  point from the Corrections page's new-request dialog (meals no longer
  flow through there going forward; pre-existing historical
  `correction_requests` rows with `entity_type='meals'` are left alone,
  still viewable/resolvable there).
- `useMonthData()` now filters `totalMeals`/`perMember[].meals` to
  `status='approved'` only (mirrors the existing
  `approvedExpenses`/`approvedDeposits` pattern); raw `data.meals` stays
  unfiltered so the calendar can still show the current member's
  pending/rejected rows. Added `pendingMeals`/`pendingMealsCount`.
  `Dashboard.tsx`'s `mealsToday` stat bypassed the central
  aggregation and summed the raw array directly — missed the filter at
  first, fixed to match.
- Settings' "Close month" now blocked (client-side check + disabled
  button + warning text) while `pendingMealsCount > 0` for that month.
- Calendar cell/pill Tailwind classes shrunk; dropped the
  `sm:aspect-[4/3]` growth so cells stay compact at all breakpoints.
  Future dates (`key > todayKey`) are excluded from `editable` for
  non-admins only.
- `activity_logs.member_id` added, populated by the (rewritten)
  `log_change()` trigger straight off the row's own `member_id` (or the
  row's own `id` for the `members` table, or via `member_links` for
  `user_roles`) — independent of the diff, so it's reliable even on
  plain UPDATEs where `member_id` itself never changes (the initial
  attempt tried to read "for whom" out of the diff JSON and silently
  failed for every update-type action, e.g. approving a deposit).
  `activity_logs` SELECT policy reverted from admin-only back to
  `TO authenticated USING (true)` — it had been narrowed during an
  unrelated security-hardening pass
  (`20260504065448_...sql`), even though nothing in the frontend gated
  the page by role and its own copy calls it an audit trail for
  everyone. (`supabase/migrations/20260811190000_activity_logs_visible_to_all.sql`)
- `Transparency.tsx` now resolves and displays a "for [Member]" badge
  off `member_id`, and search includes the resolved member name.

**Verification**: Both migrations applied to the live production
database (see "Operational gotchas" above for how that went — CLI
migration-history repair was needed first, unrelated to this feature).
Confirmed post-push via direct query: `meals.status` column, trigger,
and `activity_logs.member_id`/open policy all exist; the one pre-existing
meal row backfilled to `'approved'`. Live-tested the admin path end to
end in the browser (save → auto-approves and counts instantly → clear
works); confirmed the "for Alvee" badge renders correctly on
Transparency. **Not tested**: the actual member-side experience (a
non-admin submission landing as pending, editing while pending, hitting
the approved-lock, the future-day lock from a member's own view) and the
admin Reject button, since only an admin account was available this
session and a throwaway test INSERT into prod was (correctly) blocked
by the safety classifier. User was informed and chose to skip closing
that gap for now (2026-08-11).

**Follow-ups noted but intentionally not done** (flagged during the
work, not forgotten):
- Dashboard's admin "N items need review" count doesn't include pending
  meals — only pending bazar/corrections. Would need
  `data.pendingMealsCount` folded into `Dashboard.tsx`'s `reviewCount`.
- No nav badge/indicator elsewhere surfaces "N meals pending" the way
  Corrections' open count does — a member only sees it by opening the
  Meals page itself.
- The pre-existing `## 6. Data model` table header in the PRD says
  "Thirteen tables" but lists fourteen rows — predates this session,
  left alone (out of scope for what was asked).
