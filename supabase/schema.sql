create extension if not exists pgcrypto;

create table if not exists public.steam_runs (
    id uuid primary key default gen_random_uuid(),
    steam_id text not null,
    fetched_at timestamptz not null,
    game_count integer not null check (game_count >= 0),
    total_playtime_minutes integer not null check (total_playtime_minutes >= 0),
    source text not null default 'unknown',
    inserted_at timestamptz not null default now(),
    unique (steam_id, fetched_at)
);

create table if not exists public.steam_games (
    appid integer primary key,
    name text not null,
    img_icon_hash text,
    last_seen_at timestamptz not null,
    updated_at timestamptz not null default now()
);

create table if not exists public.steam_game_snapshots (
    run_id uuid not null references public.steam_runs (id) on delete cascade,
    appid integer not null references public.steam_games (appid) on delete restrict,
    playtime_forever_minutes integer not null check (playtime_forever_minutes >= 0),
    inserted_at timestamptz not null default now(),
    primary key (run_id, appid)
);

create index if not exists steam_runs_fetched_at_idx
    on public.steam_runs (fetched_at desc);

create index if not exists steam_game_snapshots_appid_idx
    on public.steam_game_snapshots (appid);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists steam_games_set_updated_at on public.steam_games;
create trigger steam_games_set_updated_at
before update on public.steam_games
for each row
execute function public.set_updated_at();

create or replace view public.v_snapshot_deltas as
with ordered_snapshots as (
    select
        runs.steam_id,
        runs.fetched_at,
        runs.source,
        (runs.fetched_at at time zone 'Asia/Shanghai')::date as play_date,
        snapshots.appid,
        games.name,
        games.img_icon_hash,
        snapshots.playtime_forever_minutes,
        lag(snapshots.playtime_forever_minutes) over (
            partition by runs.steam_id, snapshots.appid
            order by runs.fetched_at
        ) as previous_playtime_minutes,
        lag(runs.source) over (
            partition by runs.steam_id, snapshots.appid
            order by runs.fetched_at
        ) as previous_source
    from public.steam_game_snapshots snapshots
    join public.steam_runs runs on runs.id = snapshots.run_id
    join public.steam_games games on games.appid = snapshots.appid
)
select
    steam_id,
    fetched_at,
    play_date,
    appid,
    name,
    img_icon_hash,
    playtime_forever_minutes,
    previous_playtime_minutes,
    case
        when previous_playtime_minutes is null then 0
        when previous_source = 'legacy_import' and source <> 'legacy_import' then 0
        else greatest(playtime_forever_minutes - previous_playtime_minutes, 0)
    end as delta_minutes,
    source,
    previous_source
from ordered_snapshots;

create or replace view public.v_period_game_playtime as
select
    'day'::text as period,
    play_date as period_start,
    appid,
    name,
    img_icon_hash,
    sum(delta_minutes)::integer as total_minutes
from public.v_snapshot_deltas
group by play_date, appid, name, img_icon_hash
having sum(delta_minutes) > 0

union all

select
    'week'::text as period,
    date_trunc('week', play_date::timestamp)::date as period_start,
    appid,
    name,
    img_icon_hash,
    sum(delta_minutes)::integer as total_minutes
from public.v_snapshot_deltas
group by date_trunc('week', play_date::timestamp)::date, appid, name, img_icon_hash
having sum(delta_minutes) > 0

union all

select
    'month'::text as period,
    date_trunc('month', play_date::timestamp)::date as period_start,
    appid,
    name,
    img_icon_hash,
    sum(delta_minutes)::integer as total_minutes
from public.v_snapshot_deltas
group by date_trunc('month', play_date::timestamp)::date, appid, name, img_icon_hash
having sum(delta_minutes) > 0;

create or replace view public.v_period_summary as
select
    period,
    period_start,
    sum(total_minutes)::integer as total_minutes,
    count(*)::integer as games_played
from public.v_period_game_playtime
group by period, period_start;

create or replace view public.v_run_history as
select
    id,
    fetched_at,
    game_count,
    total_playtime_minutes,
    source
from public.steam_runs;

revoke all on public.steam_runs from anon, authenticated;
revoke all on public.steam_games from anon, authenticated;
revoke all on public.steam_game_snapshots from anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.v_period_game_playtime to anon, authenticated;
grant select on public.v_period_summary to anon, authenticated;
grant select on public.v_run_history to anon, authenticated;
