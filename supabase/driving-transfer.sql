begin;
create table link_base_virtual.driving_saves (
 code_hash text primary key check(code_hash ~ '^[0-9a-f]{64}$'),
 profile jsonb not null check(jsonb_typeof(profile)='object' and octet_length(profile::text)<=32768),
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
alter table link_base_virtual.driving_saves enable row level security;
revoke all on link_base_virtual.driving_saves from public,anon,authenticated;
-- The user-chosen code is the credential. Never grant direct table access or list codes.
create or replace function public.link_base_driving_transfer(operation text,code_digest text,snapshot jsonb default null,expected_revision bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare k text; p link_base_virtual.driving_saves%rowtype; n integer;
begin
 if code_digest is null or code_digest !~ '^[0-9a-f]{64}$' or operation is null or operation not in ('create','load','save') then
  return jsonb_build_object('ok',false,'message','引き継ぎ情報が不正です。');
 end if;
 k:=encode(sha256(convert_to('car-save:'||code_digest,'UTF8')),'hex');
 if operation='load' then
  select * into p from link_base_virtual.driving_saves where code_hash=k;
  if not found then return jsonb_build_object('ok',false,'message','コードが違うか、まだクラウドに保存されていません。');end if;
  return jsonb_build_object('ok',true,'profile',p.profile,'revision',p.revision);
 end if;
 if snapshot is null or jsonb_typeof(snapshot)<>'object' or octet_length(snapshot::text)>32768 or snapshot->>'version' is distinct from '2' then
  return jsonb_build_object('ok',false,'message','セーブデータの形式を確認できません。');
 end if;
 if operation='create' then
  perform pg_advisory_xact_lock(hashtext('driving-save-create'));
  if exists(select 1 from link_base_virtual.driving_saves where code_hash=k) then return jsonb_build_object('ok',false,'message','このコードは使用済みです。別のコードを設定してください。');end if;
  select count(*) into n from link_base_virtual.driving_saves;
  if n>=10000 then return jsonb_build_object('ok',false,'message','保存数の上限です。管理者に連絡してください。');end if;
  insert into link_base_virtual.driving_saves(code_hash,profile)values(k,snapshot);
  return jsonb_build_object('ok',true,'revision',1);
 end if;
 update link_base_virtual.driving_saves set profile=snapshot,revision=revision+1,updated_at=clock_timestamp()
 where code_hash=k and revision=expected_revision returning * into p;
 if not found then return jsonb_build_object('ok',false,'message','別ブラウザで記録が更新されています。上書きせず同期を停止しました。');end if;
 return jsonb_build_object('ok',true,'revision',p.revision);
end;$$;
revoke all on function public.link_base_driving_transfer(text,text,jsonb,bigint) from public;
grant execute on function public.link_base_driving_transfer(text,text,jsonb,bigint) to anon,authenticated;
commit;
