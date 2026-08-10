
-- 1) Link column on deposits
ALTER TABLE public.deposits
  ADD COLUMN IF NOT EXISTS source_expense_id uuid REFERENCES public.expenses(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS deposits_source_expense_uniq
  ON public.deposits(source_expense_id) WHERE source_expense_id IS NOT NULL;

-- 2) Sync function: keep a deposit row mirrored to each bazar/expense
CREATE OR REPLACE FUNCTION public.sync_bazar_deposit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT member_id INTO v_member FROM public.member_links WHERE user_id = NEW.submitted_by;
    IF v_member IS NULL THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.deposits (
      member_id, amount, method, date, note, status,
      submitted_by, source_expense_id,
      reviewed_by, reviewed_at, review_note
    ) VALUES (
      v_member, NEW.amount, 'bazar', NEW.date,
      'Auto: ' || COALESCE(NEW.title, 'bazar'),
      NEW.status,
      NEW.submitted_by, NEW.id,
      NEW.reviewed_by, NEW.reviewed_at,
      CASE WHEN NEW.status IN ('approved','rejected')
           THEN 'Auto with bazar' || COALESCE(' — ' || NEW.review_note, '')
           ELSE NULL END
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- If a linked deposit exists, mirror changes
    UPDATE public.deposits
       SET amount = NEW.amount,
           date = NEW.date,
           note = 'Auto: ' || COALESCE(NEW.title, 'bazar'),
           status = NEW.status,
           reviewed_by = NEW.reviewed_by,
           reviewed_at = NEW.reviewed_at,
           review_note = CASE WHEN NEW.status IN ('approved','rejected')
                              THEN 'Auto with bazar' || COALESCE(' — ' || NEW.review_note, '')
                              ELSE NULL END
     WHERE source_expense_id = NEW.id;

    IF NOT FOUND THEN
      -- Lazy-create if submitter became linked after the bazar existed
      SELECT member_id INTO v_member FROM public.member_links WHERE user_id = NEW.submitted_by;
      IF v_member IS NOT NULL THEN
        INSERT INTO public.deposits (
          member_id, amount, method, date, note, status,
          submitted_by, source_expense_id,
          reviewed_by, reviewed_at, review_note
        ) VALUES (
          v_member, NEW.amount, 'bazar', NEW.date,
          'Auto: ' || COALESCE(NEW.title, 'bazar'),
          NEW.status,
          NEW.submitted_by, NEW.id,
          NEW.reviewed_by, NEW.reviewed_at,
          CASE WHEN NEW.status IN ('approved','rejected')
               THEN 'Auto with bazar' || COALESCE(' — ' || NEW.review_note, '')
               ELSE NULL END
        );
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bazar_deposit ON public.expenses;
CREATE TRIGGER trg_sync_bazar_deposit
AFTER INSERT OR UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.sync_bazar_deposit();
