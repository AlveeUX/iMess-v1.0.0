# iMES Upgrade — Phase 1 (Foundation)

Mapping the spec onto the **existing React + Vite + Supabase** stack. Firestore collections become Supabase tables; Cloud Functions become Edge Functions or Postgres functions/triggers. We're not rebuilding — we extend.

Phase 1 ships the **trust + transparency foundation**. Once stable, Phases 2–4 add Billing, Rent + Agreements, and Assets.

---

## 1. Visual refresh — blue primary

`src/index.css`:
- Swap green/teal primary (`158 76% 52%`) for SaaS blue (`221 83% 53%` — same hue family as Tailwind blue-600), keep dark slate background.
- Update `--primary`, `--primary-glow`, `--ring`, `--success` (keep green, separate token), `--sidebar-primary`, `--gradient-primary`, `--shadow-glow`.
- Add a subtle blue radial `--gradient-hero`.

Touch-up pass on `Layout`, `Dashboard`, status badges so the new accent reads cleanly. No structural CSS rewrites.

Delete unused root-level `firebase.js` (legacy, nothing imports it).

---

## 2. Roles — add `bazar_contributor`

Migration:
- `ALTER TYPE app_role ADD VALUE 'bazar_contributor';`
- New table `member_links (user_id uuid PK → auth.users, member_id uuid → members, unique)` so an auth user maps to one member row. Admins manage links from Members page (dropdown next to each member: "Link to user…").
- Security definer fn `public.current_member_id()` returns the linked `member_id` for `auth.uid()`.
- Extend `useAuth` to expose `roles: string[]`, `isAdmin`, `isContributor`, `memberId`.

Existing `handle_new_user` trigger keeps assigning first user → admin, others → member. Admin can promote a member to `bazar_contributor` from Members page (adds row to `user_roles`).

---

## 3. Bazar approval workflow

Migration on `expenses`:
- `status text NOT NULL DEFAULT 'approved'` with check `status IN ('pending','approved','rejected')`.
- `submitted_by uuid` (auth user), `submitted_at timestamptz default now()`.
- `reviewed_by uuid`, `reviewed_at timestamptz`, `review_note text`.
- Backfill all existing rows to `status='approved'` so the dashboard meal rate doesn't change.

RLS rewrite for `expenses`:
- SELECT: any authenticated (unchanged).
- INSERT: admin **OR** `has_role(auth.uid(),'bazar_contributor')`. Contributors are forced to `status='pending'` via a `BEFORE INSERT` trigger that overrides whatever they sent. Admins can insert directly as `approved`.
- UPDATE: only admin, and only to change status/review fields, **or** edit amount/title when not closed. Contributor cannot update.
- DELETE: admin only, not closed.

Two new edge functions (thin wrappers, mostly for activity logging atomicity):
- `approve-expense` — sets status, fills reviewer, writes activity log entry in same transaction via SQL function.
- `reject-expense` — same with rejection reason.

`useMonthData` filter changed: `totalExpense` and meal rate use **only `status='approved'`**. Pending/rejected shown separately in UI.

UI changes:
- `Expenses.tsx` (Bazar): new tabs "Pending / Approved / Rejected / All". Contributor sees only their own submissions + an "Add bazar" form. Admin sees all + Approve/Reject actions with note modal.
- Dashboard "Pending approvals" count card (clickable → /bazar?tab=pending).

---

## 4. Immutable Transparency Log (DB-enforced)

New table `activity_logs`:
```
id uuid pk, created_at timestamptz default now(),
actor_id uuid (auth.uid()), actor_email text,
entity_type text,   -- 'meal'|'deposit'|'expense'|'member'|'month'|'correction'|'role'
entity_id uuid,
action text,        -- 'created'|'updated'|'deleted'|'approved'|'rejected'|'closed'|'reopened'
month date,         -- date_trunc('month', relevant_date) for filtering
diff jsonb,         -- {before, after}
note text
```

RLS — **append-only, no override**:
- SELECT: any authenticated.
- INSERT: any authenticated (so triggers running with caller context can write).
- **No UPDATE policy. No DELETE policy.** Even admins cannot modify rows. Per spec: "Admin cannot override."

Triggers:
- `AFTER INSERT/UPDATE/DELETE` on `meals`, `deposits`, `expenses`, `members`, `months`, `user_roles`, `correction_requests`. Each trigger is a `SECURITY DEFINER` function that reads `auth.uid()` / `auth.jwt()->>'email'`, computes a JSON diff (only changed columns for updates), and inserts into `activity_logs`. Triggers bypass RLS via `SECURITY DEFINER`, so logging cannot be skipped from the app.

Page `/transparency` (new):
- Timeline list (vertical, grouped by day) with icons per entity type.
- Filters: entity type, action, actor, month, free-text search on note/diff.
- Pagination (50 / page).
- Sidebar nav entry "Transparency" (icon: `ScrollText`).

Visible to all authenticated users — transparency is the point.

---

## 5. Correction Requests

