# MessPilot — Implementation Prompt for Claude Code

**How to use this:** Paste this entire file as your first message to Claude Code in this repo, on a fresh branch off `main`. It assumes Claude Code has full repo access and can read the existing schema, migrations, and components before touching anything.

---

## Context for Claude Code

This is a **live, production** app — real households use it to track real money. The file `MESSPILOT_PRD.md` (or wherever the PRD lives in this repo) describes the app *as it currently ships*, not aspirationally. Treat it as ground truth for existing behavior.

Stack: React 18 + TypeScript + Vite, Tailwind + shadcn/ui (Radix), TanStack Query, React Router, React Hook Form + Zod, Sonner. Backend: Supabase (Postgres + RLS, Supabase Auth/GoTrue, one Deno Edge Function `signup-allowlisted`). Schema lives in versioned SQL migrations under `supabase/migrations`.

Core invariants — do not break these while adding anything below:

- **RLS is the real security boundary**, not UI role-gating. Every new table or column needs RLS policies before it ships, reusing `has_role`, `is_admin_or_super`, `is_month_closed`, `current_member_id`, `user_owns_bill_item`, `bill_is_utility` where they fit, and adding new helper functions in the same style if they don't.
- **Every state-changing action writes to `activity_logs`.** The Transparency page's claim — "nobody can edit or delete past entries" — has to stay true for every feature you add, including the new ones below.
- **Non-admin submissions that touch money default to `pending`.** Nothing a member submits silently becomes truth without an admin action, unless a feature below explicitly changes that (see Feature 9, which does this deliberately and only within a configured threshold).
- **Once a month is closed, meals/deposits/bazar are read-only.** New features must respect `is_month_closed` the same way existing ones do.

## Working protocol

1. **Read before you write.** Before starting each feature, read the relevant existing tables, RLS policies, and the pages/components it touches. Don't assume — check.
2. **One feature, one branch, one PR.** Don't bundle features into a single commit or PR. Use branch names like `feat/settle-up-view`. Push to GitHub and open a PR per feature so each is independently reviewable and revertible.
3. **Migrations are additive and numbered to follow the existing sequence.** Never edit a past migration file. If a feature needs a schema change, write a new migration.
4. **After each feature**, give me a short summary: what changed, any new env vars or manual Supabase dashboard steps, and what to manually test before merging.
5. **If a feature conflicts with an existing pattern** (naming, state machine shape, RLS style), match the existing pattern rather than introducing a new convention — flag the tension to me instead of silently deciding.
6. **Stop and ask** if a feature's scope turns out to be materially bigger than described below (e.g., it implies a new role, a payment integration, or a breaking schema change to a table other features depend on).

Work through the phases in order. Within a phase, order doesn't matter much — pick what's cleanest to ship first.

---

## Phase 1 — Reduce admin bottleneck & friction (do these first)

### 1.1 Remove portal-gated sign-in
**Problem:** The Admin/Member portal picker on `/auth` is UX friction with no real security value — RLS is the actual boundary, per the PRD itself.
**Goal:** Single sign-in flow. After auth, route the user based on their actual roles (from `user_roles`), not a pre-auth guess.
**Acceptance criteria:**
- No portal selector on the sign-in screen.
- Post-login routing sends admins/super_admins to admin-visible views and members to member views, without a "wrong portal" error state.
- Existing RLS policies are untouched — this is a routing/UI change only.

