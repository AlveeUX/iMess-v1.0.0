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
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_old := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;

  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'expenses' AND v_old->>'status' IS DISTINCT FROM v_new->>'status' THEN
      v_action := CASE v_new->>'status' WHEN 'approved' THEN 'approved' WHEN 'rejected' THEN 'rejected' ELSE 'updated' END;
    ELSIF TG_TABLE_NAME = 'months' AND v_old->>'is_closed' IS DISTINCT FROM v_new->>'is_closed' THEN
      v_action := CASE WHEN (v_new->>'is_closed')::boolean THEN 'closed' ELSE 'reopened' END;
    ELSIF TG_TABLE_NAME = 'correction_requests' AND v_old->>'status' IS DISTINCT FROM v_new->>'status' THEN
      v_action := v_new->>'status';
    ELSE
      v_action := 'updated';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
  END IF;

  v_entity_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;

  v_row_date := NULL;
  IF TG_TABLE_NAME IN ('meals','deposits','expenses') THEN
    v_row_date := (COALESCE(v_new, v_old)->>'date')::date;
  ELSIF TG_TABLE_NAME = 'months' THEN
    v_row_date := (COALESCE(v_new, v_old)->>'month')::date;
  END IF;
  v_month := CASE WHEN v_row_date IS NOT NULL THEN date_trunc('month', v_row_date)::date END;

  IF TG_OP = 'INSERT' THEN
    v_diff := jsonb_build_object('after', v_new - 'created_at' - 'id');
  ELSIF TG_OP = 'UPDATE' THEN
    v_diff := public.jsonb_diff(v_old, v_new);
  ELSE
    v_diff := jsonb_build_object('before', v_old - 'created_at');
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