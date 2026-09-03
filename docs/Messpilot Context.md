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

### 2026-08-12 — Show/hide toggle on the password field

**Requested**: add a "view" icon to the password input on the auth page
so admin and member users can check what they actually typed before
submitting.

**What changed**: `src/pages/Auth.tsx` — the single password `Input`
(shared by both sign-in and sign-up, since it's one form with a `mode`
toggle) is now wrapped in a `relative` div with a `lucide-react`
Eye/EyeOff button absolutely positioned inside it. Local `showPassword`
state flips the input's `type` between `password`/`text`; the button is
`type="button"` (so it doesn't submit the form) and `tabIndex={-1}` (so
Tab skips straight from the password field to Submit). No backend or
schema change — purely client-side UI.

**Verification**: Live-tested in the running dev server (`npm run
dev`, port 8080) via browser automation — typed a password, confirmed
it rendered masked, clicked the eye icon, confirmed it revealed the
literal typed text and the icon swapped to eye-off, and confirmed the
same field/behavior in sign-up mode too (shared component). Committed
(`1bfef11`) and pushed to `main`/production.

### 2026-08-12 — Password-toggle hover color fix; release notes reordered and shortened

**Requested**: the eye icon's hover color (`hover:text-foreground`,
near-white) was invisible against the dark input background; separately,
make the release-notes modal show the newest entry first and trim each
bullet down to one on-point sentence.

**What changed**:
- `src/pages/Auth.tsx` — hover color changed from `hover:text-foreground`
  to `hover:text-primary` (the brand orange), which reads clearly against
  the dark input background regardless of state. Committed `04736e7`,
  pushed to `main`.
- `docs/RELEASE_NOTES.md` — added an `## August 12, 2026` section above
  `## August 11, 2026` (new dated sections go directly under the intro
  line, per the file's own "newest first" convention at the top) covering
  the password-visibility toggle. Rewrote every existing bullet down to
  one short sentence each — the previous entries ran 2-3 sentences with
  a lot of restated mechanism detail. `ReleaseNotesDialog.tsx` just
  renders this file's raw markdown top-to-bottom with no sorting
  logic, so ordering is a pure content convention, not a code fix —
  the important bit for future entries is to keep adding new dated
  sections at the top, not the bottom.

**Verification**: Hover fix confirmed visually via browser automation
(zoomed screenshot of the icon mid-hover, unmistakably orange). Release
notes change was **not** visually confirmed in the actual modal — no
member/admin session was available in the browser this round (the only
known credential had just been sent through a password-reset email
earlier the same session, so nothing to sign in with), so this was
verified by reading the raw markdown and relying on the fact that
`ReactMarkdown` already renders this exact file shape (H2 + bullets)
correctly in every prior release-notes commit. Worth a quick manual
look in-app next time someone's signed in.

### 2026-08-12 — Critical fix: `log_change()` trigger crashed on almost every UPDATE since the previous session; Dashboard quick meal-approval list

**Requested**: "admin also can't edit the days for meal update" (same as
members) and meal approval should be easier — surfaced as a request for
a pending-meal-approvals list on the Dashboard for one-click review.

**Root cause (not what it looked like)**: this had nothing to do with
roles or the future-day/approved-day lock in `Meals.tsx` — those checks
were already correctly gated behind `!isAdmin` and admin's DB policies
(`Admin update meals` etc.) have no future-day restriction. The actual
bug: `public.log_change()` — one generic `AFTER INSERT OR UPDATE OR
DELETE` trigger function attached to nearly every table (`meals`,
`deposits`, `expenses`, `members`, `months`, `user_roles`,
`correction_requests`, `bills_v2`, `bill_items`, ...) — had its UPDATE
branch (added in the previous session's
`20260811190000_activity_logs_visible_to_all.sql`) read `OLD.status` /
`NEW.status` / `OLD.is_closed` / `NEW.is_closed` **directly**. Those
columns don't exist on every table the trigger fires on (`meals` and
`deposits` have no `is_closed`; `months` has no `status`). Referencing a
field that doesn't exist on a trigger's `OLD`/`NEW` record throws
Postgres error 42703 ("record has no field ...") the instant that
branch's condition is evaluated — even inside an `AND` guarded by
`TG_TABLE_NAME = '...'` that would make the branch false, because
record-field resolution isn't short-circuited the way a plain boolean
would be. Confirmed empirically: clicking Approve on a pending meal sent
a `PATCH .../meals?id=eq....` that came back `400`, body `{"code":
"42703", "message": "record \"old\" has no field \"is_closed\""}`.

