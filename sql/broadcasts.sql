create table public.link_base_broadcasts (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('notice','survey')),
 title text not null check(length(title) between 1 and 120), body text not null default '' check(length(body)<=10000),
 questions jsonb not null default '[]', active boolean not null default true, created_at timestamptz not null default now(),
 check(jsonb_typeof(questions)='array' and jsonb_array_length(questions)<=20)
);
create table public.link_base_survey_answers (
 broadcast_id uuid references public.link_base_broadcasts(id) on delete cascade,
 browser_id text not null default (auth.jwt()->>'link_core_visitor_browser'),
 answers jsonb not null check(jsonb_typeof(answers)='array'), created_at timestamptz not null default now(),
 primary key(broadcast_id,browser_id)
);
alter table public.link_base_broadcasts enable row level security;
alter table public.link_base_survey_answers enable row level security;
create policy broadcast_read on public.link_base_broadcasts for select to authenticated using (
 (auth.jwt()->'link_core_topics' ? 'lc-chat-direct-admin') or (active and auth.jwt()->'link_core_topics' ? 'lc-chat-public'));
create policy broadcast_admin on public.link_base_broadcasts for all to authenticated using (auth.jwt()->'link_core_topics' ? 'lc-chat-direct-admin') with check(auth.jwt()->'link_core_topics' ? 'lc-chat-direct-admin');
create policy answer_read on public.link_base_survey_answers for select to authenticated using (
 (auth.jwt()->'link_core_topics' ? 'lc-chat-direct-admin') or browser_id=auth.jwt()->>'link_core_visitor_browser');
create policy answer_insert on public.link_base_survey_answers for insert to authenticated with check (
 browser_id=auth.jwt()->>'link_core_visitor_browser' and exists(select 1 from public.link_base_broadcasts b where b.id=broadcast_id and b.kind='survey' and b.active));
grant select,insert,update on public.link_base_broadcasts to authenticated;
grant select,insert on public.link_base_survey_answers to authenticated;
create function public.link_base_broadcast_api(operation text,payload jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_column
declare result jsonb; b public.link_base_broadcasts; q jsonb; a jsonb; n integer:=0; staff boolean:=coalesce(auth.jwt()->'link_core_topics' ? 'lc-chat-direct-admin',false);
begin
 if not coalesce(auth.jwt()->'link_core_topics' ? 'lc-chat-public',false) then raise exception 'ログインしてください'; end if;
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
 insert into public.link_base_broadcasts(kind,title,body,questions) values(payload->>'kind',trim(payload->>'title'),coalesce(payload->>'body',''),case when payload->>'kind'='survey' then payload->'questions' else '[]' end) returning * into b; return to_jsonb(b);
 elsif operation='close' and staff then update public.link_base_broadcasts set active=false where id=(payload->>'id')::uuid; return 'true';
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
revoke all on function public.link_base_broadcast_api(text,jsonb) from public,anon;
grant execute on function public.link_base_broadcast_api(text,jsonb) to authenticated;

create function public.link_base_validate_survey_answer() returns trigger language plpgsql security invoker set search_path='' as $$
declare b public.link_base_broadcasts; q jsonb; a jsonb; n integer:=0;
begin
 select * into b from public.link_base_broadcasts where id=new.broadcast_id and kind='survey' and active;
 if b.id is null then raise exception '受付が終了しています'; end if;
 if jsonb_typeof(new.answers) is distinct from 'array' or jsonb_array_length(new.answers)<>jsonb_array_length(b.questions) then raise exception 'すべての質問に回答してください'; end if;
 for q in select value from jsonb_array_elements(b.questions) loop
 a:=new.answers->n;n:=n+1;
 if jsonb_typeof(a) is distinct from 'string' or length(trim(a#>>'{}')) not between 1 and 2000 then raise exception '回答は1〜2000文字にしてください';end if;
 if q->>'type'='choice' and not(q->'options' ? (a#>>'{}')) then raise exception '選択肢を選んでください';end if;
 end loop;return new;
end $$;
create trigger validate_survey_answer before insert on public.link_base_survey_answers for each row execute function public.link_base_validate_survey_answer();
revoke all on function public.link_base_validate_survey_answer() from public,anon;
