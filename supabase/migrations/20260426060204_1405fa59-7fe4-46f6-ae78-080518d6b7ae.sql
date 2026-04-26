
-- 1) Remove forgeable INSERT policy on activity_logs.
-- The log_change() trigger is SECURITY DEFINER and bypasses RLS, so legitimate
-- audit writes continue to work. Removing this policy prevents clients from
-- inserting fake audit entries.
DROP POLICY IF EXISTS "Auth insert activity_logs" ON public.activity_logs;

-- 2) Restrict phone column on members to admins only via column privileges.
-- Authenticated users keep read access to non-sensitive columns.
REVOKE SELECT ON public.members FROM authenticated;
GRANT SELECT (id, name, room, is_active, created_at) ON public.members TO authenticated;

-- Admins need full read access including phone. Grant phone select to a
-- dedicated SECURITY DEFINER RPC instead of granting it to all authenticated.
CREATE OR REPLACE FUNCTION public.admin_list_members_with_phone()
RETURNS TABLE (
  id uuid,
  name text,
  room text,
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
    SELECT m.id, m.name, m.room, m.phone, m.is_active, m.created_at
    FROM public.members m
    ORDER BY m.name;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_members_with_phone() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_members_with_phone() TO authenticated;

-- 3) Lock down realtime.messages — app does not use Realtime channels.
-- Adds restrictive default-deny policies so authenticated users cannot
-- subscribe to or broadcast on arbitrary channels.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'realtime' AND c.relname = 'messages') THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Deny all realtime by default" ON realtime.messages';
    EXECUTE 'CREATE POLICY "Deny all realtime by default" ON realtime.messages FOR ALL TO authenticated USING (false) WITH CHECK (false)';
  END IF;
END $$;
