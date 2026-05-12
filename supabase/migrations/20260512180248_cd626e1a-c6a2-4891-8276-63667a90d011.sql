
-- 1. Helper: is_admin_or_super
CREATE OR REPLACE FUNCTION public.is_admin_or_super(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','super_admin')
  )
$$;

-- 2. Promote oldest existing admin to super_admin
INSERT INTO public.user_roles (user_id, role)
SELECT ur.user_id, 'super_admin'::app_role
FROM public.user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE ur.role = 'admin'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin')
ORDER BY u.created_at ASC
LIMIT 1;

-- 3. DEPOSITS: add approval workflow columns
ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

-- 4. Trigger: enforce deposit submission rules
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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deposits_enforce_submission ON public.deposits;
CREATE TRIGGER deposits_enforce_submission
BEFORE INSERT ON public.deposits
FOR EACH ROW EXECUTE FUNCTION public.enforce_deposit_submission();

-- 5. Replace deposit policies
DROP POLICY IF EXISTS "Admin delete deposits"  ON public.deposits;
DROP POLICY IF EXISTS "Admin insert deposits"  ON public.deposits;
DROP POLICY IF EXISTS "Admin update deposits"  ON public.deposits;
DROP POLICY IF EXISTS "Auth view deposits"     ON public.deposits;

CREATE POLICY "Admin delete deposits" ON public.deposits FOR DELETE TO authenticated
  USING (public.is_admin_or_super(auth.uid()) AND NOT public.is_month_closed(date));

CREATE POLICY "Admin update deposits" ON public.deposits FOR UPDATE TO authenticated
  USING (public.is_admin_or_super(auth.uid()) AND NOT public.is_month_closed(date));

-- Member can submit own deposit (will be forced to pending by trigger)
CREATE POLICY "Member or admin insert deposits" ON public.deposits FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.is_month_closed(date) AND (
      public.is_admin_or_super(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.member_links ml
        WHERE ml.user_id = auth.uid() AND ml.member_id = deposits.member_id
      )
    )
  );

-- View: approved visible to all, pending/rejected visible to admin or own submitter
CREATE POLICY "View deposits scoped" ON public.deposits FOR SELECT TO authenticated
  USING (
    status = 'approved'
    OR public.is_admin_or_super(auth.uid())
    OR submitted_by = auth.uid()
  );

-- 6. Member can delete own pending deposit
CREATE POLICY "Member delete own pending deposit" ON public.deposits FOR DELETE TO authenticated
  USING (
    status = 'pending'
    AND submitted_by = auth.uid()
    AND NOT public.is_month_closed(date)
  );

-- 7. Rewrite policies on every table that referenced has_role(...,'admin') so super_admin inherits
-- members
DROP POLICY IF EXISTS "Admin delete members" ON public.members;
DROP POLICY IF EXISTS "Admin insert members" ON public.members;
DROP POLICY IF EXISTS "Admin update members" ON public.members;
CREATE POLICY "Admin delete members" ON public.members FOR DELETE TO authenticated USING (public.is_admin_or_super(auth.uid()));
CREATE POLICY "Admin insert members" ON public.members FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_super(auth.uid()));
CREATE POLICY "Admin update members" ON public.members FOR UPDATE TO authenticated USING (public.is_admin_or_super(auth.uid()));

-- meals
DROP POLICY IF EXISTS "Admin delete meals" ON public.meals;
DROP POLICY IF EXISTS "Admin insert meals" ON public.meals;
DROP POLICY IF EXISTS "Admin update meals" ON public.meals;
CREATE POLICY "Admin delete meals" ON public.meals FOR DELETE TO authenticated USING (public.is_admin_or_super(auth.uid()) AND NOT public.is_month_closed(date));
CREATE POLICY "Admin insert meals" ON public.meals FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_super(auth.uid()) AND NOT public.is_month_closed(date));
CREATE POLICY "Admin update meals" ON public.meals FOR UPDATE TO authenticated USING (public.is_admin_or_super(auth.uid()) AND NOT public.is_month_closed(date));

-- expenses
DROP POLICY IF EXISTS "Admin delete expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admin or contributor insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admin update expenses" ON public.expenses;
DROP POLICY IF EXISTS "View expenses scoped" ON public.expenses;
CREATE POLICY "Admin delete expenses" ON public.expenses FOR DELETE TO authenticated USING (public.is_admin_or_super(auth.uid()) AND NOT public.is_month_closed(date));
CREATE POLICY "Admin or contributor insert expenses" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK ((public.is_admin_or_super(auth.uid()) OR public.has_role(auth.uid(), 'bazar_contributor')) AND NOT public.is_month_closed(date));
CREATE POLICY "Admin update expenses" ON public.expenses FOR UPDATE TO authenticated USING (public.is_admin_or_super(auth.uid()) AND NOT public.is_month_closed(date));
CREATE POLICY "View expenses scoped" ON public.expenses FOR SELECT TO authenticated
  USING (status = 'approved' OR public.is_admin_or_super(auth.uid()) OR submitted_by = auth.uid());

