# MessPilot — Product Requirements Document

**Status:** Live · MVP in production
**Document version:** 1.0 — as-built
**Prepared:** 10 Aug 2026
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
9. [Non-functional requirements](#9-non-functional-requirements)
10. [Known gaps](#10-known-gaps)
11. [Roadmap](#11-roadmap)
12. [Glossary](#12-glossary)

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
- Let members self-serve corrections (a missed meal, a trip home) instead of pinging the admin directly.

### Non-goals — current version

- **Multi-mess support.** One deployment serves one household; there is no tenant boundary between messes.
- **Push, SMS, or WhatsApp notifications.** Members must open the app to see pending items.
- **PDF export.** The Report page offers browser print only.
- **Payment processing.** bKash / Nagad / bank / cash are logged as a *method* field, not integrated payment rails — money still changes hands outside the app.

## 3. Users & roles

Every signed-in account is linked **1:1 to a member record** (`member_links`) — that link, not the role, is what ties meals, deposits, and balances to a person. Roles then layer permissions on top; a single account can hold more than one.

| Role | Who they are |
|---|---|
| `super_admin` | The mess owner account. Everything an admin can do, plus granting or revoking `admin` and handing off `super_admin` itself. |
| `admin` | Manages members, reviews and approves deposits/bazar/bill payments, closes and reopens the month, and maintains the signup allowlist. |
| `bazar_contributor` | A trusted member allowed to submit bazar (grocery) purchases for reimbursement. Granted per-member by an admin. |
| `member` (default) | Logs their own meals, submits their own deposits, requests corrections, and reads reports and the transparency log. |

**Portal-gated sign-in.** The sign-in screen makes users pick an Admin or Member portal before authenticating. Signing into the wrong portal for the account's actual role signs them back out with an explanation. This is a UX guardrail to keep roles visibly separate, not the security boundary — that enforcement lives in the database's row-level security functions (`has_role`, `is_admin_or_super`).

## 4. Core business logic

### 4.1 Meal rate

Recomputed live, for the currently open month, every time a meal or an approved bazar entry changes:

```
meal_rate = total_approved_bazar_expense ÷ total_meals_logged
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

An admin action that snapshots `total_expense`, `total_meals`, and `final_meal_rate` onto the `months` table and marks it closed. While closed, meals, deposits, and bazar entries become read-only across the app. Reopening clears the closed flag; the snapshot values remain until the next close.

## 5. Feature specification

### 5.1 Authentication & access — `/auth`

- Email + password via Supabase Auth.
- Signup is **allowlist-gated**: an admin adds an email under Settings before that person can register. The one exception is the very first account ever created, which auto-bootstraps as admin.
- Signup runs through a dedicated Edge Function (`signup-allowlisted`) that creates the user pre-confirmed with the service-role key — this deliberately bypasses Supabase Auth's confirmation-email flow so approved members are never blocked by its rate limit.

### 5.2 Dashboard — `/`

- Live meal-rate hero figure for the current month.
- KPI tiles: total bazar, total deposits, total meals, net advance/due.
- For admins: alert cards for pending bazar review and open correction requests, linking straight into the filtered queue.
- Per-member settlement list and the last 8 transparency-log entries.
- Four placeholder KPI tiles (Bills unpaid, Rent collected, Rent due, Active agreements) marked "Coming soon" — see §10.

### 5.3 Members — `/members`

- Admin: add / edit / deactivate / delete a member (name, phone, room, seat or bed label, monthly rent).
- Admin: link a member record to a signed-up account (1:1) and unlink it.
- Admin: grant or revoke `bazar_contributor` per member; a super admin can additionally grant/revoke `admin` and hand off `super_admin` (behind a confirmation dialog, since it can only be undone by another super admin).
- Everyone: a per-member card showing this month's meals, deposits, bazar contributed, and utility due — visible mess-wide by design.

### 5.4 Meals — `/meals`

- Calendar grid for the month; tap a day to set that member's meal count in 0.5 increments, with 0–3 quick-set buttons.
- Members edit only their own linked meals; admins can select and edit any member.
- Fully locked once the month is closed.

### 5.5 Deposits — `/deposits`

- Admin records a deposit directly for any member.
- A member submits their own deposit (amount, method — cash / bKash / Nagad / bank / other, date, note); it starts **pending**.
- Admin approves or rejects with an optional note. Only **approved** deposits count toward balance.

### 5.6 Bazar — `/bazar`

- Admins and `bazar_contributor` members submit a bazar entry (title, amount, category, date).
- Admin approves or rejects with a note; only approved bazar counts toward the meal rate.
- Non-admin contributors see only their own submissions; admins see and manage all.

### 5.7 Bills — `/bills`

Rent and utilities, tracked separately from the meal ledger.

- Admin creates rent bills (one per member, pre-filled from that member's rent amount) and utility bills (one total, auto-split equally across active members).
- A member marks their share paid, which flags it **pending review**; admin confirms (**paid**) or reverts it in a dedicated review queue.
- KPI tiles: total rent/utility due, paid vs. unpaid. A member's own view is scoped to their rent share and shared utility bills only.

### 5.8 Corrections — `/corrections`

A member-initiated request queue for anything they can't fix themselves.

1. **Member requests** — update a past day's meal count, mark themselves away / back (inactive / active), or describe something else in free text — plus a required reason.
2. **Request lands as open** — visible to the requester and every admin, with the requested change summarized.
3. **Admin resolves it** — *Approve & apply* (for meal or active-status requests, the system applies the change immediately via the `apply_correction` database function), *Approve (manual)* (for anything the system can't apply automatically), or *Reject* (with an optional note). Every outcome is logged.

### 5.9 Transparency — `/transparency`

- A read-only, paginated, filterable feed of every `activity_logs` entry — filter by entity type or action, or free-text search across actor and content.
- Positioned in-product as the trust guarantee: *"Nobody can edit or delete past entries."*

### 5.10 Report — `/report`

- Monthly summary: expense, deposits, meals, meal rate, plus rent/utility collected vs. unpaid.
- Full member-wise breakdown (meals, cost, deposits, rent due, utility due, balance) with a totals row.
- Browser print button only — no PDF export (see §10).

### 5.11 Settings — `/settings`

- Account info and role badge.
- Month close / reopen control (admin-only), with a live-rate preview before committing.
- Signup allowlist management (admin-only) — the same list the signup Edge Function checks against.

## 6. Data model

Eleven+ tables in the `public` schema, backing the features above.

| Table | Purpose | Key fields |
|---|---|---|
| `members` | The household roster | `name, phone, room, seat_name, rent_amount, is_active` |
| `member_links` | 1:1 link between a member and a login | `member_id, user_id` |
| `user_roles` | Role grants, many per user | `user_id, role` |
| `meals` | Daily meal count per member | `member_id, date, meal_count` |
| `deposits` | Money members put in | `member_id, amount, method, status, submitted_by` |
| `expenses` | Bazar / shared spend | `title, amount, category, status, submitted_by` |
| `bills_v2` | A rent or utility bill | `bill_type, title, total_amount, due_date, due_month` |
| `bill_items` | One member's share of a bill | `bill_id, member_id, amount, status, paid_on` |
| `correction_requests` | Member fix requests | `entity_type, requested_value, status, reason` |
| `months` | Per-month close snapshot | `month, is_closed, final_meal_rate, total_expense` |
| `signup_allowlist` | Emails permitted to register | `email, note, created_by` |
| `activity_logs` | Append-only audit trail | `action, entity_type, actor_email, diff, month` |
| `profiles` | Display name per user | `user_id, display_name` |

Access control is enforced in Postgres via row-level security, backed by helper functions: `has_role`, `is_admin_or_super`, `is_month_closed`, `current_member_id`, `user_owns_bill_item`, `bill_is_utility`, and `apply_correction` for the corrections auto-apply path. Twenty-one versioned SQL migrations under `supabase/migrations` define this schema today.

## 7. Approval workflows

Every entry that moves money — or changes what a member is credited for — follows the same shape: a non-admin submission starts *pending* and only counts once an admin acts on it. Admin-entered records are recorded directly.

| Entity | Who can submit | States | Once approved |
|---|---|---|---|
| Deposit | Member (own), Admin (any) | `pending → approved / rejected` | Counts toward that member's balance |
| Bazar / expense | Contributor, Admin | `pending → approved / rejected` | Counts toward the month's meal rate |
| Bill payment | Member (own share) | `unpaid → pending_review → paid / unpaid` | Share marked settled with a paid date |
| Correction request | Member (own record) | `open → approved / rejected` | Meal count or active status updated, if auto-applied |

## 8. Technical architecture

**Frontend.** React 18 + TypeScript on Vite. Tailwind CSS with shadcn/ui (Radix primitives) for the component layer. TanStack Query for server-state and cache invalidation. React Router for navigation. React Hook Form + Zod for form validation. Sonner for toasts.

**Backend.** Supabase: Postgres with row-level security, Supabase Auth (GoTrue) for email/password sign-in, and one Deno Edge Function (`signup-allowlisted`) for gated, pre-confirmed signup.

**Hosting & config.** Deployed on Vercel. Supabase project id, URL, and anon key are supplied via `VITE_`-prefixed env vars; the project id is also pinned in `supabase/config.toml` for the CLI migration workflow.

**Schema management.** Twenty-one versioned SQL migrations under `supabase/migrations` track every schema change from first principles to the current shape.

## 9. Non-functional requirements

- **Mobile-first input.** Large tap targets, 1–2 taps to log a meal — the product's own stated usability bar.
- **Currency.** All amounts in Taka (৳), formatted to a maximum of 2 decimals through one shared helper.
- **Default-safe writes.** Non-admin submissions that touch money default to pending — nothing a member submits silently becomes truth without an admin action.
- **Auditability.** State-changing actions are expected to land in `activity_logs` so the Transparency page stays a complete record, with no edit/delete surface exposed for past entries.

## 10. Known gaps

Observed directly in the current codebase — not aspirational, these are real as of this document's date.

- **Duplicate expense entry point.** An `/expenses` route and page exist alongside `/bazar`, covering a slice of the same "log a shared expense" job but with no approval workflow and no entry in the navigation sidebar. Worth retiring or folding into Bazar.
- **Dashboard placeholders.** Four KPI tiles — Bills unpaid, Rent collected, Rent due, Active agreements — are explicit "Coming soon" placeholders, even though the Bills data they'd need already exists in `bills_v2` / `bill_items`. The dashboard just isn't wired to it yet.
- **Stale README.** The repository's README previously described a Next.js + Firebase stack while the shipped app is Vite + React + Supabase; this has since been corrected alongside the MessPilot rebrand.
- **No PDF export.** The Report page — the natural "send this to the group" artifact — offers only `window.print()`, not a generated PDF.
- **No notification channel.** Nothing pushes a pending approval, a bill due date, or a correction response to a member outside the app itself — they have to go check.

## 11. Roadmap

1. **Near-term** — Wire the four dashboard placeholders to real Bills data; retire or merge `/expenses` into `/bazar`.
2. **V1 polish** — Notifications for pending reviews and bill due dates; sharper, more detailed reports.
3. **V2** — WhatsApp/SMS alerts, PDF export, multi-mess (multi-tenant) support, advanced analytics.

## 12. Glossary

| Term | Meaning |
|---|---|
| **Mess** | A shared household — bachelors or students splitting daily meals and living costs. Common in South Asian shared housing. |
| **Bazar** | The daily or periodic grocery shopping run; also used generically for "shared expense." |
| **Meal rate** | The per-meal cost for the current month, recalculated live as meals and approved bazar change. |
| **Taka (৳)** | Bangladeshi currency — the app's only supported currency. |

---

*MessPilot PRD · v1.0 · Compiled from the shipped codebase, 10 Aug 2026*
