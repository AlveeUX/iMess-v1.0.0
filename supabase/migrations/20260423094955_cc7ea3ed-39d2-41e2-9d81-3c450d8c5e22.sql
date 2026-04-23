-- Allowlist of emails permitted to sign up
CREATE TABLE public.signup_allowlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.signup_allowlist ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage allowlist (do NOT expose to regular members)
CREATE POLICY "Admins view allowlist" ON public.signup_allowlist
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert allowlist" ON public.signup_allowlist
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update allowlist" ON public.signup_allowlist
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete allowlist" ON public.signup_allowlist
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_signup_allowlist_email ON public.signup_allowlist (lower(email));

-- Replace handle_new_user to enforce allowlist (first user always allowed and becomes admin)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INT;
  is_allowed BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO user_count FROM auth.users;

  IF user_count > 1 THEN
    -- Not the first user: must be on allowlist (case-insensitive)
    SELECT EXISTS (
      SELECT 1 FROM public.signup_allowlist
      WHERE lower(email) = lower(NEW.email)
    ) INTO is_allowed;

    IF NOT is_allowed THEN
      RAISE EXCEPTION 'Sign-ups are restricted. Ask an admin to add your email to the allowlist.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists on auth.users (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();