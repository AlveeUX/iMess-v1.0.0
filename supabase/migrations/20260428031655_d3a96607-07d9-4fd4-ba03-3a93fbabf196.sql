CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.bills (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id uuid NOT NULL,
  title text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  is_paid boolean NOT NULL DEFAULT false,
  paid_date date,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bills_member ON public.bills(member_id);
CREATE INDEX idx_bills_due ON public.bills(due_date);

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth view bills"
  ON public.bills FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin insert bills"
  ON public.bills FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin update bills"
  ON public.bills FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin delete bills"
  ON public.bills FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_bills_updated_at
  BEFORE UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER log_bills_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.log_change();