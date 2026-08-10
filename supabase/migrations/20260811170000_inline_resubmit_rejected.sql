-- Let a member resubmit their own REJECTED bazar entry or deposit in
-- place (edit -> back to pending -> admin reviews again), instead of
-- only being able to create a brand-new disconnected entry.

-- EXPENSES (bazar): broaden the existing pending-only update policy to
-- also allow editing a rejected row, but force the new status back to
-- 'pending' so a member can never set it to 'approved' themselves.
DROP POLICY IF EXISTS "Member update own pending expense" ON public.expenses;
CREATE POLICY "Member update own pending or rejected expense" ON public.expenses FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() AND status IN ('pending', 'rejected') AND NOT public.is_month_closed(date))
  WITH CHECK (submitted_by = auth.uid() AND status = 'pending' AND NOT public.is_month_closed(date));

CREATE OR REPLACE FUNCTION public.enforce_expense_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.submitted_by := COALESCE(NEW.submitted_by, auth.uid());
  IF NOT public.is_admin_or_super(auth.uid()) THEN
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_note := NULL;
    IF TG_OP = 'UPDATE' THEN
      NEW.submitted_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_expense_submission ON public.expenses;
CREATE TRIGGER trg_enforce_expense_submission
BEFORE INSERT OR UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.enforce_expense_submission();

-- DEPOSITS: members previously had no UPDATE path at all. Add one scoped
-- to their own rejected, non-bazar-linked deposits only (bazar-linked
-- deposits are mirrored from expenses via sync_bazar_deposit() and must
-- be resubmitted from the Bazar page so the two rows stay in sync).
CREATE POLICY "Member resubmit own rejected deposit" ON public.deposits FOR UPDATE TO authenticated
  USING (
    submitted_by = auth.uid()
    AND status = 'rejected'
    AND source_expense_id IS NULL
    AND NOT public.is_month_closed(date)
  )
  WITH CHECK (submitted_by = auth.uid() AND status = 'pending' AND NOT public.is_month_closed(date));

CREATE OR REPLACE FUNCTION public.enforce_deposit_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.submitted_by := COALESCE(NEW.submitted_by, auth.uid());
  IF NOT public.is_admin_or_super(auth.uid()) THEN
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_note := NULL;
    IF TG_OP = 'UPDATE' THEN
      NEW.submitted_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deposits_enforce_submission ON public.deposits;
CREATE TRIGGER deposits_enforce_submission
BEFORE INSERT OR UPDATE ON public.deposits
FOR EACH ROW EXECUTE FUNCTION public.enforce_deposit_submission();
