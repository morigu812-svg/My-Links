begin;
create or replace function public.link_core_staff_summary(mailbox text, include_conversations boolean default false)
returns jsonb language sql stable security invoker set search_path = ''
as $$
with recent as materialized (
  select sender,recipient,readers,seq from public.link_core_chat
  where kind='staff' and (recipient='' or (mailbox<>'' and (sender=mailbox or recipient=mailbox)))
  order by seq desc limit 200
), unread as (
  select * from recent where mailbox<>'' and sender<>mailbox and not mailbox=any(readers)
), peers as (
  select case when sender=mailbox then recipient else sender end as peer,max(seq) as last_seq
  from public.link_core_chat
  where include_conversations and mailbox<>'' and kind='staff' and recipient<>''
    and (sender=mailbox or recipient=mailbox)
  group by case when sender=mailbox then recipient else sender end
)
select jsonb_build_object(
  'messages','[]'::jsonb,'nextCursor',null,
  'unreadCount',(select count(*) from unread),
  'latestUnreadRoom',(select case when recipient<>'' then nullif(sender,'') else '' end from unread order by seq desc limit 1)
) || case when include_conversations then jsonb_build_object('conversations',
  coalesce((select jsonb_agg(jsonb_build_object('mailboxId',peer) order by last_seq desc) from peers where peer<>''),'[]'::jsonb))
  else '{}'::jsonb end;
$$;
revoke all on function public.link_core_staff_summary(text,boolean) from public,anon,authenticated;
grant execute on function public.link_core_staff_summary(text,boolean) to service_role;
commit;
