alter table public.link_base_broadcasts add column approval_status text not null default 'pending' check(approval_status in ('pending','approved','rejected'));
update public.link_base_broadcasts set approval_status='approved';
alter table public.link_base_broadcasts alter column active set default false;
drop policy broadcast_admin on public.link_base_broadcasts;
drop policy broadcast_read on public.link_base_broadcasts;
create policy broadcast_read on public.link_base_broadcasts for select to authenticated using (
coalesce((auth.jwt()->>'link_base_reviewer')::boolean,false) or auth.jwt()->'link_core_topics' ? 'lc-chat-direct-admin' or (active and approval_status='approved' and auth.jwt()->'link_core_topics' ? 'lc-chat-public'));
create policy broadcast_submit on public.link_base_broadcasts for insert to authenticated with check (
(auth.jwt()->'link_core_topics' ? 'lc-chat-direct-admin' or coalesce((auth.jwt()->>'link_base_reviewer')::boolean,false)) and approval_status='pending' and not active);
create policy broadcast_review on public.link_base_broadcasts for update to authenticated using (coalesce((auth.jwt()->>'link_base_reviewer')::boolean,false)) with check (coalesce((auth.jwt()->>'link_base_reviewer')::boolean,false));
create policy answer_reviewer on public.link_base_survey_answers for select to authenticated using (coalesce((auth.jwt()->>'link_base_reviewer')::boolean,false));

create or replace function public.link_base_broadcast_api(operation text,payload jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_column
declare result jsonb; b public.link_base_broadcasts; q jsonb; a jsonb; n integer:=0; reviewer boolean:=coalesce((auth.jwt()->>'link_base_reviewer')::boolean,false); staff boolean:=coalesce(auth.jwt()->'link_core_topics' ? 'lc-chat-direct-admin',false);
begin
 if not coalesce(auth.jwt()->'link_core_topics' ? 'lc-chat-public',false) then raise exception 'ログインしてください'; end if;
 staff:=staff or reviewer;
 if operation='list' then
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]') into result from (
 select b.*,exists(select 1 from public.link_base_survey_answers r where r.broadcast_id=b.id and r.browser_id=auth.jwt()->>'link_core_visitor_browser') answered,
 (select count(*) from public.link_base_survey_answers r where r.broadcast_id=b.id) response_count
 from public.link_base_broadcasts b order by b.created_at desc limit 100) t; return result;
 elsif operation='publish' and staff then
 if payload->>'kind'='survey' then
 if jsonb_typeof(payload->'questions') is distinct from 'array' or jsonb_array_length(payload->'questions') not between 1 and 20 then raise exception '質問は1〜20問にしてください'; end if;
 for q in select value from jsonb_array_elements(payload->'questions') loop
 if length(trim(q->>'title')) not between 1 and 300 or q->>'type' not in ('text','choice') or q->>'type' is null then raise exception '質問を確認してください'; end if;
 if q->>'type'='choice' and (jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options') not between 2 and 10) then raise exception '選択肢は2〜10個にしてください'; end if;
 end loop; end if;
 insert into public.link_base_broadcasts(kind,title,body,questions,active,approval_status) values(payload->>'kind',trim(payload->>'title'),coalesce(payload->>'body',''),case when payload->>'kind'='survey' then payload->'questions' else '[]' end,false,'pending') returning * into b; return to_jsonb(b);
 elsif operation='approve' and reviewer then update public.link_base_broadcasts set active=true,approval_status='approved',created_at=now() where id=(payload->>'id')::uuid and approval_status='pending'; return 'true';
 elsif operation='reject' and reviewer then update public.link_base_broadcasts set active=false,approval_status='rejected' where id=(payload->>'id')::uuid and approval_status='pending'; return 'true';
 elsif operation='close' and reviewer then update public.link_base_broadcasts set active=false where id=(payload->>'id')::uuid; return 'true';
 elsif operation='results' and staff then
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]') into result from (select answers,created_at from public.link_base_survey_answers where broadcast_id=(payload->>'id')::uuid order by created_at desc limit 2000) t; return result;
 elsif operation='answer' then
 select * into b from public.link_base_broadcasts where id=(payload->>'id')::uuid and active and kind='survey';
 if b.id is null then raise exception '受付が終了しています'; end if;
 if jsonb_typeof(payload->'answers') is distinct from 'array' or jsonb_array_length(payload->'answers')<>jsonb_array_length(b.questions) then raise exception 'すべての質問に回答してください'; end if;
 for q in select value from jsonb_array_elements(b.questions) loop
 a:=payload->'answers'->n; n:=n+1;
 if jsonb_typeof(a) is distinct from 'string' or length(trim(a#>>'{}')) not between 1 and 2000 then raise exception '回答は1〜2000文字にしてください'; end if;
 if q->>'type'='choice' and not (q->'options' ? (a#>>'{}')) then raise exception '選択肢を選んでください'; end if;
 end loop;
 insert into public.link_base_survey_answers(broadcast_id,answers) values(b.id,payload->'answers'); return 'true';
 else raise exception '許可されていない操作です'; end if;
end $$;
