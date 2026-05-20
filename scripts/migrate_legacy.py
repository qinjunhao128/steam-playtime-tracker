#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "collector"))

from dotenv import load_dotenv  # noqa: E402
from steam_playtime.models import SteamGame, SteamSnapshot  # noqa: E402
from steam_playtime.supabase_rest import SupabaseRestClient  # noqa: E402

load_dotenv(ROOT / "collector" / ".env")


@dataclass(frozen=True)
class LegacyImport:
    snapshots: list[SteamSnapshot]
    unique_games: int
    first_timestamp: str | None
    last_timestamp: str | None
    last_total_minutes: int | None


def _parse_legacy_timestamp(value: str, timezone: str) -> str:
    parsed = datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    return parsed.replace(tzinfo=ZoneInfo(timezone)).isoformat(timespec="seconds")


def _hours_to_minutes(value: str | float | int) -> int:
    return max(0, round(float(value) * 60))


def load_legacy_data(
    *,
    csv_path: Path,
    summary_path: Path,
    steam_id: str,
    timezone: str,
    source: str,
) -> LegacyImport:
    rows_by_timestamp: dict[str, list[SteamGame]] = defaultdict(list)
    appids: set[int] = set()

    with csv_path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"Timestamp", "AppID", "GameName", "TotalPlaytimeHours"}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise RuntimeError(f"CSV is missing required columns: {sorted(missing)}")

        for row in reader:
            appid = int(row["AppID"])
            appids.add(appid)
            rows_by_timestamp[row["Timestamp"]].append(
                SteamGame(
                    appid=appid,
                    name=row["GameName"] or f"App {appid}",
                    playtime_forever_minutes=_hours_to_minutes(row["TotalPlaytimeHours"]),
                    img_icon_hash=None,
                )
            )

    with summary_path.open(encoding="utf-8") as handle:
        summary_rows = json.load(handle)
    if not isinstance(summary_rows, list):
        raise RuntimeError("Summary JSON must contain a list.")

    snapshots: list[SteamSnapshot] = []
    for item in summary_rows:
        timestamp = str(item["timestamp"])
        games = sorted(rows_by_timestamp.get(timestamp, []), key=lambda game: game.appid)
        snapshots.append(
            SteamSnapshot(
                steam_id=steam_id,
                fetched_at=_parse_legacy_timestamp(timestamp, timezone),
                game_count=len(games),
                total_playtime_minutes=_hours_to_minutes(item["total_hours"]),
                games=games,
                source=source,
            )
        )

    return LegacyImport(
        snapshots=snapshots,
        unique_games=len(appids),
        first_timestamp=snapshots[0].fetched_at if snapshots else None,
        last_timestamp=snapshots[-1].fetched_at if snapshots else None,
        last_total_minutes=snapshots[-1].total_playtime_minutes if snapshots else None,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import legacy Steam CSV/JSON snapshots.")
    parser.add_argument("--csv", required=True, type=Path, help="Path to steam_playtime_log.csv")
    parser.add_argument(
        "--summary",
        required=True,
        type=Path,
        help="Path to total_playtime_summary.json",
    )
    parser.add_argument("--steam-id", default=os.getenv("STEAM_ID"), help="Steam ID to attach")
    parser.add_argument("--timezone", default=os.getenv("STEAM_TIMEZONE", "Asia/Shanghai"))
    parser.add_argument("--source", default="legacy_import")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.steam_id:
        raise RuntimeError("Provide --steam-id or set STEAM_ID.")

    imported = load_legacy_data(
        csv_path=args.csv,
        summary_path=args.summary,
        steam_id=args.steam_id,
        timezone=args.timezone,
        source=args.source,
    )

    print(f"snapshots={len(imported.snapshots)}", flush=True)
    print(f"unique_games={imported.unique_games}", flush=True)
    print(f"first_timestamp={imported.first_timestamp}", flush=True)
    print(f"last_timestamp={imported.last_timestamp}", flush=True)
    print(f"last_total_minutes={imported.last_total_minutes}", flush=True)
    if imported.last_total_minutes is not None:
        print(f"last_total_hours={imported.last_total_minutes / 60:.2f}", flush=True)

    if args.dry_run:
        print("dry_run=true; no rows were written.", flush=True)
        return

    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role_key:
        raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before importing.")

    client = SupabaseRestClient(url=supabase_url, service_role_key=service_role_key)
    for index, snapshot in enumerate(imported.snapshots, start=1):
        run_id = client.save_snapshot(snapshot)
        print(f"imported {index}/{len(imported.snapshots)} run_id={run_id}", flush=True)


if __name__ == "__main__":
    main()