**Blast radius**: any UPDATE on any of those tables that didn't happen
to match the *first* branch it hit crashed outright. `expenses`
status-changing updates were the one path that looked fine (that branch
matches first and short-circuits before reaching the broken ones) —
which is exactly why bazar approve/reject seemed to work while meal
approvals silently 400'd. By the same logic this also broke: a member
editing/resubmitting their own pending or rejected meal, deposit
reviews whose status doesn't change on that particular UPDATE, member
edits, and (by code inspection, not live-tested — didn't want to
actually flip the live month's closed state to check) Settings'
close/reopen month, since `months` rows hit the `OLD.status` reference
in the very first branch immediately. INSERTs and DELETEs were
unaffected — they never reach this branch.

**Fix**: `supabase/migrations/20260812120000_fix_log_change_generic_trigger_crash.sql`
replaces every direct `OLD.field`/`NEW.field` read in the UPDATE branch
with the same `to_jsonb(OLD)->>'field'` pattern the function already
used elsewhere (for `date`/`month`/`member_id`) for exactly this reason
— jsonb key lookup on a missing key returns `NULL` instead of erroring.
Also added a `meals` branch alongside the existing `expenses` one (they
now share the same status-column shape) so meal approvals/rejections
log as `"approved"`/`"rejected"` in the activity feed instead of a
generic `"updated"`. Pushed straight to production via `supabase db
push` after explicit user confirmation, given it was actively breaking
live approvals.

**Also added**: a "Pending meal approvals" card on `Dashboard.tsx`,
visible to admins whenever `data.pendingMealsCount > 0` (that field
already existed in `useMessData.ts` from the previous session but was
never wired in — flagged as a known follow-up at the time). Lists every
pending meal across all members with inline Approve/Reject buttons
(`supabase.from("meals").update({status}).eq("id", ...)`, same pattern
as `Meals.tsx`'s existing `rejectDay`/admin-save), no navigation or
per-member calendar hunting required. Also folded
`data.pendingMealsCount` into the Dashboard headline's `reviewCount`,
which previously only summed bazar + corrections.

**Verification**: Reproduced the 400 live against production (both via
the actual UI button and a replayed raw `fetch` for the exact same
request, to pull the precise Postgres error out of the response body
Supabase's JS client swallows into a generic message). After pushing
the fix, re-tested the same Approve action end-to-end: succeeded,
`activity_logs` shows a clean `action: "approved"` row with correct
`reviewed_by`/`reviewed_at`, Dashboard totals and live meal rate
recalculated correctly. Reject wasn't separately live-tested (no second
pending row available without member credentials to create one) but
shares the exact same fixed function and an already-proven code path.
**Not tested**: Settings' close/reopen month (didn't want to flip live
state just to check) — fixed by the same migration by inspection, worth
a quick admin-side check next time a month actually needs closing.

### 2026-08-12 — Retired `bazar_contributor`; promoted Alvee to `super_admin`

**Requested**: user asked what `bazar_contributor` was actually for and
concluded (correctly) there was no practical use case; asked to replace
it with a real `admin` tier, move the existing admin account to
`super_admin`, and confirmed super_admin should be the only role able to
grant `admin` (with plain admins unable to touch the admin/super_admin
tier at all) "so the mess can keep running in the absence of the super
admin."

**Root cause of "no use case"**: traced via git history — the
contributor-gated `expenses` INSERT policy was replaced on 2026-06-04
(`20260604191519_...sql`) with one open to every authenticated member,
and nothing ever filled the gap. Confirmed live: `Bazar.tsx`'s submit
button has no role check, only `!locked && !blocked`. Every holder
(Alvee, Prosen, Test — literally everyone with an account at the time)
had it, and it did nothing.

**Also discovered while planning**: `super_admin` (added May 2026) had
*never actually been used* in this project's real data. The original
one-time backfill (`20260512180248_...sql`, "promote the oldest admin
to super_admin") ran before any real user existed and silently matched
zero rows — this went unnoticed for three months because `is_admin_or_
super()` makes `isAdmin` true for either tier, so nothing behaved
differently. Verified live before touching anything: zero `super_admin`
rows in production; Alvee held `admin` + `bazar_contributor`; Prosen and
Test held `member` + `bazar_contributor`.

**Approach**: planned via `/plan` before writing any code, per explicit
request. Two decisions were confirmed with the user before finalizing:
fully remove `bazar_contributor` from the Postgres enum (vs. leaving it
defined-but-unused) despite the extra migration risk of no staging
environment to rehearse against; and drop Prosen/Test back to plain
`member` rather than promoting them to `admin` too, since the role never
granted them anything functional to begin with.

**Critical technique**: Postgres can't drop a single enum value — only
rename-old/create-new/migrate-column/drop-old works, and every function
or policy with an argument typed to the old enum breaks unless
explicitly rebuilt. Rather than hand-tracing dependencies through 15+
migration files (this project's own history shows applied-state can
diverge from what the files alone would suggest), queried the **live**
schema directly: `npx supabase db query --linked "<sql>"` against
`pg_policies`/`pg_proc`/`information_schema`. This caught a real trap a
file-only approach would have missed — a legacy `bills` table (fully
superseded by `bills_v2`, 0 rows) still had 3 live policies calling
`has_role()`, which would have made a plain `DROP FUNCTION` fail
mid-migration. Ended up with an exact, verified list of every dependent
object (1 function, 5 policies) instead of guessing.

**What changed**:
- `supabase/migrations/20260812150000_retire_bazar_contributor_promote_super_admin.sql`
  — deletes all `bazar_contributor` rows; runs the original May 12
  backfill pattern now that a real admin exists (promotes Alvee to
  `super_admin`, drops her now-redundant `admin` row); swaps the
  `app_role` enum to `member`/`admin`/`super_admin` only; drops and
  rebuilds `has_role(uuid, app_role)` and the 5 dependent policies
  (`Admin delete/insert/update bills`, `Roles delete/insert tiered`)
  against the new type, verbatim, no logic changes. The tiered grant
  policy (`WHEN 'admin' THEN has_role(..., 'super_admin')`) and the
  `prevent_last_super_admin_delete` trigger already fully satisfied "only
  super admin can grant/revoke admin" and "admin can't remove
  super_admin" — nothing new needed there, just confirmed they survive
  the swap.
- Frontend: removed `bazar_contributor` from `AppRole` (`useAuth.tsx`)
  and the hand-maintained `types.ts` enum mirror (no `supabase gen
  types` step in this repo, see Quick orientation above); removed the
  now-always-equal-to-`isAdmin` `isContributor` concept entirely rather
  than leave a vestigial flag; removed the "Bazar contributor" checkbox
  from `Members.tsx` (the "Admin" checkbox and "Make super admin" button
  stay, already correctly gated behind `isSuperAdmin`); `RoleBadge.tsx`
  lost its contributor entry; `Layout.tsx`'s sidebar now shows "Super
  Admin" distinctly (reusing the label that already existed in
  `RoleBadge.tsx` but was never surfaced in the sidebar) instead of
  collapsing every elevated account down to "Admin".

**Verification**: re-ran the same live introspection queries used during
planning, post-migration — enum is exactly the 3 values; Alvee holds
only `super_admin`; Prosen/Test hold only `member`; zero
`bazar_contributor` rows anywhere; `has_role`'s signature and all 5
rebuilt policies present under the new type. `npx tsc --noEmit` clean
across the whole project. **Not click-tested in the browser this
round** (granting `admin` to a test member as super-admin, confirming a
plain-admin viewer can't see the role UI) — the SQL-level guarantees
(RLS policy + trigger, unchanged logic) and the type-check give high
confidence, but worth a real UI pass next time someone's signed in as
Alvee.

### 2026-08-16 — Full production data wipe ("fresh start"); found + worked around a latent member-delete bug

**Requested**: Alvee asked to erase all mess bookkeeping data for a
fresh start, keeping only the `super_admin` account
(`absaralvee23@gmail.com`) in auth — every other login removed
entirely. Confirmed scope explicitly before running anything given the
blast radius: this is prod, no staging, no undo. Landed on: wipe
Alvee's own `members` row too (not just other members'); leave
`signup_allowlist` untouched so previously-invited emails can still
sign back up; delete both other auth accounts
(`prosenjitsarker22@gmail.com` and `absaralvee7777@gmail.com`, the
latter unclear whether it was Alvee's own test login or a third
party's — deleted anyway per explicit final confirmation).

**Mechanism**: no Supabase CLI was linked and no service-role key was
available locally. `supabase login`'s normal device-code flow needs a
TTY/browser and fails headless (`LegacyLoginMissingTokenError`).
Generated a scoped Supabase personal access token instead (1-hour
expiry, via the dashboard UI since the user was already signed in
there — `npx supabase login --token`), linked the project, wrote the
delete as a real migration file (not a one-off dashboard query, per
the existing "avoid the dashboard SQL editor for anything nontrivial"
gotcha above), pushed with `supabase db push`, then revoked the token
immediately after rather than waiting for it to expire.

**What changed**:
- `supabase/migrations/20260816120000_fresh_start_wipe_data_and_non_super_admin_auth.sql`
  — deletes every row from `bill_items`, `bills_v2`, `bills`,
  `correction_requests`, `member_away_periods`, `meals`, `deposits`,
  `expenses`, `months`, `member_links`, `members`, then
  `auth.users` for every id except Alvee's (cascades to `profiles` /
  `user_roles` / Supabase's own `auth.identities` /
  `auth.sessions` / `auth.refresh_tokens`), then `activity_logs` last
  — deliberately after everything else, so the delete-triggered log
  rows from this same migration don't survive either.

**Bug found along the way**: the first push attempt failed —
`DELETE FROM public.members` hit
`activity_logs_member_id_fkey` (23503). `trg_log_members`'s AFTER
DELETE branch (`log_change()`) sets the log row's `member_id` to the
just-deleted member's own id (`v_member_id := v_entity_id` when
`TG_TABLE_NAME = 'members'`), and that's a **new INSERT** referencing
an id that's already gone — the FK's `ON DELETE SET NULL` only
rewrites *existing* referencing rows, it doesn't help a fresh insert.
Net effect: **deleting any single member through the app today (the
"Admin delete members" RLS policy exists and is presumably reachable
from Settings/Members) would 400 the same way** — this predates this
migration and isn't fixed by it. Worked around it here by wrapping
just the `members` delete in
`ALTER TABLE ... DISABLE/ENABLE TRIGGER trg_log_members`, since we
were wiping `activity_logs` anyway. The real fix (make `log_change()`
skip the self-referential log-insert on a `members` DELETE, or insert
with `member_id := NULL` in that one case) is still open — worth
doing before anyone next removes a member from the UI.