-- bills_v2
DROP POLICY IF EXISTS "Admin delete bills_v2" ON public.bills_v2;
DROP POLICY IF EXISTS "Admin insert bills_v2" ON public.bills_v2;
DROP POLICY IF EXISTS "Admin update bills_v2" ON public.bills_v2;
DROP POLICY IF EXISTS "View bills_v2 scoped"  ON public.bills_v2;
CREATE POLICY "Admin delete bills_v2" ON public.bills_v2 FOR DELETE TO authenticated USING (public.is_admin_or_super(auth.uid()));
CREATE POLICY "Admin insert bills_v2" ON public.bills_v2 FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_super(auth.uid()));
CREATE POLICY "Admin update bills_v2" ON public.bills_v2 FOR UPDATE TO authenticated USING (public.is_admin_or_super(auth.uid()));
CREATE POLICY "View bills_v2 scoped" ON public.bills_v2 FOR SELECT TO authenticated
  USING (public.is_admin_or_super(auth.uid()) OR bill_type = 'utility' OR public.bill_has_member_item(id));

-- bill_items
DROP POLICY IF EXISTS "Admin delete bill_items" ON public.bill_items;
DROP POLICY IF EXISTS "Admin insert bill_items" ON public.bill_items;
DROP POLICY IF EXISTS "Admin update bill_items" ON public.bill_items;
DROP POLICY IF EXISTS "View bill_items scoped"  ON public.bill_items;
CREATE POLICY "Admin delete bill_items" ON public.bill_items FOR DELETE TO authenticated USING (public.is_admin_or_super(auth.uid()));
CREATE POLICY "Admin insert bill_items" ON public.bill_items FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_super(auth.uid()));
CREATE POLICY "Admin update bill_items" ON public.bill_items FOR UPDATE TO authenticated USING (public.is_admin_or_super(auth.uid()));
CREATE POLICY "View bill_items scoped" ON public.bill_items FOR SELECT TO authenticated
  USING (
    public.is_admin_or_super(auth.uid())
    OR public.bill_is_utility(bill_id)
    OR EXISTS (SELECT 1 FROM public.member_links ml WHERE ml.user_id = auth.uid() AND ml.member_id = bill_items.member_id)
  );

-- member_links
DROP POLICY IF EXISTS "Admin delete member_links" ON public.member_links;
DROP POLICY IF EXISTS "Admin insert member_links" ON public.member_links;
DROP POLICY IF EXISTS "Admin update member_links" ON public.member_links;
CREATE POLICY "Admin delete member_links" ON public.member_links FOR DELETE TO authenticated USING (public.is_admin_or_super(auth.uid()));
CREATE POLICY "Admin insert member_links" ON public.member_links FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_super(auth.uid()));
CREATE POLICY "Admin update member_links" ON public.member_links FOR UPDATE TO authenticated USING (public.is_admin_or_super(auth.uid()));

-- months
DROP POLICY IF EXISTS "Admin delete months" ON public.months;
DROP POLICY IF EXISTS "Admin insert months" ON public.months;
DROP POLICY IF EXISTS "Admin update months" ON public.months;
CREATE POLICY "Admin delete months" ON public.months FOR DELETE TO authenticated USING (public.is_admin_or_super(auth.uid()));
CREATE POLICY "Admin insert months" ON public.months FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_super(auth.uid()));
CREATE POLICY "Admin update months" ON public.months FOR UPDATE TO authenticated USING (public.is_admin_or_super(auth.uid()));

-- signup_allowlist
DROP POLICY IF EXISTS "Admins delete allowlist" ON public.signup_allowlist;
DROP POLICY IF EXISTS "Admins insert allowlist" ON public.signup_allowlist;
DROP POLICY IF EXISTS "Admins update allowlist" ON public.signup_allowlist;
DROP POLICY IF EXISTS "Admins view allowlist"   ON public.signup_allowlist;
CREATE POLICY "Admins delete allowlist" ON public.signup_allowlist FOR DELETE TO authenticated USING (public.is_admin_or_super(auth.uid()));
CREATE POLICY "Admins insert allowlist" ON public.signup_allowlist FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_super(auth.uid()));
CREATE POLICY "Admins update allowlist" ON public.signup_allowlist FOR UPDATE TO authenticated USING (public.is_admin_or_super(auth.uid()));
CREATE POLICY "Admins view allowlist"   ON public.signup_allowlist FOR SELECT TO authenticated USING (public.is_admin_or_super(auth.uid()));

-- activity_logs
DROP POLICY IF EXISTS "Admin view activity_logs" ON public.activity_logs;
CREATE POLICY "Admin view activity_logs" ON public.activity_logs FOR SELECT TO authenticated USING (public.is_admin_or_super(auth.uid()));

-- correction_requests
DROP POLICY IF EXISTS "Admin updates corrections"           ON public.correction_requests;
DROP POLICY IF EXISTS "Requester or admin sees corrections" ON public.correction_requests;
CREATE POLICY "Admin updates corrections" ON public.correction_requests FOR UPDATE TO authenticated USING (public.is_admin_or_super(auth.uid()));
CREATE POLICY "Requester or admin sees corrections" ON public.correction_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.is_admin_or_super(auth.uid()));

