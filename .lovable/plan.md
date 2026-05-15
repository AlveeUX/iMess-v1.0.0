## Problem

Clicking **Approve & Apply** on a correction request fails with `record "old" has no field "status"`.

Root cause is in the `log_change()` trigger function. It checks status/is_closed columns inline:

```
IF TG_TABLE_NAME = 'expenses' AND OLD.status IS DISTINCT FROM NEW.status THEN ...
ELSIF TG_TABLE_NAME = 'months' AND OLD.is_closed IS DISTINCT FROM NEW.is_closed THEN ...
ELSIF TG_TABLE_NAME = 'correction_requests' AND OLD.status IS DISTINCT FROM NEW.status THEN ...
```

Even though the table-name guard is false for `meals`/`members`/etc., Postgres still resolves `OLD.status` against the row type at runtime and raises an error because those tables have no `status` column. The same trigger is attached to many tables, so any UPDATE on a table without `status` (e.g. the `meals` UPDATE that `apply_correction` performs via `ON CONFLICT DO UPDATE`) blows up — which aborts the whole transaction and prevents the approval from being applied.

## Fix

Rewrite `log_change()` so the column-specific checks are only reached for tables that actually have those columns. Use nested `IF TG_TABLE_NAME = '…' THEN` blocks (or read the field through `to_jsonb(OLD)->>'status'` which never errors for missing fields).

Behavior stays identical:
- expenses UPDATE that flips status → logs `approved` / `rejected` / `updated`
- months UPDATE that flips `is_closed` → logs `closed` / `reopened`
- correction_requests UPDATE that flips status → logs the new status
- everything else → `updated`

## Plan

1. Migration: replace `public.log_change()` with a version that nests the per-table status/is_closed checks inside an outer `IF TG_TABLE_NAME = '…'` so OLD/NEW field references are only resolved on tables that have those columns. Keep all other logic (PII stripping for members, INSERT/DELETE handling, activity_logs insert) unchanged.
2. Verify in the preview by approving the open correction request — the toast should disappear and the meal value should update.

No frontend changes needed.
