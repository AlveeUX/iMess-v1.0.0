I found the real cause: this is not a frontend-only loading issue anymore. The logged-in account is correctly assigned the `admin` role in `user_roles`, but Supabase is returning `permission denied for function has_role` for role checks. Because the app cannot execute `has_role`, `useAuth` loads no roles, so `isAdmin` stays false and all admin-only UI/actions disappear. The same missing grant is also breaking RLS policies on several admin tables.

Plan:

1. Add a Supabase migration to restore safe execute permissions on required helper functions
   - Grant `authenticated` access to `public.has_role(uuid, app_role)` so RLS policies and the app can evaluate admin/member roles again.
   - Grant `authenticated` access to `public.current_member_id()` because member-scoped policies rely on it.
   - Keep both functions as `SECURITY DEFINER` with `search_path = public`, so the roles table remains protected and role checks do not recurse.

2. Fix the Members page data permission mismatch
   - The app now reads `seat_name` and `rent_amount` from `members`, but an older privacy migration only granted select access to `id, name, room, is_active, created_at`.
   - Update column grants so authenticated users can read non-sensitive member columns: `id`, `name`, `room`, `seat_name`, `rent_amount`, `is_active`, `created_at`.
   - Continue keeping `phone` out of normal table reads; admins still access phone numbers through the protected `admin_list_members_with_phone()` RPC.
   - Update that RPC return shape to include `seat_name` and `rent_amount` as well, so admin edit forms have complete member data if needed.

3. Fix recursive bill RLS policies that are generating 500 errors
   - Current `bills_v2` SELECT policy references `bill_items`, while `bill_items` SELECT policy references `bills_v2`, causing infinite recursion.
   - Replace the cross-table recursive visibility checks with security-definer helper functions, then rewrite those policies to use the helper functions.
   - Preserve intended behavior: admins see/manage all bills; members can see utility bills and their own member-linked bill items.

4. Make auth role loading more resilient in the UI
   - Update `useAuth` so if role loading fails, it records/logs the error and does not silently treat the user as a non-admin without feedback.
   - Ensure the loading spinner remains until role loading finishes successfully or fails clearly.

5. Verify after changes
   - Confirm the admin user can execute `has_role` through the app-facing path.
   - Confirm `/members` can query the member list without 403.
   - Confirm `useAuth` receives `admin` for `absaralvee23@gmail.com` so the “Add member” button and admin settings render immediately.
   - Confirm the bill queries no longer hit infinite-recursion errors.

This will restore the Add member button and the rest of the admin functionality without storing roles in unsafe client-side storage.