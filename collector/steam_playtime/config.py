from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass(frozen=True)
class CollectorConfig:
    steam_api_key: str
    steam_id: str
    supabase_url: str
    supabase_service_role_key: str
    timezone: str = "Asia/Shanghai"
    source: str = "local"
    include_played_free_games: bool = True


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _required_server_key(name: str) -> str:
    value = _required_env(name)
    if value.startswith("sb_publishable_"):
        raise RuntimeError(
            f"{name} is a publishable key. Use a Supabase secret key "
            "(`sb_secret_...`) or legacy service_role key for the collector."
        )
    return value


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def load_config() -> CollectorConfig:
    load_dotenv()
    return CollectorConfig(
        steam_api_key=_required_env("STEAM_API_KEY"),
        steam_id=_required_env("STEAM_ID"),
        supabase_url=_required_env("SUPABASE_URL"),
        supabase_service_role_key=_required_server_key("SUPABASE_SERVICE_ROLE_KEY"),
        timezone=os.getenv("STEAM_TIMEZONE", "Asia/Shanghai"),
        source=os.getenv("STEAM_COLLECTOR_SOURCE", "local"),
        include_played_free_games=_env_bool("STEAM_INCLUDE_PLAYED_FREE_GAMES", True),
    )
