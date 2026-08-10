-- The column-level grant from 20260426060204 only covered
-- (id, name, room, is_active, created_at), so it was silently missing
-- seat_name and rent_amount even before today -- any select including
-- those columns (as useMessData.ts does) got a 403 permission-denied.
-- Column grants are additive, so this just adds what's missing,
-- including the two new columns from the bazar-block migration.
GRANT SELECT (seat_name, rent_amount, bazar_reject_streak, bazar_blocked)
  ON public.members TO authenticated;
