-- Fresh start: erase all mess bookkeeping data and remove every auth
-- account except the super_admin (absaralvee23@gmail.com,
-- e4afbd3a-61eb-4029-ae76-43830baf6bd7). Requested directly by that
-- account's owner. `signup_allowlist` is intentionally left untouched so
-- previously-allowlisted emails can still sign back up.
--
-- Order: children before parents so nothing relies on cascade timing.
-- `activity_logs` is wiped last, after every other DELETE above has
-- already fired trg_log_* and re-populated it, so the log ends up empty
-- too rather than full of "deleted" entries for a database nobody will
-- ever look at again.
--
-- trg_log_members has to be disabled around the `members` delete: its
-- AFTER-DELETE branch logs with member_id set to the just-deleted row's
-- own id (log_change()'s TG_TABLE_NAME = 'members' branch), which is a
-- brand new INSERT referencing an id that no longer exists -- violates
-- activity_logs_member_id_fkey immediately, unlike the ON DELETE SET
-- NULL clause on that FK which only rewrites *existing* rows. Pre-
-- existing latent bug (deleting any member row hits this today), not
-- something introduced by this migration -- worth a real fix separately.

DELETE FROM public.bill_items;
DELETE FROM public.bills_v2;
DELETE FROM public.bills;
DELETE FROM public.correction_requests;
DELETE FROM public.member_away_periods;
DELETE FROM public.meals;
DELETE FROM public.deposits;
DELETE FROM public.expenses;
DELETE FROM public.months;
DELETE FROM public.member_links;

ALTER TABLE public.members DISABLE TRIGGER trg_log_members;
DELETE FROM public.members;
ALTER TABLE public.members ENABLE TRIGGER trg_log_members;

-- Cascades to public.profiles and public.user_roles (both FK auth.users
-- ON DELETE CASCADE) and to Supabase's own auth.identities/sessions/
-- refresh_tokens for every deleted user.
DELETE FROM auth.users WHERE id <> 'e4afbd3a-61eb-4029-ae76-43830baf6bd7';

DELETE FROM public.activity_logs;
