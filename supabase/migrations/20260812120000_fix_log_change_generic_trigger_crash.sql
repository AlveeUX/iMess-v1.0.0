-- log_change() is one generic AFTER-trigger function attached to nearly
-- every table (meals, deposits, expenses, members, months, user_roles,
-- correction_requests, bills_v2, bill_items, ...). Its UPDATE branch used
-- direct OLD.status / OLD.is_closed / NEW.status / NEW.is_closed field
-- access to label the action ("approved"/"rejected"/"closed"/...). Those
-- columns don't exist on every table the trigger fires on (e.g. `meals`
-- and `deposits` have no `is_closed`, `months` has no `status`), and
-- referencing a field that doesn't exist on OLD/NEW's actual row type
-- throws 42703 ("record has no field ...") the moment that branch's
-- condition is evaluated -- even when the TG_TABLE_NAME guard ahead of it
-- would make the branch false, because RECORD field resolution isn't
-- short-circuited the way a plain boolean would be.
--
-- Net effect since 20260811190000 shipped: almost every UPDATE on almost
-- every table hit whichever branch didn't match its own table and
-- crashed with a 400 -- including admin approving/rejecting a pending
-- meal (Meals.tsx save/reject), a member editing their own pending/
-- rejected meal, deposit reviews, member edits, and closing/reopening a
-- month. INSERTs and DELETEs were unaffected (they don't reach this
-- branch at all), and UPDATEs on `expenses` that actually changed
-- `status` were unaffected too (that branch matches first and short-
-- circuits before reaching the broken ones) -- which is why bazar
-- approve/reject looked fine while meal approvals silently 400'd.
--
-- Fix: use the same to_jsonb(...)->>'field' pattern already used
-- elsewhere in this same function (for `date`/`month`/`member_id`) for
-- every OLD/NEW field access in the UPDATE branch, since jsonb key
-- lookup on a missing key returns NULL instead of erroring. Also added
-- a `meals` status branch (mirroring the existing `expenses` one) so
-- meal approvals/rejections log as "approved"/"rejected" instead of a
-- generic "updated", now that meals carries the same status column.
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
  -- members, or a member_links lookup for user_roles).
  v_member_id := CASE
    WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD)->>'member_id')::uuid
    ELSE (to_jsonb(NEW)->>'member_id')::uuid
  END;
  IF v_member_id IS NULL AND TG_TABLE_NAME = 'members' THEN
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