New table `correction_requests`:
```
id, created_at, member_id (who it's about, nullable),
requested_by uuid (auth user), entity_type, entity_id,
month date, current_value jsonb, requested_value jsonb,
reason text not null,
status text default 'open',  -- 'open'|'approved'|'rejected'
reviewed_by, reviewed_at, review_note
```

RLS:
- SELECT: requester sees own; admin sees all.
- INSERT: any authenticated.
- UPDATE: admin only (status + review fields).
- DELETE: none.

Page `/corrections`:
- Member view: form ("What's wrong?" → entity dropdown → reason) + list of own requests with status.
- Admin view: queue with Approve/Reject. Approving does **not** auto-mutate data (admin must still make the edit manually) — this keeps the audit trail clean and avoids double-source-of-truth bugs. Approval just marks the request resolved and logs intent. (Open question — see below.)

Dashboard: "Open correction requests" count card for admins.

---

## 6. Dashboard upgrade

`Dashboard.tsx` rebuild around the spec's "Financial Control Center":
- Hero meal rate (existing) — keep, restyle in blue.
- Stat row: Total meals · Total approved bazar · Total deposits · Advance balance (sum of positive member balances).
- Alert strip: **Pending approvals** (bazar) + **Open corrections**, only if > 0, jumps to the right page.
- Recent activity card now reads from `activity_logs` (last 8) instead of mixing deposits/expenses by hand. Click an item → `/transparency?id=…`.
- Member settlement snapshot (existing balances list) — keep.
- Quick actions row: "Add meal", "Add deposit", "Submit bazar" (contributor sees only the last).

Placeholders left for Phase 2–4 stats (Bills unpaid, Rent collected/due) so the layout is forward-compatible — they render as "—" until those modules ship.

---

## 7. Navigation

`src/components/Layout.tsx` nav array becomes:
```
Dashboard · Members · Meals · Deposits · Bazar · Reports · Transparency · Corrections · Settings
```
(Billing, Rent Tracker, Agreements, Assets stubbed in Phase 2–4.)

Role-aware filtering:
- General member: hide Members, Settings; Bazar shows their own only; Meals/Deposits read-only.
- Bazar contributor: same as member + can submit bazar.
- Admin: everything.

---

## 8. Files touched / created

**Migrations** (one combined file):
- `app_role` += `bazar_contributor`
- `member_links` table + `current_member_id()` fn
- `expenses` columns + RLS rewrite + `before insert` trigger
- `activity_logs` table + RLS + triggers on 7 tables
- `correction_requests` table + RLS

**Edge functions:** `approve-expense`, `reject-expense`

**New components/pages:**
- `src/pages/Transparency.tsx`
- `src/pages/Corrections.tsx`
- `src/components/bazar/BazarSubmitForm.tsx`
- `src/components/bazar/BazarReviewModal.tsx`
- `src/components/transparency/ActivityItem.tsx`
- `src/components/RoleBadge.tsx`

**Modified:**
- `src/index.css` (blue palette)
- `src/hooks/useAuth.tsx` (roles array, memberId)
- `src/hooks/useMessData.ts` (filter approved expenses, expose pending count)
- `src/components/Layout.tsx` (nav + role filtering)
- `src/pages/Dashboard.tsx` (rebuild)
- `src/pages/Expenses.tsx` → renamed mentally to "Bazar" (route stays `/expenses` to avoid breaking; label changes)
- `src/pages/Members.tsx` (link-to-user dropdown, role chips)
- `src/components/ProtectedRoute.tsx` (optional `requireRole` prop)
- Delete `firebase.js`

---

## 9. Open questions to decide before I build

1. **Correction approval = data mutation?** I'm proposing approval is **advisory** (admin still edits manually, both actions logged). Alternative: store `requested_value` as structured JSON and apply it on approve. Advisory is safer and faster to ship — confirm or override.
2. **Contributor = member?** Right now `bazar_contributor` is an additional role on top of `member`. A contributor must also have a `member_links` row so we know whose meals/deposits they're tied to. OK?
3. **Meal/deposit entry by members.** Spec says general members can *view* meals/deposits, not enter. Confirm meals stay admin-only entry (current behavior).
4. **Activity log diff size.** I'll skip logging `created_at`/`id` noise and cap diff at the changed columns. Acceptable?

---

## 10. Out of scope (Phase 2–4, separate iterations)

- **Phase 2 — Billing**: `bill_types`, `bills`, `bill_payments`, `bill_participants` (admin picks members per bill), monthly checklist UI, dashboard "Bills unpaid" wired up.
- **Phase 3 — Rent + Agreements**: `rents`, `tenant_advances`, `agreements` + 5-step wizard, status lifecycle, dashboard rent stats.
- **Phase 4 — Assets**: `assets`, `asset_ownerships`, contribution split, link asset purchases to billing's "Upgradation Fee".

Each phase will get its own plan with the same level of detail before any code lands.

---

**Ready to proceed?** Answer the 4 open questions above and I'll execute Phase 1 in default mode: migration first (you'll approve it), then code.