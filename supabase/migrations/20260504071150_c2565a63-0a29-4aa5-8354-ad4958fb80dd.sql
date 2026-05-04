
CREATE OR REPLACE FUNCTION public.enforce_month_not_closed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_date date;
  v_new_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old_date := (to_jsonb(OLD)->>'date')::date;
    IF public.is_month_closed(v_old_date) THEN
      RAISE EXCEPTION 'Month is closed for %; cannot delete records dated %', TG_TABLE_NAME, v_old_date
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  v_new_date := (to_jsonb(NEW)->>'date')::date;
  IF public.is_month_closed(v_new_date) THEN
    RAISE EXCEPTION 'Month is closed for %; cannot write records dated %', TG_TABLE_NAME, v_new_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_date := (to_jsonb(OLD)->>'date')::date;
    IF v_old_date IS DISTINCT FROM v_new_date AND public.is_month_closed(v_old_date) THEN
      RAISE EXCEPTION 'Original month is closed for %; cannot move records out of %', TG_TABLE_NAME, v_old_date
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_month_not_closed() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_meals_month_lock ON public.meals;
CREATE TRIGGER trg_meals_month_lock
BEFORE INSERT OR UPDATE OR DELETE ON public.meals
FOR EACH ROW EXECUTE FUNCTION public.enforce_month_not_closed();

DROP TRIGGER IF EXISTS trg_expenses_month_lock ON public.expenses;
CREATE TRIGGER trg_expenses_month_lock
BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.enforce_month_not_closed();
