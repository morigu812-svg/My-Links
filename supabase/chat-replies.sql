alter table public.link_core_chat add column if not exists reply_to text;
alter table public.link_core_chat add constraint link_core_chat_reply_fkey
  foreign key (kind, reply_to) references public.link_core_chat(kind,id) on delete set null (reply_to);
create index link_core_chat_reply_target on public.link_core_chat(kind,reply_to) where reply_to is not null;

create function public.link_core_chat_send_reply(
  chat_type text, message text, destination text, message_id uuid, target_id text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  claims jsonb := auth.jwt();
  topics jsonb := claims -> 'link_core_topics';
  mailbox text := coalesce(claims ->> 'link_core_staff_mailbox','');
  sent jsonb;
begin
  if not coalesce(topics ? 'lc-chat-public',false) or coalesce(claims ->> 'link_core_writer','') !~ '^[0-9a-f]{64}$'
    or (chat_type in ('direct','staff') and not coalesce(topics ? 'lc-chat-direct-admin',false))
    or (chat_type='staff' and destination<>'' and
      not coalesce((claims -> 'link_core_staff_recipients') ? destination,false))
  then raise exception 'Invalid chat session' using errcode='42501'; end if;
  if not exists (
    select 1 from public.link_core_chat target
    where target.kind=chat_type and target.id=target_id
      and ((chat_type='public' and destination='' and target.recipient='') or
        (chat_type='direct' and destination=target.recipient) or
        (chat_type='staff' and (
          (destination='' and target.recipient='') or
          (mailbox<>'' and destination<>'' and (
            (target.sender=mailbox and target.recipient=destination) or
            (target.sender=destination and target.recipient=mailbox))))))
    for key share
  ) then raise exception '返信先のメッセージが見つかりません。' using errcode='22023'; end if;

  sent := public.link_core_chat_send_direct(chat_type,message,destination,message_id);
  update public.link_core_chat set reply_to=target_id
    where kind=chat_type and id=message_id::text;
  return sent;
end;
$$;

create function public.link_core_chat_read_replies(
  chat_type text, room text default '', before_cursor bigint default null, page_size integer default 20
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  page jsonb;
  messages jsonb;
begin
  page := public.link_core_chat_read_direct(chat_type,room,before_cursor,page_size);
  select coalesce(jsonb_agg(
    case when target.id is null then m.item else m.item || jsonb_build_object(
      'reply',jsonb_build_object(
        'author',coalesce(nullif(target.author,''),case when target.kind='staff' then '管理者' end,'利用者'),
        'senderMailbox',target.sender,
        'message',left(case when target.body<>'' then target.body when target.file_name<>'' then target.file_name else 'メッセージ' end,120)
      )
    ) end order by m.ordinal), '[]'::jsonb) into messages
  from jsonb_array_elements(page->'messages') with ordinality as m(item,ordinal)
  left join public.link_core_chat posted on posted.id=m.item->>'id'
    and posted.kind=case when chat_type='staff' then 'staff' when (m.item->>'private')::boolean then 'direct' else 'public' end
  left join public.link_core_chat target on target.id=posted.reply_to and target.kind=posted.kind
    and ((posted.kind<>'staff' and target.recipient=posted.recipient) or
      (posted.kind='staff' and (
        (target.recipient='' and posted.recipient='') or
        (posted.recipient<>'' and ((target.sender=posted.sender and target.recipient=posted.recipient) or
          (target.sender=posted.recipient and target.recipient=posted.sender))))));
  return jsonb_set(page,'{messages}',messages);
end;
$$;
revoke all on function public.link_core_chat_send_reply(text,text,text,uuid,text) from public,anon;
revoke all on function public.link_core_chat_read_replies(text,text,bigint,integer) from public,anon;
grant execute on function public.link_core_chat_send_reply(text,text,text,uuid,text) to authenticated;
grant execute on function public.link_core_chat_read_replies(text,text,bigint,integer) to authenticated;
