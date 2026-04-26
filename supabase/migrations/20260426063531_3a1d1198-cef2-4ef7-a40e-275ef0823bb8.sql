-- 1) Strip sensitive `phone` column from members audit log diffs.
-- Prevents non-admins from extracting phone numbers via activity_logs.diff,
-- which bypasses the column-level REVOKE on members.phone.
CREATE OR REPLACE FUNCTION public.log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
  v_entity_id uuid;
  v_month date;
  v_diff jsonb;
  v_email text;
  v_row_date date;
BEGIN
  IF TG_OP = 'INSERT' THEN v_action := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'expenses' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := CASE NEW.status WHEN 'approved' THEN 'approved' WHEN 'rejected' THEN 'rejected' ELSE 'updated' END;
    ELSIF TG_TABLE_NAME = 'months' AND OLD.is_closed IS DISTINCT FROM NEW.is_closed THEN
      v_action := CASE WHEN NEW.is_closed THEN 'closed' ELSE 'reopened' END;
    ELSIF TG_TABLE_NAME = 'correction_requests' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := NEW.status;
    ELSE
      v_action := 'updated';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN v_action := 'deleted';
  END IF;

  v_entity_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;

  v_row_date := NULL;
  IF TG_TABLE_NAME IN ('meals','deposits','expenses') THEN
    v_row_date := (CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)->>'date' ELSE to_jsonb(NEW)->>'date' END)::date;
  ELSIF TG_TABLE_NAME = 'months' THEN
    v_row_date := (CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)->>'month' ELSE to_jsonb(NEW)->>'month' END)::date;
  END IF;
  v_month := CASE WHEN v_row_date IS NOT NULL THEN date_trunc('month', v_row_date)::date END;

  IF TG_OP = 'INSERT' THEN
    v_diff := jsonb_build_object('after', to_jsonb(NEW) - 'created_at' - 'id');
  ELSIF TG_OP = 'UPDATE' THEN
    v_diff := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW));
  ELSE
    v_diff := jsonb_build_object('before', to_jsonb(OLD) - 'created_at');
  END IF;

  -- Strip sensitive PII columns from logged diffs
  IF TG_TABLE_NAME = 'members' THEN
    IF v_diff ? 'before' THEN
      v_diff := jsonb_set(v_diff, '{before}', (v_diff->'before') - 'phone');
    END IF;
    IF v_diff ? 'after' THEN
      v_diff := jsonb_set(v_diff, '{after}', (v_diff->'after') - 'phone');
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND v_diff->'before' = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_email := (auth.jwt() ->> 'email');
  EXCEPTION WHEN OTHERS THEN v_email := NULL;
  END;

  INSERT INTO public.activity_logs (actor_id, actor_email, entity_type, entity_id, action, month, diff)
  VALUES (auth.uid(), v_email, TG_TABLE_NAME, v_entity_id, v_action, v_month, v_diff);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Also retroactively scrub any phone values previously captured in logs.
UPDATE public.activity_logs
SET diff = CASE
  WHEN diff ? 'before' AND diff ? 'after' THEN
    jsonb_set(jsonb_set(diff, '{before}', (diff->'before') - 'phone'), '{after}', (diff->'after') - 'phone')
  WHEN diff ? 'before' THEN
    jsonb_set(diff, '{before}', (diff->'before') - 'phone')
  WHEN diff ? 'after' THEN
    jsonb_set(diff, '{after}', (diff->'after') - 'phone')
  ELSE diff
END
WHERE entity_type = 'members'
  AND (diff->'before' ? 'phone' OR diff->'after' ? 'phone');

-- 2) Tighten expense visibility: contributors only see their own submissions
-- plus anything approved; admins see everything. Closes the client-side-only
-- gate currently in Bazar.tsx.
DROP POLICY IF EXISTS "Auth view expenses" ON public.expenses;

CREATE POLICY "View expenses scoped"
ON public.expenses
FOR SELECT
TO authenticated
USING (
  status = 'approved'
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR submitted_by = auth.uid()
);
