
-- Admin RPC to list auth users (id + email + display_name) for linking
CREATE OR REPLACE FUNCTION public.admin_list_auth_users()
RETURNS TABLE(id uuid, email text, display_name text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email::text, p.display_name
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    ORDER BY u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_auth_users() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_auth_users() TO authenticated;

-- Link Shahad's auth account to his member record
INSERT INTO public.member_links (member_id, user_id)
VALUES ('f603bf6f-e680-4a29-aaa1-eb4ec07f35d0', 'f86120f3-9fb5-46e8-b2f1-389448c5004b')
ON CONFLICT DO NOTHING;

-- Allow Shahad to submit bazar entries (will go to pending until admin approves)
INSERT INTO public.user_roles (user_id, role)
VALUES ('f86120f3-9fb5-46e8-b2f1-389448c5004b', 'bazar_contributor')
ON CONFLICT DO NOTHING;
