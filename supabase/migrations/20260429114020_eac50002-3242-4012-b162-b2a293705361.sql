-- 1. Member rent + seat
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS rent_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seat_name TEXT;

-- 2. New bills_v2 table
CREATE TABLE IF NOT EXISTS public.bills_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_type TEXT NOT NULL CHECK (bill_type IN ('rent','utility')),
  title TEXT NOT NULL,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_month DATE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bills_v2 ENABLE ROW LEVEL SECURITY;

-- 3. bill_items table
CREATE TABLE IF NOT EXISTS public.bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills_v2(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','pending_review','paid')),
  paid_on DATE,
  requested_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bill_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON public.bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_member ON public.bill_items(member_id);

ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;

-- 4. RLS for bills_v2
CREATE POLICY "Admin manage bills_v2 - select"
  ON public.bills_v2 FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR bill_type = 'utility'
    OR EXISTS (
      SELECT 1 FROM public.bill_items bi
      JOIN public.member_links ml ON ml.member_id = bi.member_id
      WHERE bi.bill_id = bills_v2.id AND ml.user_id = auth.uid()
    )
  );

CREATE POLICY "Admin insert bills_v2"
  ON public.bills_v2 FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin update bills_v2"
  ON public.bills_v2 FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin delete bills_v2"
  ON public.bills_v2 FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. RLS for bill_items
-- Members see: all utility items + their own rent items. Admins see all.
CREATE POLICY "View bill_items scoped"
  ON public.bill_items FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.bills_v2 b
      WHERE b.id = bill_items.bill_id AND b.bill_type = 'utility'
    )
    OR EXISTS (
      SELECT 1 FROM public.member_links ml
      WHERE ml.user_id = auth.uid() AND ml.member_id = bill_items.member_id
    )
  );

CREATE POLICY "Admin insert bill_items"
  ON public.bill_items FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin delete bill_items"
  ON public.bill_items FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Admin can update anything; member can update only their own row, and only status/note (enforced by trigger).
CREATE POLICY "Admin update bill_items"
  ON public.bill_items FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Member update own bill_item status"
  ON public.bill_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.member_links ml
      WHERE ml.user_id = auth.uid() AND ml.member_id = bill_items.member_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.member_links ml
      WHERE ml.user_id = auth.uid() AND ml.member_id = bill_items.member_id
    )
  );

-- 6. Trigger: when a non-admin updates, only allow status transitions unpaid<->pending_review,
--    and prevent changes to amount/bill_id/member_id/approved_by/paid_on.
CREATE OR REPLACE FUNCTION public.enforce_bill_item_member_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- Non-admin path: lock down all fields except status/note/requested_at
  IF NEW.bill_id     IS DISTINCT FROM OLD.bill_id
  OR NEW.member_id   IS DISTINCT FROM OLD.member_id
  OR NEW.amount      IS DISTINCT FROM OLD.amount
  OR NEW.paid_on     IS DISTINCT FROM OLD.paid_on
  OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
  OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION 'Members can only update status of their own bill';
  END IF;

  -- Allowed transitions for members
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

DROP TRIGGER IF EXISTS trg_bill_items_member_update ON public.bill_items;
CREATE TRIGGER trg_bill_items_member_update
BEFORE UPDATE ON public.bill_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_bill_item_member_update();

-- 7. Activity logging on the new tables (reuses existing log_change function)
DROP TRIGGER IF EXISTS trg_log_bills_v2 ON public.bills_v2;
CREATE TRIGGER trg_log_bills_v2
AFTER INSERT OR UPDATE OR DELETE ON public.bills_v2
FOR EACH ROW EXECUTE FUNCTION public.log_change();

DROP TRIGGER IF EXISTS trg_log_bill_items ON public.bill_items;
CREATE TRIGGER trg_log_bill_items
AFTER INSERT OR UPDATE OR DELETE ON public.bill_items
FOR EACH ROW EXECUTE FUNCTION public.log_change();

-- updated_at trigger for bills_v2
DROP TRIGGER IF EXISTS trg_bills_v2_updated_at ON public.bills_v2;
CREATE TRIGGER trg_bills_v2_updated_at
BEFORE UPDATE ON public.bills_v2
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();