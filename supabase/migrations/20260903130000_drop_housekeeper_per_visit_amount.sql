-- per_visit_amount is no longer stored. It's now always derived on the fly
-- as monthly_rent / (visits_per_day × days_in_month), computed client-side
-- (see calculatePerVisitAmount in src/hooks/useHousekeeper.ts) so it stays
-- correct for any month without needing a rent-change-history mechanism.
-- Lossy but intentional: any previously manually-entered value is discarded.
ALTER TABLE public.housekeeper DROP COLUMN per_visit_amount;
