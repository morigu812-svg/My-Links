-- Register public.link_core_staff_auth_hook as the Custom Access Token Hook.
create schema if not exists link_core_private;
create table if not exists link_core_private.staff_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mailbox text not null unique check (mailbox ~ '^mbx-[0-9a-f]{64}$'),
  display_name text not null
);
alter table link_core_private.staff_accounts enable row level security;
revoke all on schema link_core_private from public, anon, authenticated;

create or replace function public.link_core_staff_auth_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  account link_core_private.staff_accounts%rowtype;
  claims jsonb := event->'claims';
begin
  select * into account from link_core_private.staff_accounts
    where user_id = (event->>'user_id')::uuid;
  if not found then return event; end if;
  claims := claims || jsonb_build_object(
    'link_core_topics', jsonb_build_array('lc-chat-public','lc-chat-direct-admin',
      'lc-chat-staff-all','lc-chat-staff-' || account.mailbox),
    'link_core_staff_mailbox', account.mailbox,
    'link_core_staff_name', account.display_name,
    'link_core_writer', encode(sha256(convert_to(account.user_id::text,'UTF8')),'hex'),
    'link_core_staff_recipients', coalesce((
      select jsonb_agg(mailbox) from link_core_private.staff_accounts
      where user_id <> account.user_id
    ), '[]'::jsonb)
  );
  return jsonb_set(event, '{claims}', claims);
end;
$$;
revoke all on function public.link_core_staff_auth_hook(jsonb) from public, anon, authenticated;
grant execute on function public.link_core_staff_auth_hook(jsonb) to supabase_auth_admin;
