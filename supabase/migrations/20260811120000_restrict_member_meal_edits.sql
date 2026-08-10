-- Feature 1.2: members can still log a brand-new day directly (first-time entry,
-- no admin bottleneck for routine daily logging), but changing or removing an
-- already-saved day must go through the existing correction_requests review
-- pipeline instead of writing to meals directly. Admin access is unaffected.
DROP POLICY IF EXISTS "Member update own meals" ON public.meals;
DROP POLICY IF EXISTS "Member delete own meals" ON public.meals;
