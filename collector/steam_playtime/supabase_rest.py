from __future__ import annotations

from collections.abc import Iterable
from typing import Any
from typing import TypeVar

import requests

from .models import SteamGame, SteamSnapshot

T = TypeVar("T")


def _chunks(items: list[T], size: int) -> Iterable[list[T]]:
    for index in range(0, len(items), size):
        yield items[index : index + size]


class SupabaseRestClient:
    def __init__(self, *, url: str, service_role_key: str, timeout_seconds: int = 30) -> None:
        self.base_url = url.rstrip("/") + "/rest/v1"
        self.timeout_seconds = timeout_seconds
        self.headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        }

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: Any | None = None,
        prefer: str | None = None,
    ) -> Any:
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        response = requests.request(
            method,
            f"{self.base_url}{path}",
            headers=headers,
            json=json,
            timeout=self.timeout_seconds,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"Supabase request failed: {response.status_code} {response.text}")
        if not response.text:
            return None
        return response.json()

    def upsert_games(self, games: list[SteamGame], *, last_seen_at: str) -> None:
        if not games:
            return

        rows = [
            {
                "appid": game.appid,
                "name": game.name,
                "img_icon_hash": game.img_icon_hash,
                "last_seen_at": last_seen_at,
            }
            for game in games
        ]
        for chunk in _chunks(rows, 500):
            self._request(
                "POST",
                "/steam_games?on_conflict=appid",
                json=chunk,
                prefer="resolution=merge-duplicates",
            )

    def upsert_run(self, snapshot: SteamSnapshot) -> str:
        rows = self._request(
            "POST",
            "/steam_runs?on_conflict=steam_id,fetched_at&select=id",
            json={
                "steam_id": snapshot.steam_id,
                "fetched_at": snapshot.fetched_at,
                "game_count": snapshot.game_count,
                "total_playtime_minutes": snapshot.total_playtime_minutes,
                "source": snapshot.source,
            },
            prefer="resolution=merge-duplicates,return=representation",
        )
        if not rows:
            raise RuntimeError("Supabase did not return a run id.")
        return str(rows[0]["id"])

    def upsert_snapshots(self, *, run_id: str, games: list[SteamGame]) -> None:
        if not games:
            return

        rows = [
            {
                "run_id": run_id,
                "appid": game.appid,
                "playtime_forever_minutes": game.playtime_forever_minutes,
            }
            for game in games
        ]
        for chunk in _chunks(rows, 500):
            self._request(
                "POST",
                "/steam_game_snapshots?on_conflict=run_id,appid",
                json=chunk,
                prefer="resolution=merge-duplicates",
            )

    def save_snapshot(self, snapshot: SteamSnapshot) -> str:
        self.upsert_games(snapshot.games, last_seen_at=snapshot.fetched_at)
        run_id = self.upsert_run(snapshot)
        self.upsert_snapshots(run_id=run_id, games=snapshot.games)
        return run_id