-- profiles unchanged

-- 8. user_roles tightening
DROP POLICY IF EXISTS "Admins delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins view all roles" ON public.user_roles;

CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_admin_or_super(auth.uid()));

CREATE POLICY "Roles insert tiered" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    CASE role
      WHEN 'super_admin' THEN public.has_role(auth.uid(), 'super_admin')
      WHEN 'admin'       THEN public.has_role(auth.uid(), 'super_admin')
      ELSE public.is_admin_or_super(auth.uid())
    END
  );

CREATE POLICY "Roles delete tiered" ON public.user_roles FOR DELETE TO authenticated
  USING (
    CASE role
      WHEN 'super_admin' THEN public.has_role(auth.uid(), 'super_admin')
      WHEN 'admin'       THEN public.has_role(auth.uid(), 'super_admin')
      ELSE public.is_admin_or_super(auth.uid())
    END
  );

-- 9. Prevent removing the last super_admin
CREATE OR REPLACE FUNCTION public.prevent_last_super_admin_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.role = 'super_admin' THEN
    IF (SELECT COUNT(*) FROM public.user_roles WHERE role = 'super_admin') <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last super_admin' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_protect_last_super ON public.user_roles;
CREATE TRIGGER user_roles_protect_last_super
BEFORE DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.prevent_last_super_admin_delete();

-- 10. Update existing SECURITY DEFINER functions to recognise super_admin
CREATE OR REPLACE FUNCTION public.enforce_expense_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.submitted_by := COALESCE(NEW.submitted_by, auth.uid());
  IF NOT public.is_admin_or_super(auth.uid()) THEN
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_note := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_bill_item_member_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.is_admin_or_super(auth.uid()) THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF NEW.bill_id     IS DISTINCT FROM OLD.bill_id
  OR NEW.member_id   IS DISTINCT FROM OLD.member_id
  OR NEW.amount      IS DISTINCT FROM OLD.amount
  OR NEW.paid_on     IS DISTINCT FROM OLD.paid_on
  OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
  OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION 'Members can only update status of their own bill';
  END IF;
  IF NOT (
    (OLD.status = 'unpaid'         AND NEW.status = 'pending_review') OR
    (OLD.status = 'pending_review' AND NEW.status = 'unpaid')         OR
    (OLD.status = NEW.status)
  ) THEN
    RAISE EXCEPTION 'Members can only request review or cancel a request';
  END IF;
  IF NEW.status = 'pending_review' AND OLD.status = 'unpaid' THEN
    NEW.requested_at := now();
  ELSIF NEW.status = 'unpaid' AND OLD.status = 'pending_review' THEN
    NEW.requested_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_correction(_request_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r public.correction_requests%ROWTYPE;
  v_member_id uuid; v_date date; v_meal_count numeric; v_is_active boolean;
BEGIN
  IF NOT public.is_admin_or_super(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM public.correction_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status <> 'open' THEN RAISE EXCEPTION 'Request is not open'; END IF;

  IF r.entity_type = 'meals' THEN
    v_member_id := COALESCE(r.member_id, (r.requested_value->>'member_id')::uuid);
    v_date      := COALESCE((r.requested_value->>'date')::date, CURRENT_DATE);
    v_meal_count := COALESCE((r.requested_value->>'meal_count')::numeric, 0);
    IF v_member_id IS NULL THEN RAISE EXCEPTION 'Member not linked to request'; END IF;
    IF public.is_month_closed(v_date) THEN RAISE EXCEPTION 'Month is closed for that date'; END IF;
    INSERT INTO public.meals (member_id, date, meal_count) VALUES (v_member_id, v_date, v_meal_count)
    ON CONFLICT (member_id, date) DO UPDATE SET meal_count = EXCLUDED.meal_count;
  ELSIF r.entity_type = 'members' THEN
    v_member_id := COALESCE(r.member_id, (r.requested_value->>'member_id')::uuid);
    v_is_active := (r.requested_value->>'is_active')::boolean;
    IF v_member_id IS NULL THEN RAISE EXCEPTION 'Member not linked to request'; END IF;
    IF v_is_active IS NULL THEN RAISE EXCEPTION 'requested_value.is_active required'; END IF;
    UPDATE public.members SET is_active = v_is_active WHERE id = v_member_id;
  ELSE
    RAISE EXCEPTION 'apply_correction does not support entity_type %', r.entity_type;
  END IF;

  UPDATE public.correction_requests
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = COALESCE(_note, review_note)
  WHERE id = _request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_auth_users()
RETURNS TABLE(id uuid, email text, display_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_admin_or_super(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email::text, p.display_name
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    ORDER BY u.email;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_members_with_phone()
RETURNS TABLE(id uuid, name text, room text, seat_name text, rent_amount numeric, phone text, is_active boolean, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_admin_or_super(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT m.id, m.name, m.room, m.seat_name, m.rent_amount, m.phone, m.is_active, m.created_at
    FROM public.members m ORDER BY m.name;
END;
$$;
