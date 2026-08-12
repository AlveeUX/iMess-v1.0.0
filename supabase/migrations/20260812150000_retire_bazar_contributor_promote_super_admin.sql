-- `bazar_contributor` was built (April 2026) to gate who could submit
-- bazar purchases for reimbursement. That gate was quietly removed on
-- 2026-06-04 (20260604191519_...sql swapped the contributor-gated INSERT
-- policy on `expenses` for one open to every authenticated member) and
-- nothing ever replaced it with a new purpose -- every current holder
-- (Alvee, Prosen, Test) gets nothing functional from it today. Retiring
-- it entirely: reassign existing holders, then remove the enum value.
--
-- Separately, `super_admin` (added May 2026) has never actually been
-- used -- the one-time backfill meant to promote the first admin ran
-- before any real user existed, so it silently matched zero rows. No
-- super_admin exists in production today. This migration runs that same
-- backfill now (Alvee is the oldest admin) and drops their now-redundant
-- plain `admin` grant, since isAdmin already implies isSuperAdmin
-- everywhere in the app.
--
-- Postgres can't drop a single enum value directly -- only rename old /
-- create new / migrate column / drop old works. Every dependent object
-- below (1 function, 5 policies across `bills` and `user_roles`) was
-- found by querying live pg_policies/pg_proc/information_schema against
-- production rather than trusting migration-file history, which would
-- have missed the legacy `bills` table (superseded by `bills_v2`, 0
-- rows, but still holding 3 policies that call has_role()).

-- 1. Reassign data before touching the type -- a live 'bazar_contributor'
-- row would make the eventual ::app_role cast fail outright.
DELETE FROM public.user_roles WHERE role = 'bazar_contributor';

-- 2. Promote the oldest admin to super_admin if none exists yet (same
-- shape as the original, dormant 20260512180248 backfill), then drop
-- that account's now-redundant plain admin grant.
DO $$
DECLARE
  v_promoted uuid;
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  SELECT ur.user_id, 'super_admin'::app_role
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.role = 'admin'
    AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin')
  ORDER BY u.created_at ASC
  LIMIT 1
  RETURNING user_id INTO v_promoted;

  IF v_promoted IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = v_promoted AND role = 'admin';
  END IF;
END $$;

-- 3. Swap the enum type.
ALTER TYPE public.app_role RENAME TO app_role_old;
CREATE TYPE public.app_role AS ENUM ('member', 'admin', 'super_admin');

-- 4. Drop the 5 policies that depend on has_role()'s signature, by name
-- (no CASCADE -- explicit control over exactly what gets rebuilt).
DROP POLICY IF EXISTS "Admin delete bills" ON public.bills;
DROP POLICY IF EXISTS "Admin insert bills" ON public.bills;
DROP POLICY IF EXISTS "Admin update bills" ON public.bills;
DROP POLICY IF EXISTS "Roles delete tiered" ON public.user_roles;
DROP POLICY IF EXISTS "Roles insert tiered" ON public.user_roles;

-- 5. Drop the old function (its second parameter is bound to the
-- now-renamed type) and migrate the column.
DROP FUNCTION public.has_role(uuid, public.app_role_old);

ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;

-- 6. Recreate has_role bound to the new type -- identical body.
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- 7. Recreate the 5 policies verbatim (same USING/WITH CHECK text as
-- production had before this migration).
CREATE POLICY "Admin delete bills" ON public.bills FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin insert bills" ON public.bills FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin update bills" ON public.bills FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Roles insert tiered" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    CASE role
      WHEN 'super_admin' THEN public.has_role(auth.uid(), 'super_admin')
      WHEN 'admin'       THEN public.has_role(auth.uid(), 'super_admin')
      ELSE public.is_admin_or_super(auth.uid())
    END
  );
CREATE POLICY "Roles delete tiered" ON public.user_roles FOR DELETE TO authenticated
  USING (
    CASE role
      WHEN 'super_admin' THEN public.has_role(auth.uid(), 'super_admin')
      WHEN 'admin'       THEN public.has_role(auth.uid(), 'super_admin')
      ELSE public.is_admin_or_super(auth.uid())
    END
  );

-- 8. Drop the old type now that nothing references it.
DROP TYPE public.app_role_old;
