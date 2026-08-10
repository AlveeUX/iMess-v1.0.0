CREATE TABLE public.member_away_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','pending','rejected')),
  created_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_away_periods TO authenticated;
GRANT ALL ON public.member_away_periods TO service_role;

ALTER TABLE public.member_away_periods ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_away_member_dates ON public.member_away_periods(member_id, start_date, end_date);

-- SELECT: any authenticated user
CREATE POLICY "Authenticated can view away periods"
ON public.member_away_periods FOR SELECT
TO authenticated
USING (true);

-- INSERT: admin OR owner of member
CREATE POLICY "Admin or owner can insert away"
ON public.member_away_periods FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_or_super(auth.uid())
  OR member_id = public.current_member_id()
);

-- UPDATE: admin always; owner only for future-dated rows
CREATE POLICY "Admin or owner can update away"
ON public.member_away_periods FOR UPDATE
TO authenticated
USING (
  public.is_admin_or_super(auth.uid())
  OR (member_id = public.current_member_id() AND start_date > CURRENT_DATE)
)
WITH CHECK (
  public.is_admin_or_super(auth.uid())
  OR (member_id = public.current_member_id() AND start_date > CURRENT_DATE)
);

-- DELETE: admin always; owner only for future-dated rows
CREATE POLICY "Admin or owner can delete away"
ON public.member_away_periods FOR DELETE
TO authenticated
USING (
  public.is_admin_or_super(auth.uid())
  OR (member_id = public.current_member_id() AND start_date > CURRENT_DATE)
);

-- Submission enforcement: non-admin gets pending when range touches past or closed month
CREATE OR REPLACE FUNCTION public.enforce_away_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_d date;
  v_needs_review boolean := false;
BEGIN
  v_is_admin := public.is_admin_or_super(auth.uid());

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;

  IF NOT v_is_admin THEN
    IF NEW.start_date <= CURRENT_DATE THEN
      v_needs_review := true;
    ELSE
      v_d := date_trunc('month', NEW.start_date)::date;
      WHILE v_d <= NEW.end_date LOOP
        IF public.is_month_closed(v_d) THEN
          v_needs_review := true;
          EXIT;
        END IF;
        v_d := (v_d + interval '1 month')::date;
      END LOOP;
    END IF;

    NEW.status := CASE WHEN v_needs_review THEN 'pending' ELSE 'approved' END;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_note := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_away_enforce
BEFORE INSERT OR UPDATE ON public.member_away_periods
FOR EACH ROW EXECUTE FUNCTION public.enforce_away_submission();

CREATE TRIGGER trg_away_updated_at
BEFORE UPDATE ON public.member_away_periods
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_away_log
AFTER INSERT OR UPDATE OR DELETE ON public.member_away_periods
FOR EACH ROW EXECUTE FUNCTION public.log_change();