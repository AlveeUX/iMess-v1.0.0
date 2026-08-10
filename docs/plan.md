# Admin edit of bill amounts

Let admins change the ৳ amount on any row in the Bills page — both Rent bills and Utility bills tabs — and have it reflected everywhere those amounts feed into (bill totals, Paid/Unpaid cards, Report dues, member-wise dues).

## Scope

- Rent bills tab: edit per-member `bill_items.amount` for any row.
- Utility bills tab: edit per-member `bill_items.amount` for any row.
- Paid rows: editable, but require an "Are you sure?" confirmation (paid total is being rewritten).
- Rent edits: after save, ask "Also update {Member}'s default rent amount for future bills?" (Yes / No).
- Non-admins: no change — they still only see request-review / cancel flow.

Out of scope: editing utility bill `total_amount` directly, editing dates/status from this control, bulk edits.

## UX

In each row's Amount cell (admin only):

```text
Rent bills                                 Utility bills
┌────────────┐                              ┌────────────┐
│ ৳4250.00 ✎ │  ← click pencil to edit      │ ৳1720.00 ✎ │
└────────────┘                              └────────────┘
        │
        ▼ inline editor
┌──────────────────────┐
│ [ 4500.00 ] [✓] [✕] │
└──────────────────────┘
```

- Click pencil → cell becomes a numeric input + Save/Cancel.
- Enter saves; Esc cancels.
- If row.status = 'paid' → confirmation AlertDialog before write: "This bill is already marked Paid. Update the amount anyway?"
- After a successful Rent save → AlertDialog: "Also set {member.name}'s default monthly rent to ৳{new}? Future rent bills will use this value." → Yes updates `members.rent_amount`; No leaves it.
- After save: toast, refetch bills + month data so cards/Report update.

## Data flow

- Write: `update bill_items set amount = :new where id = :id` (admin RLS already allows). The `enforce_bill_item_member_update` trigger only restricts non-admins, so admin updates pass through.
- Optional rent default: `update members set rent_amount = :new where id = :member_id`.
- Activity log: existing `log_change` trigger on `bill_items` and `members` captures the diff, so it shows up in Transparency automatically — no new logging code.
- Cache invalidation: invalidate the bills query in Bills.tsx and `["month-data", monthKey]` so:
  - Bills page totals (Total Rent Due, Total Utility Due, Paid, Unpaid) recompute.
  - Report's `rentUnpaid` / `utilUnpaid` / per-member `rentDue` / `utilityDue` recompute (already derived from bill_items in `useMonthData`).

## Validation

- Amount must be a number > 0 (block negatives and empty).
- Reject save if value unchanged (no-op).
- All errors → toast with Postgres error message.

## Files to change

- `src/pages/Bills.tsx`
  - Add `EditableAmountCell` component used in both Rent and Utility tables (admin-only; non-admins keep the read-only `৳…` text).
  - Add inline edit state per row id; Save handler calls supabase update, then opens "propagate to default?" dialog for rent rows.
  - Add Paid-row AlertDialog.
  - Invalidate `["bills", monthKey]` (or whichever key the page uses) and `["month-data", monthKey]` after save.
- No schema or RLS changes needed.
- No changes to Report.tsx / useMessData.ts — they already derive from `bill_items`.

## Edge cases

- Closed month: `bill_items` itself is not gated by `is_month_closed`; admins can still edit. We surface the bill's `due_month` as-is and don't block — matches existing admin override behavior elsewhere.
- Concurrent edits: single-row update, last write wins (acceptable for this app's scale).
- Member default rent change does not retroactively touch existing rent `bill_items` for other months — only the current row being edited.
