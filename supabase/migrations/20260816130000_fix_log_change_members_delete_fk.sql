-- Fixes the bug surfaced by the 20260816120000 data wipe: deleting a
-- `members` row always violated activity_logs_member_id_fkey.
--
-- log_change()'s "for whom" resolution falls back to the row's own id
-- when TG_TABLE_NAME = 'members' (there's no member_id column on
-- `members` itself, so the generic member_id-from-JSON lookup returns
-- NULL and this branch fills it in). That's correct for INSERT/UPDATE,
-- where the member row still exists at log time. For DELETE it isn't:
-- the row is already gone by the time this AFTER trigger runs, so the
-- fallback tries to INSERT a brand new activity_logs row referencing an
-- id that no longer exists. `member_id ... ON DELETE SET NULL` doesn't
-- help here -- that clause only rewrites *existing* referencing rows,
-- not a fresh insert made after the fact.
--
-- Fix: only apply the self-referential fallback on INSERT/UPDATE. A
-- `members` DELETE's log entry keeps member_id NULL -- entity_type
-- ('members') + entity_id (the deleted member's id, captured before
-- this branch runs) already say which member was removed, same as any
-- other DELETE row's entity_id does.
CREATE OR REPLACE FUNCTION public.log_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_action text;
  v_entity_id uuid;
  v_month date;
  v_diff jsonb;
  v_email text;
  v_row_date date;
  v_member_id uuid;
  v_user_id uuid;
  v_old_status text;
  v_new_status text;
  v_old_closed text;
  v_new_closed text;
BEGIN
  IF TG_OP = 'INSERT' THEN v_action := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_status := to_jsonb(OLD)->>'status';
    v_new_status := to_jsonb(NEW)->>'status';
    v_old_closed := to_jsonb(OLD)->>'is_closed';
    v_new_closed := to_jsonb(NEW)->>'is_closed';
    IF TG_TABLE_NAME IN ('expenses','meals') AND v_old_status IS DISTINCT FROM v_new_status THEN
      v_action := CASE v_new_status WHEN 'approved' THEN 'approved' WHEN 'rejected' THEN 'rejected' ELSE 'updated' END;
    ELSIF TG_TABLE_NAME = 'months' AND v_old_closed IS DISTINCT FROM v_new_closed THEN
      v_action := CASE WHEN v_new_closed::boolean THEN 'closed' ELSE 'reopened' END;
    ELSIF TG_TABLE_NAME = 'correction_requests' AND v_old_status IS DISTINCT FROM v_new_status THEN
      v_action := v_new_status;
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

  -- Resolve "for whom" independent of the diff, straight off the row
  -- (member_id for meals/deposits/correction_requests, the row itself for
  -- members on INSERT/UPDATE only -- see header comment for why DELETE is
  -- excluded --, or a member_links lookup for user_roles).
  v_member_id := CASE
    WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD)->>'member_id')::uuid
    ELSE (to_jsonb(NEW)->>'member_id')::uuid
  END;
  IF v_member_id IS NULL AND TG_TABLE_NAME = 'members' AND TG_OP <> 'DELETE' THEN
    v_member_id := v_entity_id;
  END IF;
  IF v_member_id IS NULL AND TG_TABLE_NAME = 'user_roles' THEN
    v_user_id := CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD)->>'user_id')::uuid ELSE (to_jsonb(NEW)->>'user_id')::uuid END;
    SELECT member_id INTO v_member_id FROM public.member_links WHERE user_id = v_user_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_diff := jsonb_build_object('after', to_jsonb(NEW) - 'created_at' - 'id');
  ELSIF TG_OP = 'UPDATE' THEN
    v_diff := public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW));
  ELSE
    v_diff := jsonb_build_object('before', to_jsonb(OLD) - 'created_at');
  END IF;

  IF TG_OP = 'UPDATE' AND v_diff->'before' = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_email := (auth.jwt() ->> 'email');
  EXCEPTION WHEN OTHERS THEN v_email := NULL;
  END;

  INSERT INTO public.activity_logs (actor_id, actor_email, entity_type, entity_id, action, month, diff, member_id)
  VALUES (auth.uid(), v_email, TG_TABLE_NAME, v_entity_id, v_action, v_month, v_diff, v_member_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;