### 1.2 Self-serve edit window for own meal entries
**Problem:** Trivial fixes ("forgot to log Tuesday") go through the full correction-request → admin-review cycle, overloading the admin queue.
**Goal:** Let a member directly edit their own `meals` rows within a configurable window (default 48 hours from the entry's date) without a correction request — but still write to `activity_logs`.
**Acceptance criteria:**
- New RLS policy allows a member to `UPDATE` their own `meals` row only where `now() - date < window` and the month isn't closed.
- Edits outside the window still require a correction request as today.
- Every direct edit logs to `activity_logs` with actor, old value, new value.
- Window length is a settings value an admin can change (new column or row in an existing settings/config table — check if one exists before creating a new table).

### 1.3 Wire the four dashboard placeholder KPIs to real data
**Problem:** "Bills unpaid," "Rent collected," "Rent due," "Active agreements" are hardcoded "Coming soon" tiles even though `bills_v2` / `bill_items` already has the data for the first three.
**Goal:** Replace placeholders for Bills unpaid, Rent collected, Rent due with live queries against `bills_v2`/`bill_items`.
**Acceptance criteria:**
- Three of the four tiles show real, correctly-scoped numbers (admin sees mess-wide totals; member sees their own share where applicable, per existing per-member scoping elsewhere in Bills).
- "Active agreements" stays a placeholder — flag it back to me with a one-line note on what data model it would need, since the PRD doesn't define what an "agreement" is yet. Don't invent a concept for it.

### 1.4 Retire or merge `/expenses` into `/bazar`
**Problem:** `/expenses` is a dead duplicate of `/bazar` with no approval workflow and no nav entry.
**Goal:** Confirm it's genuinely unused (check for any inbound links, references, or data uniquely written there), then remove the route/page and, if it has its own table, migrate any data into `expenses`/bazar's existing flow before dropping it. If in doubt about live data, merge rather than delete.
**Acceptance criteria:**
- No orphaned route, page, or nav entry remains.
- No data loss — confirm row counts before/after if a table is dropped or merged.

### 1.5 In-app notifications for pending approvals
**Problem:** Nothing surfaces a pending deposit/bazar/correction to an admin, or a resolution to a member, outside of visiting the app. This is the single biggest lever on the admin-bottleneck problem, so it's worth pulling forward from the PRD's "V1 polish" bucket rather than waiting.
**Goal:** In-app only (no push/SMS/WhatsApp — that's still out of scope). A notifications table or a derived "unread" count, surfaced as a badge in the nav, that covers: new pending deposit/bazar/correction (→ admins), and approval/rejection of a member's own submission (→ that member).
**Acceptance criteria:**
- Badge count updates in near-real-time (Supabase realtime subscription or TanStack Query polling — match whatever pattern, if any, is already used elsewhere in the app).
- Clicking a notification deep-links to the relevant filtered queue, consistent with how the Dashboard's existing alert cards already do this.
- Notifications are per-user and marked read on view.

---

## Phase 2 — Trust and settlement (the actual "next-gen" differentiators)

### 2.1 Receipt photo on bazar entries
**Problem:** Bazar entries are trust-me claims with no evidence. This is the biggest real gap between "we log spend" and "we can prove spend."
**Goal:** Optional (not required, to avoid blocking submission) photo upload on bazar entry, stored in Supabase Storage, linked to the `expenses` row.
**Acceptance criteria:**
- New Storage bucket with RLS scoped so only the submitter and admins can upload/view a given entry's receipt.
- Bazar review UI (admin approve/reject) shows the receipt inline if present.
- Missing receipt doesn't block submission or approval — it's a trust signal, not a gate.

### 2.2 Settle-up / debt-simplification view
**Problem:** The app tracks individual balances but never answers the question everyone actually has at month-end: who pays whom, and how do we clear this with the fewest transfers.
**Goal:** New view (could live on Report or as its own page) that takes current member balances and computes a minimal set of settling transactions (standard debt-simplification / greedy-matching algorithm — net creditors paid by net debtors).
**Acceptance criteria:**
- Given member balances, output a list of `{from_member, to_member, amount}` that fully settles all balances to zero with the minimum number of transactions.
- Each suggested transfer has a "mark settled" action; marking it settled should create a `deposits` (or equivalent) entry so it flows back into the real ledger rather than living outside it, and logs to `activity_logs`.
- This is a read/compute view over existing data — it should not require restructuring `deposits` or `expenses`.

### 2.3 Shareable month-end report card
**Problem:** The Report page's only export is `window.print()`. Month-end is the one moment the whole household looks at the number together, usually to paste into WhatsApp — the product's own PRD says WhatsApp is where messes currently live.
**Goal:** A generated, shareable image (PNG) or PDF summarizing the month — meal rate, total expense, member-wise settle list — designed to be screenshotted/shared, not just printed.
**Acceptance criteria:**
- One-click "Share" or "Download" button on `/report` generates the artifact client-side (e.g., render a styled component to canvas/image) or via a lightweight server render — pick whichever fits the existing stack with the least new infra.
- Content matches the existing Report page's numbers exactly (same source queries, no separate calculation path that could drift).
- No PDF library or service should require credentials/config beyond what's already in the repo's env setup — if it does, stop and tell me before adding new paid infra.

---

## Phase 3 — Scale & foresight (do after 1 and 2 are live and stable)

### 3.1 Auto-approve deposits under a threshold
**Problem:** Every deposit — even a routine, small, trusted one — sits in an admin's queue. This doesn't scale past a small mess.
**Goal:** Admin-configurable per-mess threshold (amount and/or "trusted member" flag). Deposits under the threshold from a flagged member auto-approve instead of sitting pending.
**Acceptance criteria:**
- Threshold and trusted-member flag are admin-editable settings.
- Auto-approved deposits still log to `activity_logs` with an `auto_approved: true` marker so the audit trail distinguishes them from admin-approved ones — the trust guarantee must stay intact.
- This must be opt-in and off by default — don't silently change existing mess behavior.

### 3.2 Queue claiming for admin teams
**Problem:** With more than one admin, two people can review the same pending item at once.
**Goal:** "Claim" action on a pending deposit/bazar/correction that marks it as being reviewed by a specific admin, visible to other admins, with a timeout/release if left unresolved.
**Acceptance criteria:**
- Claimed items show who claimed them to other admins.
- Claim auto-releases after a reasonable timeout (e.g., 15–30 min) so a distracted admin doesn't block the queue.

### 3.3 Live meal-rate projection
**Problem:** Members only learn the meal rate moved after it already has. No forward visibility.
**Goal:** On the Dashboard, alongside the live current rate, show a simple projected end-of-month rate based on spend pace so far (e.g., `current_bazar / days_elapsed * days_in_month / projected_total_meals`, or a simpler linear extrapolation — pick the simplest honest projection, don't over-engineer this).
**Acceptance criteria:**
- Clearly labeled as a projection/estimate, visually distinct from the live actual rate, so members don't mistake one for the other.
- Optional: admin-set soft budget with a visual nudge (not a hard block) when projected spend trends over it.

### 3.4 Guest / one-off meal tracking
**Problem:** Shared housing regularly has guest meals with nowhere to log them today.
**Goal:** A lightweight way to log a guest meal against a hosting member (counts toward total meals for rate purposes, but is attributable/reportable separately from that member's own meal count).
**Acceptance criteria:**
- Guest meals affect `meal_rate` denominator correctly.
- Reports can distinguish "member's own meals" from "meals hosted for guests" without changing the core `meals` table's existing semantics for other features (check corrections/edit-window logic still works correctly against whichever table this ends up in).

### 3.5 Trend charts (3-month meal-rate history)
**Problem:** Only single-month KPI tiles exist anywhere in the product — no sense of trend.
**Goal:** Simple line chart on Dashboard or Report showing meal rate (and optionally total expense) over the last 3–6 closed months, pulled from the `months` snapshot table.
**Acceptance criteria:**
- Reads only from already-closed months' snapshot data (`months` table) — no need to recompute historical rates live.
- Gracefully handles a mess with fewer than 3 closed months of history.

---

## Deliverable format per feature

For each feature, before merging, give me:
1. What changed (files, migrations, new RLS policies)
2. Any manual step I need to take (run a migration, set a new env var, create a Storage bucket in the dashboard, etc.)
3. What to manually test before I approve the PR
