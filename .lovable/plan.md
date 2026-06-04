## Problem

A signed-in member sees the Bazar page but no "Submit bazar" button. They can't add, edit, or delete their own bazar entries.

## Root cause

Two separate gates:

1. **Frontend:** In `src/pages/Bazar.tsx` the Submit button and the Delete button are gated on `isContributor` / `isAdmin`. `isContributor` requires the `bazar_contributor` role — plain `member` users never qualify.
2. **Backend (RLS on `expenses`):** The `INSERT` policy requires `admin/super_admin` or `bazar_contributor`. The `UPDATE` / `DELETE` policies are admin-only. So even if the UI showed the button, the DB would reject a member.

The existing `enforce_expense_submission` trigger already forces non-admin inserts to `status='pending'`, so opening this up is safe.

## Plan

### 1. Database (RLS on `expenses`)

Allow any authenticated user to:
- **INSERT** an expense (trigger forces `pending` + sets `submitted_by`).
- **UPDATE** their own row only while `status = 'pending'` and the month isn't closed.
- **DELETE** their own row only while `status = 'pending'` and the month isn't closed.

Admin policies stay unchanged. Approved/rejected entries become read-only for the member (admin can still edit/delete).

### 2. Frontend (`src/pages/Bazar.tsx`)

- Show the **Submit bazar** button to every signed-in user (not just `isContributor`).
- Add an **Edit** action for the member on rows where `submitted_by === user.id && status === 'pending'`. Reuses the same dialog.
- Show the **Delete** (trash) button for the member on their own `pending` rows. Admins keep delete on everything.
- Approved/rejected rows owned by the member render read-only (status badge + review note already shown).

### 3. No changes to

- `bazar_contributor` role — keeps working as a convenience role, but is no longer required.
- Auth, allowlist, signup flow, other pages.

## Validation

- As member: Submit bazar → row appears with `Pending` badge; Edit and Delete buttons visible.
- As member: After admin approves → Edit/Delete buttons disappear on that row.
- As admin (desktop): existing review/approve/delete flow unchanged; member-submitted row appears in Pending tab.
- DB check: a member trying to UPDATE someone else's row or a non-pending row is rejected by RLS.
