from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import requests

from .models import SteamGame, SteamSnapshot

STEAM_OWNED_GAMES_URL = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/"


def normalize_game(raw_game: dict) -> SteamGame:
    appid = int(raw_game["appid"])
    playtime = max(0, int(raw_game.get("playtime_forever", 0)))
    name = str(raw_game.get("name") or f"App {appid}").strip()
    icon_hash = raw_game.get("img_icon_url") or None
    return SteamGame(
        appid=appid,
        name=name,
        playtime_forever_minutes=playtime,
        img_icon_hash=icon_hash,
    )


def fetch_owned_games(
    *,
    api_key: str,
    steam_id: str,
    timezone: str,
    source: str,
    include_played_free_games: bool = True,
    timeout_seconds: int = 30,
) -> SteamSnapshot:
    params = {
        "key": api_key,
        "steamid": steam_id,
        "format": "json",
        "include_appinfo": "true",
        "include_played_free_games": "true" if include_played_free_games else "false",
    }
    response = requests.get(STEAM_OWNED_GAMES_URL, params=params, timeout=timeout_seconds)
    response.raise_for_status()
    payload = response.json()

    steam_response = payload.get("response")
    if not isinstance(steam_response, dict) or "games" not in steam_response:
        raise RuntimeError(
            "Steam returned no games. The profile may be private or the API response changed."
        )

    games = [normalize_game(game) for game in steam_response.get("games", [])]
    games.sort(key=lambda game: game.appid)
    fetched_at = datetime.now(ZoneInfo(timezone)).isoformat(timespec="seconds")

    return SteamSnapshot(
        steam_id=steam_id,
        fetched_at=fetched_at,
        game_count=int(steam_response.get("game_count", len(games))),
        total_playtime_minutes=sum(game.playtime_forever_minutes for game in games),
        games=games,
        source=source,
    )
