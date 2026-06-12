## Goal

When a member (or admin) submits a bazar/expense, automatically create a matching **deposit** under their profile — so contributors don't have to record the same money twice. The deposit's status mirrors the bazar entry: pending → approved → rejected (or back to pending on edit).

This removes the biggest pain point: contributors currently add a bazar AND must also add a deposit to get credit for the money they spent.

## Behavior

### On submit bazar
- If the submitter's user account is linked to a member (`member_links`), the system also creates a `deposits` row with:
  - `member_id` = linked member
  - `amount` = bazar amount
  - `date` = bazar date
  - `method` = `bazar` (new method label so it's visually distinct)
  - `note` = "Auto: <bazar title>"
  - `status` = `pending` (mirrors the bazar)
  - `submitted_by` = submitter
  - new column `source_expense_id` = bazar row id (1:1 link, used to keep them in sync)
- If the submitter has no linked member: bazar is still created, no auto-deposit. A small UI hint suggests linking their account.

### On bazar status change
- Approved → linked deposit set to `approved` (same reviewer, note prefixed "Auto-approved with bazar").
- Rejected → linked deposit set to `rejected` (so it doesn't inflate balances).
- Edited (amount/date/title) while pending → linked deposit updated to match.
- Deleted → linked deposit deleted.

All of the above is done by a single Postgres trigger on `expenses` — no client logic needed, no race conditions, works for admin and member submissions.

### Standalone deposits
- The Deposits page keeps its existing "Submit deposit" flow unchanged (for cash handed to admin with no bazar attached). Users see both: auto-deposits from bazar (method = `bazar`) and manual ones.

### Visibility & edit rules (unchanged from current rules)
- Everyone signed in sees all approved deposits + their own pending/rejected (already in place).
- Members can only edit/delete their **own** deposits while pending — auto-deposits inherit the same rule via `submitted_by`. They edit the bazar; the trigger updates the deposit.
- Admins can edit/delete anything.

## Technical details

### Migration
1. `ALTER TABLE public.deposits ADD COLUMN source_expense_id uuid REFERENCES public.expenses(id) ON DELETE CASCADE;`
2. Unique partial index so one bazar maps to at most one deposit:
   `CREATE UNIQUE INDEX deposits_source_expense_uniq ON public.deposits(source_expense_id) WHERE source_expense_id IS NOT NULL;`
3. New trigger function `public.sync_bazar_deposit()` on `expenses` (AFTER INSERT/UPDATE/DELETE):
   - INSERT: if `submitted_by` has a `member_links` row, insert deposit (bypasses `enforce_deposit_submission` because trigger runs as SECURITY DEFINER and sets `status` explicitly).
   - UPDATE: locate the linked deposit by `source_expense_id`; mirror `status`, `amount`, `date`, `reviewed_by`, `reviewed_at`, `review_note` (prefixed). If no linked deposit exists yet but submitter became linked, create it.
   - DELETE: cascade handles it via FK.
4. `enforce_deposit_submission` skips overriding status when the row has `source_expense_id IS NOT NULL` and the caller is the sync trigger (use `current_setting('app.sync_bazar', true)` flag set inside the function).
5. RLS on `deposits` already allows owner to read; auto-deposit's `submitted_by` is the same user, so it appears under their profile automatically.

### Frontend
- `Bazar.tsx`: add a small inline notice in the submit dialog: "This will be recorded as a ৳X deposit under your name." Show only if the user is linked to a member. If not linked, show "Link your account to a member in Settings to also get deposit credit."
- `Deposits.tsx`: when rendering a row with `method === "bazar"`, show a small badge "From bazar" and link the row to the bazar entry. The row is read-only on this page (edits happen via Bazar) — hide edit/delete for auto-deposits; instead show a tooltip "Edit the bazar entry to change this".
- No changes to `Auth`, allowlist, other pages.

## Validation

- Member submits bazar ৳500 → bazar row pending + deposit row pending (method=bazar) appears on both pages.
- Admin approves bazar → both rows flip to approved; member's monthly deposit total goes up by ৳500.
- Admin rejects bazar → both rows rejected; deposit total unchanged.
- Member edits bazar amount ৳500 → ৳600 (still pending) → linked deposit also becomes ৳600.
- Member deletes bazar → linked deposit deleted (FK cascade).
- Member without a `member_links` row submits bazar → bazar created, no deposit (UI showed the warning).
- Manual deposit on Deposits page still works as before, no source link.
