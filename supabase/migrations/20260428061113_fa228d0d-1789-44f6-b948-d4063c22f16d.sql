CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_count INT;
  is_allowed BOOLEAN;
BEGIN
  -- Count existing users EXCLUDING the row being inserted
  SELECT COUNT(*) INTO user_count FROM auth.users WHERE id <> NEW.id;

  IF user_count >= 1 THEN
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

  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');
  END IF;

  RETURN NEW;
END;
$function$;