-- "Maid" feature (user-facing name). Internal table/column names stay
-- "housekeeper" per existing code conventions. Additive only — no existing
-- table touched. No approval workflow: admin/super_admin writes apply
-- immediately, same shape as `members` (not the enforce_*_submission
-- pending/approved pattern used by meals/deposits/away-periods).

CREATE TABLE public.housekeeper (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  monthly_rent numeric(10,2),
  per_visit_amount numeric(10,2) NOT NULL,
  visits_per_day integer NOT NULL DEFAULT 2,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.housekeeper ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view housekeeper" ON public.housekeeper
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin insert housekeeper" ON public.housekeeper
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_super(auth.uid()));
CREATE POLICY "Admin update housekeeper" ON public.housekeeper
  FOR UPDATE TO authenticated USING (public.is_admin_or_super(auth.uid()));
CREATE POLICY "Admin delete housekeeper" ON public.housekeeper
  FOR DELETE TO authenticated USING (public.is_admin_or_super(auth.uid()));

CREATE TRIGGER trg_housekeeper_updated_at
  BEFORE UPDATE ON public.housekeeper
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_log_housekeeper
  AFTER INSERT OR UPDATE OR DELETE ON public.housekeeper
  FOR EACH ROW EXECUTE FUNCTION public.log_change();

CREATE TABLE public.housekeeper_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  housekeeper_id uuid NOT NULL REFERENCES public.housekeeper(id) ON DELETE CASCADE,
  date date NOT NULL,
  visit_1_present boolean NOT NULL DEFAULT true,
  visit_2_present boolean NOT NULL DEFAULT true,
  note text,
  marked_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (housekeeper_id, date)
);

ALTER TABLE public.housekeeper_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view housekeeper_attendance" ON public.housekeeper_attendance
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin insert housekeeper_attendance" ON public.housekeeper_attendance
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_super(auth.uid()));
CREATE POLICY "Admin update housekeeper_attendance" ON public.housekeeper_attendance
  FOR UPDATE TO authenticated USING (public.is_admin_or_super(auth.uid()));
CREATE POLICY "Admin delete housekeeper_attendance" ON public.housekeeper_attendance
  FOR DELETE TO authenticated USING (public.is_admin_or_super(auth.uid()));

-- Server-set "who marked this" (same intent as away-periods' created_by /
-- deposits' submitted_by — trust the session, not the client payload).
CREATE OR REPLACE FUNCTION public.set_housekeeper_attendance_marked_by()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.marked_by := auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_housekeeper_attendance_marked_by
  BEFORE INSERT OR UPDATE ON public.housekeeper_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_housekeeper_attendance_marked_by();
CREATE TRIGGER trg_housekeeper_attendance_updated_at
  BEFORE UPDATE ON public.housekeeper_attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_log_housekeeper_attendance
  AFTER INSERT OR UPDATE OR DELETE ON public.housekeeper_attendance
  FOR EACH ROW EXECUTE FUNCTION public.log_change();

CREATE INDEX idx_housekeeper_attendance_date ON public.housekeeper_attendance(date);
CREATE INDEX idx_housekeeper_attendance_housekeeper ON public.housekeeper_attendance(housekeeper_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.housekeeper TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.housekeeper_attendance TO authenticated;
GRANT ALL ON public.housekeeper, public.housekeeper_attendance TO service_role;
