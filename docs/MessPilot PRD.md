# MessPilot — Product Requirements Document

**Status:** Live · MVP in production
**Document version:** 1.1 — as-built
**Prepared:** 11 Aug 2026
**Stack:** React + Supabase

---

## Contents

1. [Overview & problem](#1-overview--problem)
2. [Goals & non-goals](#2-goals--non-goals)
3. [Users & roles](#3-users--roles)
4. [Core business logic](#4-core-business-logic)
5. [Feature specification](#5-feature-specification)
6. [Data model](#6-data-model)
7. [Approval workflows](#7-approval-workflows)
8. [Technical architecture](#8-technical-architecture)
9. [Branding](#9-branding)
10. [Non-functional requirements](#10-non-functional-requirements)
11. [Known gaps](#11-known-gaps)
12. [Roadmap](#12-roadmap)
13. [Glossary](#13-glossary)

---

## 1. Overview & problem

A **mess** — a household of bachelors or students sharing meals and expenses — usually runs its finances on a spreadsheet and a WhatsApp group. MessPilot replaces that with one mobile-first app: every meal, deposit, grocery run, and bill lives in a shared ledger that recalculates itself.

Left to spreadsheets and group chats, mess accounting breaks down in predictable ways: someone miscounts a week of meals, an expense gets logged twice or not at all, and at month's end nobody can reconstruct how the final number was reached. MessPilot fixes this by making the meal rate a *live, derived value* rather than something calculated by hand once a month, and by keeping a permanent record of who changed what.

The product is built for one mess at a time — a single admin (or small admin team) running the household's books, with members who log their own meals and submit their own money in, everything visible to everyone.

## 2. Goals & non-goals

### Goals

- Replace spreadsheet + WhatsApp mess accounting with one shared, always-current ledger.
- Give every member real-time visibility into the meal rate and their own balance — no waiting for month-end.
- Let members submit money-affecting entries (deposits, bazar, bill payments) without an admin needing to be present, while keeping an admin as the final approver before anything counts.
- Make every change auditable: an append-only activity log any member can read.
- Let members self-serve corrections (a missed meal, a trip home) instead of pinging the admin directly — while keeping an admin in the loop before any entry becomes final.

### Non-goals — current version

- **Multi-mess support.** One deployment serves one household; there is no tenant boundary between messes.
- **Push, SMS, or WhatsApp notifications.** Members must open the app to see pending items.
- **PDF export.** The Report page offers browser print only.
- **Payment processing.** bKash / Nagad / bank / cash are logged as a *method* field, not integrated payment rails — money still changes hands outside the app.

## 3. Users & roles

Every signed-in account is linked **1:1 to a member record** (`member_links`) — that link, not the role, is what ties meals, deposits, and balances to a person. Roles then layer permissions on top; a single account can hold more than one.

| Role | Who they are |
|---|---|
| `super_admin` | The mess owner account. Everything an admin can do, plus granting or revoking `admin` — the only role that can. |
| `admin` | Manages members, reviews and approves deposits/bazar/bill payments/corrections, closes and reopens the month, and maintains the signup allowlist. Granted only by a super admin, so the mess can keep running day-to-day if the super admin is away. Cannot grant, revoke, or remove `admin` or `super_admin` itself. |
| `member` (default) | Logs their own meals, submits their own deposits and bazar purchases, requests corrections, and reads reports and the transparency log. |

**Single sign-in flow.** There is one sign-in form — no Admin/Member portal picker. After authenticating, the app reads the account's real roles from `user_roles` and adjusts what's visible accordingly; there's no separate "wrong portal" state to hit. Enforcement lives entirely in the database's row-level security functions (`has_role`, `is_admin_or_super`) — the UI never gates anything RLS wouldn't already gate.

## 4. Core business logic

### 4.1 Meal rate

Recomputed live, for the currently open month, every time a meal or an approved bazar entry changes:

```
meal_rate = total_approved_bazar_expense ÷ total_approved_meals
```

### 4.2 Member balance

```
balance = approved_deposits − (member_meal_count × meal_rate)
```

Positive reads as an **advance** (the member is owed / ahead); negative reads as a **due** (the member owes the mess).

### 4.3 Utility bill split

```
per_member_share = bill_total ÷ count(active_members)
```

Rounded to 2 decimals, one `bill_item` per active member.

### 4.4 Rent bill

One `bill_item` per member, amount defaulting to that member's configured `rent_amount` but editable per bill at creation time.

### 4.5 Month close

An admin action that snapshots `total_expense`, `total_meals`, and `final_meal_rate` onto the `months` table and marks it closed. While closed, meals, deposits, and bazar entries become read-only across the app. Closing is blocked while any meal entry for that month is still `pending` — admin has to approve or reject everything first. Reopening clears the closed flag; the snapshot values remain until the next close.

## 5. Feature specification

### 5.1 Authentication & access — `/auth`

- Email + password via Supabase Auth, single sign-in/sign-up form (no portal picker — see §3).
- Signup is **allowlist-gated**: an admin adds an email under Settings before that person can register. The one exception is the very first account ever created, which auto-bootstraps as admin.
- Signup runs through a dedicated Edge Function (`signup-allowlisted`) that creates the user pre-confirmed with the service-role key — this deliberately bypasses Supabase Auth's confirmation-email flow so approved members are never blocked by its rate limit.

### 5.2 Dashboard — `/`

- Greeting/status hero banner: time-of-day greeting with the signed-in user's display name, a headline that reads "You're all caught up" or switches to "N items need your review" for admins with open bazar/correction queues, and the day's context line (day-of-month, month-to-date bazar, meals logged today).
- Hero banner also carries the primary actions — a "Review approvals" button (admin-only, deep-links into the pending bazar queue) and "View analytics" (links to Report) — alongside a live meal-rate panel showing the current rate, a Live rate/Final rate badge, and four mini-stats (meals, bazar MTD, net due, day of month).
- For admins: alert cards above the hero for pending bazar review and open correction requests, linking straight into the filtered queue.
- Quick-action row: Add meal / Add deposit / Submit bazar (admin), Activity link.
- KPI tiles: total bazar, total deposits, total meals, net advance/due.
- Per-member settlement list and the last 6 transparency-log entries.
- Four placeholder KPI tiles (Bills unpaid, Rent collected, Rent due, Active agreements) marked "Coming soon" — see §11.

### 5.3 Members — `/members`

- Admin: add / edit / deactivate / delete a member (name, phone, room, seat or bed label, monthly rent).
- Admin: link a member record to a signed-up account (1:1) and unlink it.
- Super admin: grant or revoke `admin` per member, and hand off `super_admin` (behind a confirmation dialog). Only a super admin can grant, revoke, or remove `admin`/`super_admin` — a plain admin has no role-management UI at all.
- Everyone: a per-member card showing this month's meals, deposits, bazar contributed, and utility due — visible mess-wide by design.

### 5.4 Meals — `/meals`

- Compact calendar grid for the month; tap a day to set that member's meal count in 0.5 increments, with 0–3 quick-set buttons. Members edit only their own linked meals; admins can select and edit any member.
- **Every non-admin write defaults to pending.** Logging a new day and editing or clearing an existing one both write directly to `meals` — there's no "first entry vs. edit" distinction anymore. A database trigger (`enforce_meal_submission`) forces the row's `status` to `pending` for anyone who isn't an admin; a member can keep changing the value freely while it's pending, and again after a rejection. The calendar shows a "pending" or "rejected" badge with the current count.
- **Pending entries don't count.** The meal rate and every member's total only include `approved` rows — a pending or rejected entry is invisible to billing until an admin acts on it.
- **Admin writes are self-approved.** The same trigger auto-approves and stamps `reviewed_by` / `reviewed_at` on any admin write, so admin's normal Save both records and approves the entry in one action — there's no separate "Approve" button. Admin instead gets an inline **Reject** action on pending days.
- **Once approved, a member can't touch it again.** RLS scopes the member update/delete policies to rows with `status IN ('pending', 'rejected')` — an approved row has no member-writable path at all; only admin retains unrestricted access, enforced at the database level regardless of what the client sends.
- **Future days are locked for members.** A member can't open the editor for a date after today; admin is unaffected (e.g. to log ahead on someone's behalf).
- Members can also mark themselves away for a date range (auto-approved if fully in the future and the affected months are open; otherwise held for admin review).
- Fully locked once the month is closed; closing itself is blocked while any meal for that month is still pending (see §4.5).

### 5.5 Deposits — `/deposits`

- Admin records a deposit directly for any member.
- A member submits their own deposit (amount, method — cash / bKash / Nagad / bank / other, date, note); it starts **pending**.
- Admin approves or rejects with an optional note. Only **approved** deposits count toward balance.

### 5.6 Bazar — `/bazar`

- Any signed-in member submits a bazar entry (title, amount, category, date).
- Admin approves or rejects with a note; only approved bazar counts toward the meal rate.
- Non-admin members see only their own submissions; admins see and manage all.

### 5.7 Bills — `/bills`

Rent and utilities, tracked separately from the meal ledger.

- Admin creates rent bills (one per member, pre-filled from that member's rent amount) and utility bills (one total, auto-split equally across active members).
- A member marks their share paid, which flags it **pending review**; admin confirms (**paid**) or reverts it in a dedicated review queue.
- KPI tiles: total rent/utility due, paid vs. unpaid. A member's own view is scoped to their rent share and shared utility bills only.

### 5.8 Corrections — `/corrections`

A member-initiated request queue for anything they can't fix themselves. Meal changes no longer route through here — see §5.4; they're submitted and reviewed directly on the Meals calendar. (Meal requests submitted before that change may still appear here for historical review.)

1. **Member requests** — mark themselves away / back (inactive / active), or describe something else in free text — plus a required reason.
2. **Request lands as open** — visible to the requester and every admin, with the requested change summarized.
3. **Admin resolves it** — *Approve & apply* (for active-status requests, and legacy meal requests, the system applies the change immediately via the `apply_correction` database function), *Approve (manual)* (for anything the system can't apply automatically), or *Reject* (with an optional note). Every outcome is logged.

### 5.9 Transparency — `/transparency`

- A read-only, paginated, filterable feed of every `activity_logs` entry, visible to every signed-in member and not just admins — filter by entity type or action, or free-text search across actor, affected member, or content.
- Each entry shows who acted and what changed; where the row has a natural target (a meal, deposit, correction, or the member record itself), a "for [Member]" badge names who it was for.
- Positioned in-product as the trust guarantee: *"Nobody can edit or delete past entries."*

### 5.10 Report — `/report`

- Monthly summary: expense, deposits, meals, meal rate, plus rent/utility collected vs. unpaid.
- Full member-wise breakdown (meals, cost, deposits, rent due, utility due, balance) with a totals row.
- Browser print button only — no PDF export (see §11).

### 5.11 Settings — `/settings`

- Account info and role badge.
- Month close / reopen control (admin-only), with a live-rate preview before committing.
- Signup allowlist management (admin-only) — the same list the signup Edge Function checks against.

### 5.12 Maid — `/maid`

- Tracks the mess's maid: a profile plus a daily attendance calendar. Visible to every signed-in member; only admin/super_admin can edit anything — enforced at the RLS level, not just hidden in the UI.
- **Profile card**: name, phone (tap-to-call), monthly rent, visits per day, active/inactive toggle. There is no manually-entered "per visit" rate — it's always calculated as `monthly_rent ÷ (visits_per_day × days_in_month)`, so it's automatically correct for any month without a rent-history mechanism.
- **Attendance calendar**: the same compact month-grid pattern as Meals. Each day shows two visit indicators (present/absent) and that day's calculated cost. Admin taps a day to toggle either visit; the write applies immediately — unlike meals/deposits/bazar, there's no pending/approval step. Non-admins see the identical grid fully read-only, with no tap affordance rendered at all.
- **Month summary**: total visits present, total visits absent, and total cost for the viewed month.
- **Payable Amount card**: "Payable so far" (cost through today, or the full month when viewing a past month) and — only while viewing the current, still-open month — a "Projected full month" figure assuming full attendance for the remaining days, plus a caption showing the per-visit math. Read-only and identical for every role; recalculates instantly as attendance is toggled or the profile is edited, no manual refresh.

## 6. Data model

Sixteen tables in the `public` schema, backing the features above.

| Table | Purpose | Key fields |
|---|---|---|
| `members` | The household roster | `name, phone, room, seat_name, rent_amount, is_active` |
| `member_links` | 1:1 link between a member and a login | `member_id, user_id` |
| `user_roles` | Role grants, many per user | `user_id, role` |
| `meals` | Daily meal count per member | `member_id, date, meal_count, status, reviewed_by, reviewed_at` |
| `deposits` | Money members put in | `member_id, amount, method, status, submitted_by` |
| `expenses` | Bazar / shared spend | `title, amount, category, status, submitted_by` |
| `bills_v2` | A rent or utility bill | `bill_type, title, total_amount, due_date, due_month` |
| `bill_items` | One member's share of a bill | `bill_id, member_id, amount, status, paid_on` |
| `correction_requests` | Member fix requests (away/back, free-text; legacy meal edits) | `entity_type, requested_value, status, reason` |
| `member_away_periods` | Member-declared away date ranges | `member_id, start_date, end_date, status` |
| `months` | Per-month close snapshot | `month, is_closed, final_meal_rate, total_expense` |
| `signup_allowlist` | Emails permitted to register | `email, note, created_by` |
| `activity_logs` | Append-only audit trail | `action, entity_type, actor_email, member_id, diff, month` |
| `profiles` | Display name per user | `user_id, display_name` |
| `housekeeper` | The maid's profile | `name, phone, monthly_rent, visits_per_day, is_active` |
| `housekeeper_attendance` | Daily attendance, per visit | `housekeeper_id, date, visit_1_present, visit_2_present, marked_by` |

Access control is enforced in Postgres via row-level security, backed by helper functions: `has_role`, `is_admin_or_super`, `is_month_closed`, `current_member_id`, `user_owns_bill_item`, `bill_is_utility`, `enforce_meal_submission` for the meal pending/approve trigger, and `apply_correction` for the corrections auto-apply path. Thirty-six versioned SQL migrations under `supabase/migrations` define this schema today.

## 7. Approval workflows

Every entry that moves money, or that changes what a member is credited for, follows the same shape: a non-admin submission starts *pending* and only counts once an admin acts on it. Admin-entered records are always recorded directly, self-approved.

| Entity | Who can submit | States | Once approved |
|---|---|---|---|
| Deposit | Member (own), Admin (any) | `pending → approved / rejected` | Counts toward that member's balance |
| Bazar / expense | Member (own), Admin (any) | `pending → approved / rejected` | Counts toward the month's meal rate |
| Bill payment | Member (own share) | `unpaid → pending_review → paid / unpaid` | Share marked settled with a paid date |
| Meal entry (any day, new or edited) | Member (own), Admin (any) | `pending → approved / rejected`, directly on the `meals` row; member can keep editing while `pending`/`rejected` | Counts toward meals/rate; locked from further member edits |
| Correction request (away/back, other) | Member (own record) | `open → approved / rejected` | Active status updated, if auto-applied |

## 8. Technical architecture

**Frontend.** React 18 + TypeScript on Vite. Tailwind CSS with shadcn/ui (Radix primitives) for the component layer. TanStack Query for server-state and cache invalidation. React Router for navigation. React Hook Form + Zod for form validation. Sonner for toasts.

**Backend.** Supabase: Postgres with row-level security, Supabase Auth (GoTrue) for email/password sign-in, and one Deno Edge Function (`signup-allowlisted`) for gated, pre-confirmed signup.

**Hosting & config.** Deployed on Vercel. Supabase project id, URL, and anon key are supplied via `VITE_`-prefixed env vars; the project id is also pinned in `supabase/config.toml` for the CLI migration workflow.

**Schema management.** Thirty-six versioned SQL migrations under `supabase/migrations` track every schema change from first principles to the current shape.

## 9. Branding

- **Primary color:** `#F39C13` (orange). **Base/dark surface color:** `#221502` (near-black warm brown) — the app is dark-mode-only, with the full palette (background, card, sidebar, borders) derived from this base hue rather than the earlier blue-slate theme.
- **Logo/icon:** the "Mess pilot" mark (`src/assets/icons/`) — an orange-badged glyph used in the sidebar, mobile header, sign-in screen, and browser favicon. A dark-badged variant exists in the same folder for use on light/orange backgrounds.
- Form fields (`Input`, `Textarea`, `Select`, `InputOTP`) and buttons use a 4px corner radius with a thin (1px) focus ring, deliberately tighter/thinner than shadcn's defaults.

## 10. Non-functional requirements

- **Mobile-first input.** Large tap targets, 1–2 taps to log a meal — the product's own stated usability bar.
- **Currency.** All amounts in Taka (৳), formatted to a maximum of 2 decimals through one shared helper.
- **Default-safe writes.** Non-admin submissions that touch money, or any meal entry a member logs or edits, default to pending; nothing a member submits silently becomes truth without an admin action.
- **Auditability.** State-changing actions are expected to land in `activity_logs` so the Transparency page stays a complete record, with no edit/delete surface exposed for past entries.

## 11. Known gaps

Observed directly in the current codebase — not aspirational, these are real as of this document's date.

- **Duplicate expense entry point.** An `/expenses` route and page exist alongside `/bazar`, covering a slice of the same "log a shared expense" job but with no approval workflow and no entry in the navigation sidebar. Worth retiring or folding into Bazar.
- **Dashboard placeholders.** Four KPI tiles — Bills unpaid, Rent collected, Rent due, Active agreements — are explicit "Coming soon" placeholders, even though the Bills data they'd need already exists in `bills_v2` / `bill_items`. The dashboard just isn't wired to it yet.
- **No way to withdraw a correction request.** `correction_requests` has no delete policy, so once a member submits an away/back or free-text request, only an admin can resolve it; the member can't cancel a request they submitted by mistake. (Meal entries are the exception — a member can freely edit or clear their own pending/rejected meal row up until admin approves it, see §5.4.)
- **No PDF export.** The Report page — the natural "send this to the group" artifact — offers only `window.print()`, not a generated PDF.
- **No notification channel.** Nothing pushes a pending approval, a bill due date, or a correction response to a member outside the app itself — they have to go check.

## 12. Roadmap

1. **Near-term** — Wire the four dashboard placeholders to real Bills data; retire or merge `/expenses` into `/bazar`; let a member withdraw their own open correction request.
2. **V1 polish** — Notifications for pending reviews and bill due dates; sharper, more detailed reports.
3. **V2** — WhatsApp/SMS alerts, PDF export, multi-mess (multi-tenant) support, advanced analytics.

## 13. Glossary

| Term | Meaning |
|---|---|
| **Mess** | A shared household — bachelors or students splitting daily meals and living costs. Common in South Asian shared housing. |
| **Bazar** | The daily or periodic grocery shopping run; also used generically for "shared expense." |
| **Meal rate** | The per-meal cost for the current month, recalculated live as meals and approved bazar change. |
| **Taka (৳)** | Bangladeshi currency — the app's only supported currency. |

---

*MessPilot PRD · v1.1 · Compiled from the shipped codebase, 11 Aug 2026*
