-- Block a member from submitting new bazar entries after 3 consecutive
-- rejections. Any approval resets the streak to 0 (forgives past mistakes).
-- Once blocked, only an admin can clear it (Members page), which also
-- resets the streak so the member gets a fresh 3-strike allowance.
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS bazar_reject_streak int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bazar_blocked boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_bazar_blocked(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT m.bazar_blocked
       FROM public.members m
       JOIN public.member_links ml ON ml.member_id = m.id
      WHERE ml.user_id = _user_id),
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.enforce_bazar_strike()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member uuid;
BEGIN
  IF NEW.status NOT IN ('approved', 'rejected') OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT member_id INTO v_member FROM public.member_links WHERE user_id = NEW.submitted_by;
  IF v_member IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'rejected' THEN
    UPDATE public.members
       SET bazar_reject_streak = bazar_reject_streak + 1,
           bazar_blocked = (bazar_reject_streak + 1 >= 3)
     WHERE id = v_member;
  ELSIF NEW.status = 'approved' THEN
    UPDATE public.members
       SET bazar_reject_streak = 0
     WHERE id = v_member;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bazar_strike ON public.expenses;
CREATE TRIGGER trg_bazar_strike
AFTER UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.enforce_bazar_strike();

-- Tighten the open insert policy: blocked members can't submit new bazar,
-- admins are always exempt.
DROP POLICY IF EXISTS "Authenticated insert expenses" ON public.expenses;
CREATE POLICY "Authenticated insert expenses" ON public.expenses FOR INSERT TO authenticated
WITH CHECK (
  NOT public.is_month_closed(date)
  AND (public.is_admin_or_super(auth.uid()) OR NOT public.is_bazar_blocked(auth.uid()))
);
