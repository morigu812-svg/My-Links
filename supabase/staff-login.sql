create or replace function public.link_core_check_staff_login()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from link_core_private.staff_accounts a
    where a.user_id = auth.uid() and a.mailbox = (auth.jwt()->>'link_core_staff_mailbox')
  );
$$;
revoke all on function public.link_core_check_staff_login() from public, anon;
grant execute on function public.link_core_check_staff_login() to authenticated;