**Verification**: row counts on every listed table are 0;
`signup_allowlist` still has its 2 rows; `auth.users` has exactly one
row (Alvee, role `super_admin`). Not click-tested in the browser (no
data left to click through) — verified entirely via
`npx supabase db query --linked` against the live database.

### 2026-08-16 — Fixed the member-delete trigger crash found above

**Requested**: fix the `log_change()` / `trg_log_members` bug the
fresh-start wipe surfaced (previous entry) — deleting any `members` row
was 400ing in production, not just during that migration.

**What changed**:
- `supabase/migrations/20260816130000_fix_log_change_members_delete_fk.sql`
  — `CREATE OR REPLACE FUNCTION public.log_change()`, one condition
  changed. The self-referential "for whom" fallback
  (`v_member_id := v_entity_id` when `TG_TABLE_NAME = 'members'` and
  the generic member_id-from-JSON lookup came back NULL, since
  `members` has no `member_id` column) now only applies when
  `TG_OP <> 'DELETE'`. On a members DELETE, `v_member_id` stays NULL
  instead of pointing at the row that AFTER-trigger timing means is
  already gone — which was the exact FK violation
  (`activity_logs_member_id_fkey`, 23503) from the previous entry.
  INSERT/UPDATE behavior on `members` is unchanged (still tags the log
  row with its own id).

