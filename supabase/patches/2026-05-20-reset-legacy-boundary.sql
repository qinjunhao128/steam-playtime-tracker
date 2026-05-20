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
