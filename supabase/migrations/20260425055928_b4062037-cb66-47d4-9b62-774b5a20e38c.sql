-- Fix mutable search path on jsonb_diff
CREATE OR REPLACE FUNCTION public.jsonb_diff(old jsonb, new jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'before', COALESCE(jsonb_object_agg(key, old->key) FILTER (WHERE old->key IS DISTINCT FROM new->key), '{}'::jsonb),
    'after',  COALESCE(jsonb_object_agg(key, new->key) FILTER (WHERE old->key IS DISTINCT FROM new->key), '{}'::jsonb)
  )
  FROM (
    SELECT key FROM jsonb_object_keys(old) AS k(key)
    UNION
    SELECT key FROM jsonb_object_keys(new) AS k(key)
  ) keys
  WHERE key NOT IN ('id', 'created_at', 'updated_at');
$$;

-- Tighten activity_logs INSERT: only authenticated users can write (triggers run with caller context)
DROP POLICY IF EXISTS "Auth insert activity_logs" ON public.activity_logs;
CREATE POLICY "Auth insert activity_logs" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);