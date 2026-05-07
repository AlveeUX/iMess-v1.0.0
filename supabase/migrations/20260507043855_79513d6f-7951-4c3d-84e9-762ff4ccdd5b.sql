
-- 1. Restore EXECUTE access on helper functions used by RLS + the app
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_member_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_month_closed(date) TO authenticated;

-- 2. Allow authenticated users to read non-sensitive member columns
--    (phone stays restricted; admins read it via admin_list_members_with_phone)
GRANT SELECT (id, name, room, seat_name, rent_amount, is_active, created_at)
  ON public.members TO authenticated;

-- 3. Update admin RPC to also return seat_name and rent_amount
DROP FUNCTION IF EXISTS public.admin_list_members_with_phone();
CREATE OR REPLACE FUNCTION public.admin_list_members_with_phone()
RETURNS TABLE (
  id uuid,
  name text,
  room text,
  seat_name text,
  rent_amount numeric,
  phone text,
  is_active boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT m.id, m.name, m.room, m.seat_name, m.rent_amount, m.phone, m.is_active, m.created_at
    FROM public.members m
    ORDER BY m.name;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_members_with_phone() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_members_with_phone() TO authenticated;

-- 4. Fix recursive RLS on bills_v2 / bill_items via SECURITY DEFINER helpers
CREATE OR REPLACE FUNCTION public.user_owns_bill_item(_item_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bill_items bi
    JOIN public.member_links ml ON ml.member_id = bi.member_id
    WHERE bi.id = _item_id AND ml.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.bill_has_member_item(_bill_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bill_items bi
    JOIN public.member_links ml ON ml.member_id = bi.member_id
    WHERE bi.bill_id = _bill_id AND ml.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.bill_is_utility(_bill_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bills_v2 b
    WHERE b.id = _bill_id AND b.bill_type = 'utility'
  )
$$;

GRANT EXECUTE ON FUNCTION public.user_owns_bill_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bill_has_member_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bill_is_utility(uuid) TO authenticated;

-- Replace recursive policies on bills_v2
DROP POLICY IF EXISTS "Admin manage bills_v2 - select" ON public.bills_v2;
CREATE POLICY "View bills_v2 scoped" ON public.bills_v2
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR bill_type = 'utility'
    OR public.bill_has_member_item(id)
  );

-- Replace recursive policies on bill_items
DROP POLICY IF EXISTS "View bill_items scoped" ON public.bill_items;
CREATE POLICY "View bill_items scoped" ON public.bill_items
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.bill_is_utility(bill_id)
    OR EXISTS (
      SELECT 1 FROM public.member_links ml
      WHERE ml.user_id = auth.uid() AND ml.member_id = bill_items.member_id
    )
  );
