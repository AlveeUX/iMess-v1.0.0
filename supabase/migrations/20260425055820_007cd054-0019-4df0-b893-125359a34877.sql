-- ============================================================
-- 2. member_links
-- ============================================================
CREATE TABLE public.member_links (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid NOT NULL UNIQUE REFERENCES public.members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.member_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view member_links" ON public.member_links
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin insert member_links" ON public.member_links
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update member_links" ON public.member_links
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete member_links" ON public.member_links
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.current_member_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT member_id FROM public.member_links WHERE user_id = auth.uid()
$$;

-- ============================================================
-- 3. Bazar approval workflow
-- ============================================================
ALTER TABLE public.expenses
  ADD COLUMN status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN submitted_by uuid,
  ADD COLUMN submitted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN reviewed_by uuid,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN review_note text;

CREATE INDEX idx_expenses_status ON public.expenses(status);

DROP POLICY IF EXISTS "Admin insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admin update expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admin delete expenses" ON public.expenses;

CREATE POLICY "Admin or contributor insert expenses" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'bazar_contributor'))
    AND NOT public.is_month_closed(date)
  );

CREATE POLICY "Admin update expenses" ON public.expenses
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND NOT public.is_month_closed(date));

CREATE POLICY "Admin delete expenses" ON public.expenses
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND NOT public.is_month_closed(date));

CREATE OR REPLACE FUNCTION public.enforce_expense_submission()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.submitted_by := COALESCE(NEW.submitted_by, auth.uid());
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_note := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_expense_submission
  BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_expense_submission();

-- ============================================================
-- 4. Activity logs
-- ============================================================
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_email text,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  month date,
  diff jsonb,
  note text
);

CREATE INDEX idx_activity_created ON public.activity_logs(created_at DESC);
CREATE INDEX idx_activity_entity ON public.activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_month ON public.activity_logs(month);
CREATE INDEX idx_activity_actor ON public.activity_logs(actor_id);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view activity_logs" ON public.activity_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert activity_logs" ON public.activity_logs
  FOR INSERT TO authenticated WITH CHECK (true);
-- No UPDATE / DELETE = nobody can ever change history

CREATE OR REPLACE FUNCTION public.jsonb_diff(old jsonb, new jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'before', COALESCE(jsonb_object_agg(key, old->key) FILTER (WHERE old->key IS DISTINCT FROM new->key), '{}'::jsonb),
    'after',  COALESCE(jsonb_object_agg(key, new->key) FILTER (WHERE old->key IS DISTINCT FROM new->key), '{}'::jsonb)
  )
  FROM (
    SELECT key FROM jsonb_object_keys(old) AS k(key)
    UNION
    SELECT key FROM jsonb_object_keys(new) AS k(key)
  ) keys
  WHERE key NOT IN ('id', 'created_at', 'updated_at');
$$;

CREATE OR REPLACE FUNCTION public.log_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_action text;
  v_entity_id uuid;
  v_month date;
  v_diff jsonb;
  v_email text;
  v_row_date date;
BEGIN
  IF TG_OP = 'INSERT' THEN v_action := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'expenses' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := CASE NEW.status WHEN 'approved' THEN 'approved' WHEN 'rejected' THEN 'rejected' ELSE 'updated' END;
    ELSIF TG_TABLE_NAME = 'months' AND OLD.is_closed IS DISTINCT FROM NEW.is_closed THEN
      v_action := CASE WHEN NEW.is_closed THEN 'closed' ELSE 'reopened' END;
    ELSIF TG_TABLE_NAME = 'correction_requests' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := NEW.status;
    ELSE
      v_action := 'updated';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN v_action := 'deleted';
  END IF;

  v_entity_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;

  v_row_date := NULL;
  IF TG_TABLE_NAME IN ('meals','deposits','expenses') THEN
    v_row_date := (CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)->>'date' ELSE to_jsonb(NEW)->>'date' END)::date;
  ELSIF TG_TABLE_NAME = 'months' THEN
    v_row_date := (CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)->>'month' ELSE to_jsonb(NEW)->>'month' END)::date;
  END IF;
  v_month := CASE WHEN v_row_date IS NOT NULL THEN date_trunc('month', v_row_date)::date END;

  IF TG_OP = 'INSERT' THEN
    v_diff := jsonb_build_object('after', to_jsonb(NEW) - 'created_at' - 'id');
  ELSIF TG_OP = 'UPDATE' THEN
    v_diff := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW));
  ELSE
    v_diff := jsonb_build_object('before', to_jsonb(OLD) - 'created_at');
  END IF;

  IF TG_OP = 'UPDATE' AND v_diff->'before' = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_email := (auth.jwt() ->> 'email');
  EXCEPTION WHEN OTHERS THEN v_email := NULL;
  END;

  INSERT INTO public.activity_logs (actor_id, actor_email, entity_type, entity_id, action, month, diff)
  VALUES (auth.uid(), v_email, TG_TABLE_NAME, v_entity_id, v_action, v_month, v_diff);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ============================================================
-- 5. Correction requests
-- ============================================================
CREATE TABLE public.correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  requested_by uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  month date,
  current_value jsonb,
  requested_value jsonb,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text
);

CREATE INDEX idx_corrections_status ON public.correction_requests(status);
CREATE INDEX idx_corrections_requested_by ON public.correction_requests(requested_by);

ALTER TABLE public.correction_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requester or admin sees corrections" ON public.correction_requests
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Auth can create corrections" ON public.correction_requests
  FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Admin updates corrections" ON public.correction_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 6. Triggers
-- ============================================================
CREATE TRIGGER trg_log_meals AFTER INSERT OR UPDATE OR DELETE ON public.meals
  FOR EACH ROW EXECUTE FUNCTION public.log_change();
CREATE TRIGGER trg_log_deposits AFTER INSERT OR UPDATE OR DELETE ON public.deposits
  FOR EACH ROW EXECUTE FUNCTION public.log_change();
CREATE TRIGGER trg_log_expenses AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.log_change();
CREATE TRIGGER trg_log_members AFTER INSERT OR UPDATE OR DELETE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.log_change();
CREATE TRIGGER trg_log_months AFTER INSERT OR UPDATE OR DELETE ON public.months
  FOR EACH ROW EXECUTE FUNCTION public.log_change();
CREATE TRIGGER trg_log_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_change();
CREATE TRIGGER trg_log_corrections AFTER INSERT OR UPDATE ON public.correction_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_change();