TRUNCATE TABLE
  public.activity_logs,
  public.correction_requests,
  public.bill_items,
  public.bills_v2,
  public.bills,
  public.expenses,
  public.deposits,
  public.meals,
  public.months,
  public.member_links,
  public.members,
  public.signup_allowlist,
  public.user_roles,
  public.profiles
RESTART IDENTITY CASCADE;

DELETE FROM auth.users;