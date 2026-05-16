## Goal
Reset the project to a blank slate so you can re-test the system from sign-up onward. First user to sign up after the wipe becomes `admin` automatically (per existing `handle_new_user` trigger).

## What gets deleted

**App tables (all rows)**
- activity_logs
- correction_requests
- bill_items, bills_v2, bills
- expenses
- deposits
- meals
- months
- member_links
- members
- signup_allowlist
- user_roles
- profiles

**Auth**
- All users in `auth.users` (cascades will remove any lingering references)

## What stays
- All table structures, RLS policies, triggers, functions
- All migrations, edge functions, secrets
- Frontend code

## How
Run a single migration (transactional) that:
1. `TRUNCATE` all app tables with `RESTART IDENTITY CASCADE`
2. `DELETE FROM auth.users` (will cascade to profiles/roles/member_links via FKs to auth.users where present; truncating those first makes it clean regardless)

Note: this normally violates the "don't modify `auth` schema" rule, but a one-off `DELETE FROM auth.users` for a test reset is safe — no schema/trigger changes.

## After
- Open the app → you'll be signed out (your user no longer exists)
- Sign up fresh → you become the first user → auto-granted `admin` role
- Re-add allowlist emails, members, etc. as needed

⚠️ This is irreversible. Confirm to proceed.