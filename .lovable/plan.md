# Explicit 0-meal entries + Away periods

## 1. Explicit 0 meal entries

Today, saving 0 on a day deletes the row, so the cell shows "—" and nobody can tell whether you skipped or just forgot. We'll change it so 0 is a real, saved value.

- **Save behavior**: Saving `0` upserts a `meals` row with `meal_count = 0` instead of deleting. Deleting still works (a new "Clear day" button) to remove the entry entirely.
- **Calendar rendering**: Day with `0` shows a neutral "0" pill (muted color, distinct from "—" empty and the primary-blue count pill). Empty days keep showing "—".
- **Totals**: Unchanged (sum of meal_count; 0 contributes 0).

## 2. Away periods

A new way to mark "I won't be eating from X to Y". Days inside an away period auto-show as 0 meals on the calendar with an "Away" overlay, and totals treat them as 0. Bills, rent, member list — untouched.

### Storage

New table `member_away_periods`:
- `member_id` (FK members)
- `start_date`, `end_date` (date, inclusive)
- `note` (text, optional reason)
- `status`: `approved` | `pending` (for request flow)
- `created_by`, `reviewed_by`, `reviewed_at`, `review_note`
- timestamps

RLS:
- Everyone authenticated can `SELECT` (members see each other's away periods, same pattern as meals/deposits).
- Member can `INSERT` their own period for future dates only (auto-approved).
- Member's `INSERT` for a range that touches past or closed-month dates is forced to `status='pending'` via a trigger.
- Admins can insert/update/delete/approve any range.
- Members can delete their own future, still-approved periods.

### Self-serve vs request (the "Both" rule)

Enforced by a `BEFORE INSERT/UPDATE` trigger on `member_away_periods`:
- If `start_date >= today` AND no day in the range is in a closed month AND the caller is the member → `status = 'approved'`.
- Otherwise (range includes past dates, or a closed month, or someone else's member) and caller is not admin → `status = 'pending'`. Admin must approve from the Requests page.

### Effect on meals

We do **not** bulk-insert 0 rows. Instead:
- Calendar overlay: any day inside an approved away period renders as an "Away" cell (muted background, "Away" label, count treated as 0).
- `useMonthData` fetches approved away periods for the month and exposes `awayByMemberDate: Map<member_id, Set<date>>`. Per-member meal total subtracts any meal rows that fall inside an away period (defensive; normally there are none) and reports the displayed 0s.
- Editing a day inside an approved away period is blocked in the UI (toast: "This day is inside an away period — remove the period first to edit"). Admin can still override.

### Surfaces

- **Meals page**: New "Away" button next to the month nav opens a small dialog: start date, end date, optional note → submits. Shows the member's active/pending away periods as chips below the calendar with a delete (✕) button (own future approved ones only; pending ones cancellable by the requester).
- **Corrections/Requests page**: Pending away periods appear as a new request kind ("Away period: Jun 14 → Jun 20"). Admin approves via the existing review dialog; on approve we set `status='approved'` on the away row (no `apply_correction` needed — separate handler since it's its own table).
- **Day cell**: Inside an away period → muted background, small "Away" label, no meal pill, not clickable for non-admins.

## Technical notes

### Migration outline (one migration)
```sql
CREATE TABLE public.member_away_periods (
  id uuid PK default gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date   date NOT NULL CHECK (end_date >= start_date),
  note text,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','pending','rejected')),
  created_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_away_periods TO authenticated;
GRANT ALL ON public.member_away_periods TO service_role;
ALTER TABLE public.member_away_periods ENABLE ROW LEVEL SECURITY;

-- Policies: SELECT for all authenticated; INSERT if caller owns member or is admin;
-- UPDATE/DELETE if admin OR (own row AND status<>'rejected' AND start_date > today).
-- Trigger enforce_away_submission: forces status='pending' for non-admin when range
-- touches past or closed-month dates; else 'approved'. Sets created_by = auth.uid().
-- Trigger update_updated_at_column on UPDATE.
-- Trigger log_change for activity logs.
```
Index on `(member_id, start_date, end_date)`.

### Frontend changes
- `src/pages/Meals.tsx`:
  - Save 0 as upsert instead of delete; add "Clear day" button to dialog.
  - Render 0-pill (neutral) vs empty "—".
  - "Away" button + dialog (start/end/note).
  - Render away-period overlay on day cells; block edit inside approved away period for non-admins.
  - Show member's away chips with delete affordance.
- `src/hooks/useMessData.ts`: fetch `member_away_periods` (status='approved') for the month, return `awayByMemberDate`.
- `src/pages/Corrections.tsx`: list pending away periods alongside correction requests; approve sets `status='approved'`, reject sets `status='rejected'`.
- `src/integrations/supabase/types.ts`: regenerated automatically after migration.

### Out of scope
- No change to bills, rent, or `members.is_active`.
- No bulk 0-meal row writes for away periods.
- No edit-history UI for away periods beyond what `activity_logs` already captures.
