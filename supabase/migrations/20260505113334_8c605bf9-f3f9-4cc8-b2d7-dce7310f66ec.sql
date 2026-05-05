-- Allow members to manage their own meals via member_links, when month not closed
CREATE POLICY "Member insert own meals"
ON public.meals
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.member_links ml
    WHERE ml.user_id = auth.uid() AND ml.member_id = meals.member_id
  )
  AND NOT public.is_month_closed(date)
);

CREATE POLICY "Member update own meals"
ON public.meals
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.member_links ml
    WHERE ml.user_id = auth.uid() AND ml.member_id = meals.member_id
  )
  AND NOT public.is_month_closed(date)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.member_links ml
    WHERE ml.user_id = auth.uid() AND ml.member_id = meals.member_id
  )
  AND NOT public.is_month_closed(date)
);

CREATE POLICY "Member delete own meals"
ON public.meals
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.member_links ml
    WHERE ml.user_id = auth.uid() AND ml.member_id = meals.member_id
  )
  AND NOT public.is_month_closed(date)
);