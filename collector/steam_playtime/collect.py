from __future__ import annotations

from .config import load_config
from .steam import fetch_owned_games
from .supabase_rest import SupabaseRestClient


def main() -> None:
    config = load_config()
    snapshot = fetch_owned_games(
        api_key=config.steam_api_key,
        steam_id=config.steam_id,
        timezone=config.timezone,
        source=config.source,
        include_played_free_games=config.include_played_free_games,
    )
    client = SupabaseRestClient(
        url=config.supabase_url,
        service_role_key=config.supabase_service_role_key,
    )
    run_id = client.save_snapshot(snapshot)
    played_games = sum(1 for game in snapshot.games if game.playtime_forever_minutes > 0)
    print(
        "Saved Steam snapshot "
        f"run_id={run_id} games={snapshot.game_count} played_games={played_games} "
        f"total_minutes={snapshot.total_playtime_minutes} fetched_at={snapshot.fetched_at}"
    )


if __name__ == "__main__":
    main()
