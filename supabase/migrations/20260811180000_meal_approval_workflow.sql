-- Meal entries now go through the same pending/approved/rejected review
-- flow as bazar/deposits: every non-admin write (first-time entry AND
-- edits) lands as 'pending' and is excluded from totals/billing until an
-- admin approves it. Admin writes stay instant/self-approved. Existing
-- rows are backfilled to 'approved' via the ADD COLUMN default so past
-- totals don't change.
ALTER TABLE public.meals
  ADD COLUMN status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending','approved','rejected')),
  ADD COLUMN reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN review_note text;

CREATE OR REPLACE FUNCTION public.enforce_meal_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_admin_or_super(auth.uid()) THEN
    -- Admin writes are self-approved. A plain save on a pending row (no
    -- status in the payload) sees NEW.status still 'pending' here since
    -- BEFORE-trigger NEW retains OLD values for unset columns — promote it.
    -- An explicit reject (status already set to 'rejected') is left alone.
    IF NEW.status IS NULL OR NEW.status = 'pending' THEN
      NEW.status := 'approved';
    END IF;
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
      NEW.reviewed_by := auth.uid();
      NEW.reviewed_at := now();
    END IF;
  ELSE
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_note := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_meal_submission ON public.meals;
CREATE TRIGGER trg_enforce_meal_submission
BEFORE INSERT OR UPDATE ON public.meals
FOR EACH ROW EXECUTE FUNCTION public.enforce_meal_submission();

-- Members can edit/clear their own meal row again, but only while it's not
-- yet finalized (mirrors "Member update own pending or rejected expense").
-- Once a row is 'approved' there is no member-writable path to it at all.
CREATE POLICY "Member update own pending meal" ON public.meals FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.member_links ml
      WHERE ml.user_id = auth.uid() AND ml.member_id = meals.member_id
    )
    AND status IN ('pending','rejected')
    AND NOT public.is_month_closed(date)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.member_links ml
      WHERE ml.user_id = auth.uid() AND ml.member_id = meals.member_id
    )
    AND status = 'pending'
    AND NOT public.is_month_closed(date)
  );

CREATE POLICY "Member delete own pending meal" ON public.meals FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.member_links ml
      WHERE ml.user_id = auth.uid() AND ml.member_id = meals.member_id
    )
    AND status IN ('pending','rejected')
    AND NOT public.is_month_closed(date)
  );
