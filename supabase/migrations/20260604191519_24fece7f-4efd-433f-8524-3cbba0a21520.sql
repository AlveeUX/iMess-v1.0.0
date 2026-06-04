
DROP POLICY IF EXISTS "Admin or contributor insert expenses" ON public.expenses;

CREATE POLICY "Authenticated insert expenses"
ON public.expenses
FOR INSERT
TO authenticated
WITH CHECK (NOT is_month_closed(date));

CREATE POLICY "Member update own pending expense"
ON public.expenses
FOR UPDATE
TO authenticated
USING (
  submitted_by = auth.uid()
  AND status = 'pending'
  AND NOT is_month_closed(date)
)
WITH CHECK (
  submitted_by = auth.uid()
  AND status = 'pending'
  AND NOT is_month_closed(date)
);

CREATE POLICY "Member delete own pending expense"
ON public.expenses
FOR DELETE
TO authenticated
USING (
  submitted_by = auth.uid()
  AND status = 'pending'
  AND NOT is_month_closed(date)
);
