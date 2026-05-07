## Why Shahad can't edit anything

Looking at the database:

- Auth user `shahadisraq@gmail.com` exists with role `member` but has **no row in `member_links`**, so RLS treats him as "no member" — he cannot insert/update meals, and `current_member_id()` returns null.
- The members table has a `Shahad` row, but it's never connected to his user id.
- Bazar (expenses) insert requires role `admin` OR `bazar_contributor`. Shahad only has `member`, so the bazar form/button is hidden and inserts would be blocked.
- Deposits insert is **admin-only by design** (see `deposits` RLS + `Deposits.tsx` button gated on `isAdmin`). Members are not supposed to add deposits themselves — admin records them. We should keep this behavior unless you say otherwise.

So this is a missing **member↔user link** plus a missing **bazar_contributor role**, not a bug in the pages.

## Plan

### 1. One-time data fix (migration)
- Insert into `member_links`: link member `Shahad` (`f603bf6f-…`) ↔ user `shahadisraq@gmail.com` (`f86120f3-…`).
- Insert into `user_roles`: give that user the `bazar_contributor` role (in addition to `member`) so he can submit bazar entries for admin approval.

After this, Shahad will be able to:
- Add/edit/delete his own meals on the calendar (RLS already allows member-owned meals).
- Submit bazar entries (they'll go to `pending` until an admin approves).

### 2. UI: manage member↔user link and roles from the Members page (admin only)
On each member card, add a small admin-only "Account" section:
- Show which auth user (email) is linked, if any.
- "Link account" dropdown listing auth users (from `profiles` joined with email — we'll fetch via a new SECURITY DEFINER RPC `admin_list_auth_users()` returning `id, email, display_name`, since `auth.users` isn't directly readable).
- "Unlink" button.
- Role checkboxes: Admin / Bazar contributor (writes to `user_roles`).

This way you won't have to run SQL again next time you add a member.

### 3. Keep deposits admin-only
No change. If you want members to record their own deposits too, tell me and I'll add a "submit deposit for approval" flow mirroring how bazar works (pending → admin approves).

## Technical details
- New migration:
  - `INSERT INTO member_links (member_id, user_id) VALUES (...)` for Shahad.
  - `INSERT INTO user_roles (user_id, role) VALUES (..., 'bazar_contributor')`.
  - New RPC `admin_list_auth_users()` (SECURITY DEFINER, admin-only) returning `id, email, display_name` from `auth.users` joined with `profiles`.
- `src/pages/Members.tsx`: fetch linked-account info + auth users list (admin only); add "Account & roles" controls per card calling `member_links` insert/delete and `user_roles` insert/delete.
- No changes to RLS policies — existing ones already do the right thing once the link + role exist.
