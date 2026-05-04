
-- 1. Restrict activity_logs SELECT to admins only
DROP POLICY IF EXISTS "Auth view activity_logs" ON public.activity_logs;
CREATE POLICY "Admin view activity_logs"
ON public.activity_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Revoke EXECUTE on SECURITY DEFINER functions from anon/authenticated; re-grant only the intended admin RPCs
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.current_member_id() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_month_closed(date) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.jsonb_diff(jsonb, jsonb) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_expense_submission() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_bill_item_member_update() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.admin_list_members_with_phone() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.apply_correction(uuid, text) FROM anon, authenticated, public;

-- Re-grant only intended admin-callable RPCs to authenticated (function bodies still enforce admin check)
GRANT EXECUTE ON FUNCTION public.admin_list_members_with_phone() TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_correction(uuid, text) TO authenticated;
