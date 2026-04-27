-- Allow members to view their own member row's link target via current_member_id() (already exists)
-- Add server-side apply function for approved corrections.

CREATE OR REPLACE FUNCTION public.apply_correction(_request_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.correction_requests%ROWTYPE;
  v_member_id uuid;
  v_date date;
  v_meal_count numeric;
  v_is_active boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO r FROM public.correction_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF r.status <> 'open' THEN
    RAISE EXCEPTION 'Request is not open';
  END IF;

  IF r.entity_type = 'meals' THEN
    v_member_id := COALESCE(r.member_id, (r.requested_value->>'member_id')::uuid);
    v_date      := COALESCE((r.requested_value->>'date')::date, CURRENT_DATE);
    v_meal_count := COALESCE((r.requested_value->>'meal_count')::numeric, 0);

    IF v_member_id IS NULL THEN
      RAISE EXCEPTION 'Member not linked to request';
    END IF;
    IF public.is_month_closed(v_date) THEN
      RAISE EXCEPTION 'Month is closed for that date';
    END IF;

    INSERT INTO public.meals (member_id, date, meal_count)
    VALUES (v_member_id, v_date, v_meal_count)
    ON CONFLICT (member_id, date) DO UPDATE SET meal_count = EXCLUDED.meal_count;

  ELSIF r.entity_type = 'members' THEN
    v_member_id := COALESCE(r.member_id, (r.requested_value->>'member_id')::uuid);
    v_is_active := (r.requested_value->>'is_active')::boolean;

    IF v_member_id IS NULL THEN
      RAISE EXCEPTION 'Member not linked to request';
    END IF;
    IF v_is_active IS NULL THEN
      RAISE EXCEPTION 'requested_value.is_active required';
    END IF;

    UPDATE public.members SET is_active = v_is_active WHERE id = v_member_id;

  ELSE
    RAISE EXCEPTION 'apply_correction does not support entity_type %', r.entity_type;
  END IF;

  UPDATE public.correction_requests
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = COALESCE(_note, review_note)
  WHERE id = _request_id;
END;
$$;

-- Ensure meals has unique constraint for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meals_member_id_date_key'
  ) THEN
    ALTER TABLE public.meals ADD CONSTRAINT meals_member_id_date_key UNIQUE (member_id, date);
  END IF;
END$$;