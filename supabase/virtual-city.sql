begin;
create schema if not exists link_base_virtual;
revoke all on schema link_base_virtual from public,anon,authenticated;
create table link_base_virtual.players (
 id uuid primary key,
 secret_hash text not null,
 room text not null,
 avatar jsonb not null,
 x double precision not null default 0,
 z double precision not null default 26,
 yaw double precision not null default 0,
 last_seen timestamptz not null default now()
);
alter table link_base_virtual.players enable row level security;
revoke all on link_base_virtual.players from public,anon,authenticated;
create index virtual_players_room_seen on link_base_virtual.players(room,last_seen desc);
create or replace function public.link_base_virtual_sync(
 player_id uuid, player_secret text, room_code text, profile jsonb,
 px double precision, pz double precision, heading double precision, operation text default 'heartbeat'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 p link_base_virtual.players%rowtype;
 stamp timestamptz:=clock_timestamp();
 secret_digest text;
 clean_profile jsonb;
 peers jsonb;
 n integer;
begin
 if player_id is null or player_secret is null or player_secret !~ '^[0-9a-f]{64}$' then
  raise exception 'プレイヤー情報を確認できません。' using errcode='42501';
 end if;
 if operation is null or operation not in ('join','heartbeat','leave') or room_code is null or room_code !~ '^[A-Z0-9]{4,12}$' then
  raise exception 'ルーム情報を確認してください。' using errcode='22023';
 end if;
 if px is null or pz is null or heading is null or not (px between -246 and 246) or not (pz between -246 and 246) or px*px+pz*pz>60516 or not (heading between -1000000 and 1000000) then
  raise exception '位置情報が不正です。' using errcode='22023';
 end if;
 secret_digest:=encode(sha256(convert_to(player_secret,'UTF8')),'hex');
 select * into p from link_base_virtual.players where id=player_id for update;
 if found and p.secret_hash<>secret_digest then
  raise exception 'プレイヤーの認証に失敗しました。' using errcode='42501';
 end if;
 if operation='leave' then
  delete from link_base_virtual.players where id=player_id and secret_hash=secret_digest;
  return jsonb_build_object('players','[]'::jsonb,'room',room_code);
 end if;
 if p.id is not null and p.last_seen>stamp-interval '700 milliseconds' then
  raise exception '更新間隔が短すぎます。' using errcode='54000';
 end if;
 if p.id is null and operation<>'join' then
  raise exception 'ルームに入り直してください。' using errcode='42501';
 end if;
 if operation='join' or p.room<>room_code then
  perform pg_advisory_xact_lock(hashtext('virtual-room:'||room_code));
  select count(*) into n from link_base_virtual.players where room=room_code and id<>player_id and last_seen>stamp-interval '12 seconds';
  if n>=16 then raise exception 'このルームは満員です（16人）。別のルームを選んでください。'; end if;
 end if;
 if p.id is null then
  delete from link_base_virtual.players where last_seen<stamp-interval '1 day';
  select count(*) into n from link_base_virtual.players;
  if n>=5000 then raise exception '接続数の上限に達しました。時間をおいて再試行してください。'; end if;
 end if;
 if profile is null or jsonb_typeof(profile)<>'object' or octet_length(profile::text)>2000 then
  raise exception 'アバター情報が不正です。' using errcode='22023';
 end if;
 clean_profile:=jsonb_build_object(
 'name',left(regexp_replace(coalesce(profile->>'name','プレイヤー'),'[[:cntrl:]]','','g'),14),
 'suit',case when profile->>'suit' ~ '^#[0-9a-fA-F]{6}$' then profile->>'suit' else '#37bce8' end,
 'accent',case when profile->>'accent' ~ '^#[0-9a-fA-F]{6}$' then profile->>'accent' else '#70fff0' end,
 'skin',case when profile->>'skin' ~ '^#[0-9a-fA-F]{6}$' then profile->>'skin' else '#d9ad8c' end,
 'style',case when profile->>'style' in ('visor','hair','helmet','robot') then profile->>'style' else 'visor' end,
 'height',case when profile->>'height' ~ '^[0-9]{2,3}$' and (profile->>'height')::integer between 85 and 120 then (profile->>'height')::integer else 100 end);
 insert into link_base_virtual.players(id,secret_hash,room,avatar,x,z,yaw,last_seen)
 values(player_id,secret_digest,room_code,clean_profile,px,pz,heading,stamp)
 on conflict(id) do update set room=excluded.room,avatar=excluded.avatar,x=excluded.x,z=excluded.z,yaw=excluded.yaw,last_seen=excluded.last_seen;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'avatar',avatar,'x',x,'z',z,'yaw',yaw) order by id),'[]'::jsonb)
 into peers from link_base_virtual.players where room=room_code and id<>player_id and last_seen>stamp-interval '12 seconds';
 return jsonb_build_object('players',peers,'room',room_code,'serverTime',stamp,'capacity',16);
end;
$$;
revoke all on function public.link_base_virtual_sync(uuid,text,text,jsonb,double precision,double precision,double precision,text) from public;
grant execute on function public.link_base_virtual_sync(uuid,text,text,jsonb,double precision,double precision,double precision,text) to anon,authenticated;
commit;
