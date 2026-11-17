create table if not exists public.link_core_chat_write_limit (
  writer text primary key,
  last_sent_at timestamptz not null
);
alter table public.link_core_chat_write_limit enable row level security;
revoke all on public.link_core_chat_write_limit from public, anon, authenticated;

create or replace function public.link_core_chat_read_direct(
  chat_type text, room text default '', before_cursor bigint default null, page_size integer default 20
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  claims jsonb := auth.jwt();
  topics jsonb := claims -> 'link_core_topics';
  admin boolean := coalesce(topics ? 'lc-chat-direct-admin', false);
  own_mailbox text := coalesce(claims ->> 'link_core_staff_mailbox', '');
  visitor_inbox text := coalesce(claims ->> 'link_core_visitor_inbox', '');
  result jsonb;
  oldest bigint;
  size integer := greatest(1, least(200, page_size));
begin
  if not coalesce(topics ? 'lc-chat-public', false) or
    coalesce(claims ->> 'link_core_writer','') !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid chat session' using errcode = '42501';
  end if;

  if chat_type = 'visitor' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'author', case when kind='direct' then '管理者' else author end,
      'message', body, 'createdAt', created_at, 'private', kind='direct',
      'recipient', case when admin and kind='direct' then recipient else '' end,
      'hasScreenshot', kind='public' and has_image
    ) order by created_at,seq), '[]') into result
    from (
      select id, author, body, created_at, kind, recipient, has_image, seq
      from public.link_core_chat
      where kind='public' or (kind='direct' and (admin or (visitor_inbox <> '' and recipient=visitor_inbox)))
      order by created_at desc, seq desc limit 200
    ) rows;
    return jsonb_build_object('messages',result);
  end if;

  if chat_type <> 'staff' or not admin or room is null or
    (room <> '' and (own_mailbox = '' or room = own_mailbox or room !~ '^mbx-[0-9a-f]{64}$')) then
    raise exception 'Invalid chat room' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(message order by seq) filter (where n <= size), '[]'),
         case when count(*) > size then min(seq) filter (where n <= size) else null end
    into result, oldest
  from (
    select seq, row_number() over (order by seq desc) as n, jsonb_build_object(
      'id', id, 'author', author, 'senderMailbox', sender,
      'message', body, 'createdAt', created_at, 'own', own_mailbox <> '' and sender = own_mailbox,
      'readCount', cardinality(readers), 'unread', own_mailbox <> '' and sender <> own_mailbox and not own_mailbox=any(readers),
      'peerRead', case when room <> '' and sender = own_mailbox and recipient = room
        then room = any(readers) else null end,
      'private', recipient <> '', 'attachment', case when file_name <> ''
        then jsonb_build_object('name',file_name,'mime',file_mime,'size',file_size) else null end
    ) as message
    from public.link_core_chat
    where kind='staff' and (before_cursor is null or seq < before_cursor)
      and ((room='' and recipient='') or (room<>'' and
        ((sender=own_mailbox and recipient=room) or (sender=room and recipient=own_mailbox))))
    order by seq desc limit size+1
  ) rows;
  return jsonb_build_object('room',room,'messages',result,'nextCursor',oldest);
end;
$$;

create or replace function public.link_core_chat_send_direct(
  chat_type text, message text, destination text default '', message_id uuid default gen_random_uuid()
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  claims jsonb := auth.jwt();
  topics jsonb := claims -> 'link_core_topics';
  admin boolean := coalesce(topics ? 'lc-chat-direct-admin', false);
  session_writer text := coalesce(claims ->> 'link_core_writer', '');
  own_mailbox text := coalesce(claims ->> 'link_core_staff_mailbox', '');
  stamp timestamptz := statement_timestamp();
  author_name text;
begin
  if not coalesce(topics ? 'lc-chat-public', false) or session_writer !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid chat session' using errcode = '42501';
  end if;
  message := btrim(message);
  if message is null or length(message) not between 1 and 1000 or message ~ '[\x01-\x08\x0B\x0C\x0E-\x1F]' or message_id is null then
    raise exception 'メッセージは1〜1000文字で入力してください。' using errcode = '22023';
  end if;
  if chat_type='public' and destination='' then
    author_name := case when admin then '管理者' else '利用者' end;
  elsif chat_type='direct' and admin and destination ~ '^dm_[0-9a-f]{64}$' then
    author_name := '管理者';
  elsif chat_type='staff' and admin and own_mailbox ~ '^mbx-[0-9a-f]{64}$' and
    (destination='' or (destination ~ '^mbx-[0-9a-f]{64}$' and destination<>own_mailbox
      and coalesce((claims -> 'link_core_staff_recipients') ? destination, false))) then
    author_name := coalesce(nullif(claims ->> 'link_core_staff_name',''), '管理者');
  else
    raise exception '送信先を確認してください。' using errcode = '42501';
  end if;

  -- Renewing a short-lived JWT does not reset the per-login write limit.
  insert into public.link_core_chat_write_limit (writer,last_sent_at)
    values (session_writer,stamp)
    on conflict (writer) do update set last_sent_at=excluded.last_sent_at
    where public.link_core_chat_write_limit.last_sent_at <= stamp - interval '3 seconds'
       or chat_type='staff';
  if not found then
    raise exception '連続送信はできません。少し待ってから送信してください。' using errcode = 'P0001';
  end if;
  insert into public.link_core_chat(kind,id,created_at,author,sender,recipient,body)
  values (chat_type,message_id::text,stamp,author_name,case when chat_type='staff' then own_mailbox else '' end,destination,message)
  on conflict (kind,id) do nothing;
  if not found then raise exception '送信IDが重複しています。' using errcode = '23505'; end if;
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.link_core_chat_read_direct(text,text,bigint,integer) from public, anon;
revoke all on function public.link_core_chat_send_direct(text,text,text,uuid) from public, anon;
grant execute on function public.link_core_chat_read_direct(text,text,bigint,integer) to authenticated;
grant execute on function public.link_core_chat_send_direct(text,text,text,uuid) to authenticated;
