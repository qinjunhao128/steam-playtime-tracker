from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SteamGame:
    appid: int
    name: str
    playtime_forever_minutes: int
    img_icon_hash: str | None = None


@dataclass(frozen=True)
class SteamSnapshot:
    steam_id: str
    fetched_at: str
    game_count: int
    total_playtime_minutes: int
    games: list[SteamGame]
    source: str
