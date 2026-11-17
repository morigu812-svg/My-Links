create table public.link_core_visitor_chat_identity (
  browser_id text primary key check (browser_id ~ '^[A-Za-z0-9_-]{8,100}$'),
  inbox text not null check (inbox ~ '^dm_[0-9a-f]{64}$')
);
alter table public.link_core_visitor_chat_identity enable row level security;
revoke all on public.link_core_visitor_chat_identity from public, anon, authenticated;
grant select, insert on public.link_core_visitor_chat_identity to service_role;

create function public.link_core_bind_visitor_chat(browser text, inbox_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.link_core_visitor_chat_identity (browser_id,inbox) values (browser,inbox_id)
  on conflict (browser_id) do nothing;
  return exists (select 1 from public.link_core_visitor_chat_identity where browser_id=browser and inbox=inbox_id);
end;
$$;
revoke all on function public.link_core_bind_visitor_chat(text,text) from public, anon, authenticated;
grant execute on function public.link_core_bind_visitor_chat(text,text) to service_role;

create function public.link_core_visitor_dm(operation text, browser text default '', message text default '', message_id uuid default null, before_cursor bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  claims jsonb := auth.jwt();
  topics jsonb := claims -> 'link_core_topics';
  admin boolean := coalesce(topics ? 'lc-chat-direct-admin',false);
  bound_browser text := coalesce(claims ->> 'link_core_visitor_browser','');
  session_writer text := coalesce(claims ->> 'link_core_writer','');
  target text;
  result jsonb;
  next_cursor bigint;
  sent_at timestamptz := statement_timestamp();
begin
  if not coalesce(topics ? 'lc-chat-public',false) or session_writer !~ '^[0-9a-f]{64}$' then
    raise exception '個人トークにはログインが必要です。' using errcode='42501';
  end if;
  if operation='list' then
    if not admin then raise exception '管理者専用です。' using errcode='42501'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('browserId',substr(recipient,4),
      'lastMessage',left(body,90),'createdAt',created_at) order by seq desc),'[]'::jsonb) into result
    from (select distinct on (recipient) recipient,body,created_at,seq from public.link_core_chat
      where kind='direct' and left(recipient,3)='vb_' order by recipient,seq desc) rooms;
    return jsonb_build_object('rooms',result);
  end if;

  if not admin and browser<>'' and browser<>bound_browser then
    raise exception 'このトークにはアクセスできません。' using errcode='42501';
  end if;
  browser := case when admin then browser else bound_browser end;
  if browser is null or browser !~ '^[A-Za-z0-9_-]{8,100}$' then
    raise exception '個人トークを使うには利用者がページに再ログインしてください。' using errcode='42501';
  end if;
  target := 'vb_' || browser;
  if operation='read' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'author',author,'message',body,
      'createdAt',created_at,'own',case when admin then author='管理者' else author='利用者' end)
      order by seq) filter (where n <= 100),'[]'::jsonb),
      case when count(*)>100 then min(seq) filter (where n<=100) else null end
      into result,next_cursor
    from (
      select id,author,body,created_at,seq,row_number() over(order by seq desc) as n from public.link_core_chat
      where kind='direct' and recipient=target and (before_cursor is null or seq<before_cursor)
      order by seq desc limit 101
    ) rows;
    return jsonb_build_object('messages',result,'nextCursor',next_cursor);
  elsif operation='send' then
    if not exists (select 1 from public.link_core_visitor_chat_identity where browser_id=browser) then
      raise exception 'この利用者はまだ個人トークに接続していません。最新版の利用者ページに再ログインすると送信できます。' using errcode='22023';
    end if;
    message := btrim(message);
    if message_id is null or message is null or length(message) not between 1 and 1000 then
      raise exception 'メッセージは1〜1000文字で入力してください。' using errcode='22023';
    end if;
    insert into public.link_core_chat_write_limit(writer,last_sent_at) values(session_writer,sent_at)
      on conflict(writer) do update set last_sent_at=excluded.last_sent_at
      where public.link_core_chat_write_limit.last_sent_at<=sent_at-interval '2 seconds';
    if not found then raise exception '少し待ってから再送してください。'; end if;
    insert into public.link_core_chat(kind,id,created_at,author,recipient,body)
      values('direct',message_id::text,sent_at,case when admin then '管理者' else '利用者' end,target,message);
    return jsonb_build_object('ok',true);
  end if;
  raise exception '個人トークの操作を確認してください。' using errcode='22023';
end;
$$;
revoke all on function public.link_core_visitor_dm(text,text,text,uuid,bigint) from public, anon;
grant execute on function public.link_core_visitor_dm(text,text,text,uuid,bigint) to authenticated;

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
      where kind='public' or (kind='direct' and left(recipient,3)='dm_' and (admin or (visitor_inbox <> '' and recipient=visitor_inbox)))
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

