-- The Transparency page ("append-only audit trail") is shown to every
-- signed-in user with no role gating in the frontend (nav link, route, and
-- copy all assume mess-wide visibility) — but a prior security-hardening
-- pass (20260504065448) narrowed activity_logs SELECT to admins only,
-- leaving non-admins looking at an empty log. Revert to the original
-- "everyone signed in sees the same thing" policy, matching every other
-- shared read table in this schema (members, meals, deposits, expenses).
DROP POLICY IF EXISTS "Admin view activity_logs" ON public.activity_logs;
CREATE POLICY "Auth view activity_logs" ON public.activity_logs
  FOR SELECT TO authenticated USING (true);

-- "For whom" a change was made needs to survive plain UPDATEs (e.g.
-- approving a deposit/meal/bazar entry), where member_id itself never
-- changes and so never appears in the diff delta. Capture it as its own
-- column at log time instead of trying to reconstruct it from the diff.
ALTER TABLE public.activity_logs
  ADD COLUMN member_id uuid REFERENCES public.members(id) ON DELETE SET NULL;

CREATE INDEX idx_activity_member ON public.activity_logs(member_id);

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
