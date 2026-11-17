begin;

create table if not exists public.link_core_chat (
  seq bigint generated always as identity unique,
  kind text not null check (kind in ('public', 'direct', 'staff')),
  id text not null,
  created_at timestamptz not null,
  author text not null default '',
  sender text not null default '',
  recipient text not null default '',
  is_direct boolean generated always as (recipient <> '') stored,
  body text not null default '',
  readers text[] not null default '{}',
  image text not null default '',
  has_image boolean generated always as (image <> '') stored,
  file_id text not null default '',
  file_name text not null default '',
  file_mime text not null default '',
  file_size integer not null default 0,
  request_id text,
  primary key (kind, id)
);

alter table public.link_core_chat enable row level security;
revoke all on public.link_core_chat from anon, authenticated, public;
grant select, insert, update, delete on public.link_core_chat to service_role;
create index if not exists link_core_chat_kind_seq on public.link_core_chat (kind, seq desc);
create index if not exists link_core_chat_recipient on public.link_core_chat (kind, recipient, seq desc);
create index if not exists link_core_chat_sender on public.link_core_chat (kind, sender, seq desc);
create unique index if not exists link_core_chat_request on public.link_core_chat (request_id) where request_id is not null;

create table if not exists public.link_core_chat_signals (
  topic text primary key,
  revision bigint not null default 1
);
alter table public.link_core_chat_signals enable row level security;
revoke all on public.link_core_chat_signals from public, anon, authenticated;
grant select on public.link_core_chat_signals to authenticated;
drop policy if exists link_core_chat_subscribe on public.link_core_chat_signals;
create policy link_core_chat_subscribe on public.link_core_chat_signals
  for select to authenticated
  using (((select auth.jwt()) -> 'link_core_topics') ? topic);

do $publication$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'link_core_chat_signals') then
    alter publication supabase_realtime add table public.link_core_chat_signals;
  end if;
end
$publication$;

-- Publish only a topic and a revision, without chat content.
create or replace function public.link_core_chat_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  msg public.link_core_chat;
begin
  if current_setting('link_core.import', true) = 'on' then return null; end if;
  if TG_OP = 'DELETE' then msg := old; else msg := new; end if;
  insert into public.link_core_chat_signals (topic)
  select distinct topic from unnest(case
    when msg.kind = 'public' then array['lc-chat-public']
    when msg.kind = 'direct' then array['lc-chat-direct-admin', 'lc-chat-direct-' || msg.recipient]
    when msg.recipient = '' then array['lc-chat-staff-all']
    else array['lc-chat-staff-' || msg.sender, 'lc-chat-staff-' || msg.recipient]
  end) as topics(topic)
  order by topic
  on conflict (topic) do update set revision = public.link_core_chat_signals.revision + 1;
  return null;
end;
$$;
revoke all on function public.link_core_chat_notify() from public, anon, authenticated;
drop trigger if exists link_core_chat_notify on public.link_core_chat;
create trigger link_core_chat_notify after insert or delete or update of readers on public.link_core_chat
  for each row execute function public.link_core_chat_notify();

-- All application calls are made through GAS, after its existing session checks.
create or replace function public.link_core_chat_staff_read(message_ids text[], mailbox text)
returns void language sql security invoker set search_path = ''
as $$
  update public.link_core_chat
  set readers = array_append(readers, mailbox)
  where kind = 'staff' and id = any(message_ids)
    and sender <> mailbox and recipient in ('', mailbox)
    and not (mailbox = any(readers));
$$;
revoke all on function public.link_core_chat_staff_read(text[], text) from public, anon, authenticated;
grant execute on function public.link_core_chat_staff_read(text[], text) to service_role;

-- Do not overwrite already imported records on retry or send historical notifications.
create or replace function public.link_core_chat_import(batch jsonb)
returns integer language plpgsql security invoker set search_path = ''
as $$
declare imported integer;
begin
  perform set_config('link_core.import', 'on', true);
  insert into public.link_core_chat
    (kind,id,created_at,author,sender,recipient,body,readers,image,file_id,file_name,file_mime,file_size,request_id)
  select r.kind,r.id,r.created_at,coalesce(r.author,''),coalesce(r.sender,''),coalesce(r.recipient,''),
    coalesce(r.body,''),coalesce(r.readers,'{}'),coalesce(r.image,''),coalesce(r.file_id,''),
    coalesce(r.file_name,''),coalesce(r.file_mime,''),coalesce(r.file_size,0),r.request_id
  from jsonb_populate_recordset(null::public.link_core_chat, batch) with ordinality r
  order by r.ordinality
  on conflict (kind,id) do nothing;
  get diagnostics imported = row_count;
  return imported;
end;
$$;
revoke all on function public.link_core_chat_import(jsonb) from public, anon, authenticated;
grant execute on function public.link_core_chat_import(jsonb) to service_role;
commit;