**Verification**: pushed via `supabase db push` (needed a fresh
personal access token — the one from the previous entry was revoked
right after that migration, as intended, and using a Supabase access
token always kills the CLI's login session too, not just future API
calls, so re-auth was needed here from scratch). Then, against
production directly: inserted a throwaway member, confirmed its
`created` log row got `member_id` = its own id; updated it, confirmed
`updated` got the same; deleted it — **no FK error**, confirming the
fix — and confirmed the `deleted` row itself has `member_id` NULL by
design. Separately noticed the earlier `created`/`updated` rows'
`member_id` also went NULL after the delete — that's the *existing*
`activity_logs.member_id ... ON DELETE SET NULL` FK clause doing its
documented job once the referenced member is gone, not a side effect
of this fix. Deleted the test member + its now-orphaned log rows
afterward so production stayed at the fresh-start's zero-rows
baseline. Not click-tested via the Settings/Members UI in the browser
— verified at the SQL level directly, same as the fresh-start
migration.

### 2026-09-03 — Added the Maid (housekeeper) feature: profile, attendance calendar, cost tracking

**Requested**: a new "Maid" feature — a profile (name, phone, monthly
rent, per-visit rate, visits/day), a Meals-style attendance calendar,
and a month summary panel — visible to every signed-in member, but
writable only by admin/super_admin, with **no** approval workflow
(writes apply immediately, same shape as editing a member's profile).
Explicit naming split: every user-facing string says "Maid"; every
internal identifier (table/column/component/hook names) stays
"housekeeper" for code consistency. Scoped as additive-only — the only
existing-file touches allowed were the minimal route/nav registration
lines.

Planned via a written Step-0 plan (patterns to copy, exact migration
SQL, exact file list) confirmed with the user before any code was
written, per explicit instruction.

**What changed**:
- `supabase/migrations/20260903120000_add_housekeeper_maid_attendance.sql`
  (new) — `housekeeper` and `housekeeper_attendance` tables. RLS:
  `SELECT` open to `authenticated`; `INSERT`/`UPDATE`/`DELETE` gated on
  `is_admin_or_super()` — the current canonical role-check helper (not
  the older `has_role`, which is still used in a few untouched legacy
  policies but isn't what new code should reach for). Same trigger
  machinery as every other table: `trg_log_*` → `log_change()` for
  Transparency (already fully generic — needed zero changes to pick up
  the new tables), `update_updated_at_column()` for `updated_at`. A
  small dedicated trigger, `set_housekeeper_attendance_marked_by()`,
  stamps `marked_by` server-side rather than trusting the client
  payload — same intent as `member_away_periods.created_by` /
  `deposits.submitted_by`.
- `src/hooks/useHousekeeper.ts` (new) — `useHousekeeper()` /
  `useHousekeeperAttendance()`, the same plain-`useQuery` shape as
  `useMembers`/`useMonthData` (query key array, no dedicated mutation
  hooks — this codebase does writes inline in the page component
  everywhere, e.g. `Meals.tsx`/`Members.tsx`, so `Maid.tsx` follows
  that instead of inventing a mutation-hook pattern that doesn't exist
  elsewhere here).
- `src/pages/Maid.tsx` (new) — profile card (read-only render for
  members; edit dialog gated behind `isAdmin` for admin/super_admin),
  a Meals-style compact calendar grid (two small present/absent
  indicators + that day's calculated cost per cell), month summary
  tiles. Non-admins render a plain `<div>` cell with zero tap
  affordance for calendar days — not a disabled `<button>` — per the
  explicit "not just hidden, not rendered" requirement.
- `src/App.tsx` / `src/components/Layout.tsx` — one route line and one
  nav-entry line each (new `SprayCan` icon import), same
  no-role-gating visibility as the Transparency link.
- `src/integrations/supabase/types.ts` — hand-added the
  `housekeeper`/`housekeeper_attendance` Row/Insert/Update blocks.
  Flagged to the user before doing it: this file is hand-maintained in
  this repo (no `supabase gen types` step, see Quick orientation
  above), so every future schema change to these two tables needs the
  same manual sync or the app typechecks against a stale schema.

**Deviations from the original ask, confirmed with the user first**:
the codebase has no actual React-Hook-Form usage anywhere despite it
being an installed dependency (`Members.tsx`, the closest analog to
the new Add/Edit form, uses plain `useState` + Zod `.safeParse()` on
submit) — followed that real pattern instead of introducing RHF net-
new. The theme's actual corner radius is `--radius: 0.75rem` (~12px,
via `rounded-lg`/`md`/`sm`), not the 4px originally assumed in the
request — used the real token throughout instead.

**Verification**: `npx tsc --noEmit` clean. `npm run lint` clean on
every touched/new file (the repo has ~74 pre-existing
`@typescript-eslint/no-explicit-any` errors scattered across
`Meals.tsx`/`Members.tsx`/`Deposits.tsx`/etc. that predate this work —
confirmed those aren't new, and fixed the 3 the same pattern would
have added in `Maid.tsx` to zero rather than matching the
pre-existing baseline). `npm run build` succeeds. **Migrations were
not pushed to production during this session** — pushing is a
separate, explicit-confirmation step on this no-staging prod database,
and the user hadn't said "go ahead" on that specific action yet. See
the next entry for what that caused.

### 2026-09-03 — Maid: per-visit became a calculated value; added a live Payable Amount card; found + explained why the page loaded slowly

**Requested**: two follow-ups to the just-written Maid feature, scoped
explicitly to Maid-only files (migrations, `Maid.tsx`, the housekeeper
hooks, the Add/Edit form + schema — "do not touch any other page,
table, hook, or the Dashboard"): (1) stop storing `per_visit_amount`
and always calculate it as `monthly_rent ÷ (visits_per_day ×
days_in_month)`; (2) add a real-time "Payable Amount" card (payable so
far this month, plus a projected full-month total while the current
month is still open) built on that same calculation.

**What changed**:
- `supabase/migrations/20260903130000_drop_housekeeper_per_visit_amount.sql`
  (new — the original migration file was left untouched, per explicit
  instruction) — drops `housekeeper.per_visit_amount`.
- `calculatePerVisitAmount(monthlyRent, visitsPerDay, date)` added to
  `useHousekeeper.ts` (using date-fns's `getDaysInMonth`, already a
  project dependency and already used by `Dashboard.tsx`) — placed
  there rather than in `lib/mess.ts` (home of the other shared
  formatter, `fmtMoney`) specifically because `lib/mess.ts` is shared
  by six other pages and wasn't on this task's allowed-touch list;
  `useHousekeeper.ts` was the one location satisfying both "put it
  near the currency formatter or the housekeeper hooks" and "touch
  only Maid-related files." Every consumer — profile card, calendar
  day cost, month summary, the form's live preview, and the new
  Payable Amount card — now calls through this one helper; no
  duplicated formula anywhere.
- `Maid.tsx` — Add/Edit form's "Per visit" input and its Zod field
  removed entirely; a live read-only preview line under "Visits per
  day" recalculates on every keystroke (plain derived JSX from `form`
  state, no extra state needed). New Payable Amount card added between
  the month-summary tiles and the calendar, reusing the exact
  `Card`/icon-box classes already in the file (no new CSS) —
  identical and read-only for every role, no `isAdmin` gating. It
  derives its numbers from the same `useHousekeeper`/
  `useHousekeeperAttendance` query data already powering the calendar,
  so it updates the instant the existing `qc.invalidateQueries` calls
  fire on an attendance toggle or a profile save — no new fetch, no
  manual refresh.
- `types.ts` — removed `per_visit_amount` from the `housekeeper`
  Row/Insert/Update blocks (same manual-sync note as the previous
  entry).

**Bug found while investigating a "why is Maid slow" report**: the
page always eventually rendered (the empty "No maid profile yet."
state), just noticeably slower than every other menu item. Read the
Network panel via browser automation and found `GET
.../rest/v1/housekeeper` returning **404** — because both migrations
above (this one and the previous entry's) were still sitting
local-only. They'd been written and fully verified
(`tsc`/lint/build) but never actually `supabase db push`-ed to the
live `rffravoqowkcjtcgimhj` project — pushing had been flagged as a
separate explicit-confirmation step both times and the user hadn't
said go-ahead on that specific action until this session.
`QueryClientProvider` in `App.tsx` uses TanStack Query's un-overridden
defaults (`retry: 3`, exponential backoff), so every failed
`housekeeper` fetch retried three times (~1s/2s/4s) before giving up
and falling through to the empty state — exactly the "not broken, just
slow" symptom reported. Not a code bug in the Maid feature itself;
root cause and fix were entirely about deployment state, not logic.

**Verification**: `npx tsc --noEmit`, `npm run lint` (touched files),
`npm run build` all clean. Hand-verified the formula in isolation:
৳3000 rent ÷ (2 visits × 30 days) = ৳50/visit; 30 days of full
attendance sums back to exactly ৳3000 = the input rent, confirming the
invariant. Confirmed the 404 directly against the live project via the
browser's Network panel (not guessed from reading code). Both
migrations above were pushed to production in this same session once
the user confirmed — see the data-wipe/fix entries above for the
established push mechanism (fresh personal access token via
`supabase login --token`, `supabase db push`, revoke after). Post-push
confirmed via direct query that both tables exist with the intended
shape and `per_visit_amount` is gone; **not separately click-tested
end-to-end in the browser this round** (no fresh screenshot taken
after the push) — verified at the SQL/schema level, same standing gap
as several earlier entries above where no live UI pass was done in the
same session as the push.
