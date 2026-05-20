# Steam 游戏时长追踪器

这是一个重新整理后的个人 Steam 游戏时长追踪项目。

项目会每天三次调用 Steam `GetOwnedGames` 接口，保存每次读取到的原始累计游玩时长快照到 Supabase，并通过部署在 GitHub Pages 上的公开只读 dashboard 展示日、周、月维度的游玩统计。

## 项目结构

```text
collector/   Python 采集器：调用 Steam API，并把快照写入 Supabase
dashboard/   Vite + React + TypeScript 前端：用于 GitHub Pages 可视化展示
scripts/     一次性工具脚本：包含旧 CSV/JSON 历史数据迁移工具
supabase/    数据库建表 SQL、统计视图和 Supabase 配置说明
```

## 数据设计

Supabase 以“原始快照优先”为设计原则：

- `steam_runs`：每次采样一条记录。
- `steam_games`：Steam 游戏元数据，以 `appid` 作为主键。
- `steam_game_snapshots`：每次采样下每个游戏的累计游玩分钟数。

每日、每周、每月的新增游玩时长都由 SQL 根据相邻快照差值推导出来。若某个游戏的累计时长异常下降，统计视图会把该次增量按 `0` 处理，但原始快照仍会完整保留，方便之后重新计算或排查。

## 初始化

1. 创建一个新的 Supabase 项目。
2. 在 Supabase SQL editor 中运行 [`supabase/schema.sql`](supabase/schema.sql)。
3. 在 GitHub 仓库 Secrets 中配置：
   - `STEAM_API_KEY`
   - `STEAM_ID`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`：使用 Supabase secret key（`sb_secret_...`）或 legacy `service_role` key
4. 在 GitHub 仓库 Variables 中配置 dashboard 使用的公开只读变量：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`：使用 Supabase publishable key（`sb_publishable_...`）或 legacy `anon` key
5. 在 GitHub Pages 设置中选择 GitHub Actions 作为部署来源。

## 采集器

本地运行：

```bash
cd collector
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m steam_playtime.collect
```

如果使用本机已有的 conda 环境，也可以：

```bash
cd collector
conda run -n study python -m steam_playtime.collect
```

必需环境变量：

- `STEAM_API_KEY`
- `STEAM_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`：必须是 secret/service_role，不能是 publishable/anon

可选环境变量：

- `STEAM_INCLUDE_PLAYED_FREE_GAMES=true`
- `STEAM_TIMEZONE=Asia/Shanghai`
- `STEAM_COLLECTOR_SOURCE=local`

## 历史数据迁移

旧项目中的 `steam_playtime_log.csv` 和 `total_playtime_summary.json` 不再进入新仓库，请保存在仓库外的私有备份位置。

迁移脚本支持先 dry run 检查数据：

```bash
conda run --no-capture-output -n study python scripts/migrate_legacy.py \
  --csv /path/to/steam_playtime_log.csv \
  --summary /path/to/total_playtime_summary.json \
  --steam-id YOUR_STEAM_ID \
  --dry-run
```

确认结果无误后，去掉 `--dry-run` 即可写入 Supabase：

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
conda run --no-capture-output -n study python scripts/migrate_legacy.py \
  --csv /path/to/steam_playtime_log.csv \
  --summary /path/to/total_playtime_summary.json \
  --steam-id YOUR_STEAM_ID
```

迁移时第一条历史快照会作为 baseline，不会把旧项目里已经存在的累计总时长算作当天新增游玩时长。

## Dashboard

本地开发：

```bash
cd dashboard
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

Dashboard v1 是公开只读页面。前端会使用 Supabase publishable/anon key 读取公开统计视图，不会使用 secret/service_role key。

## GitHub Actions

项目包含两个 workflow：

- `Steam Playtime Tracker`：每天上海时间 05:00、13:00、21:00 采集 Steam 数据并写入 Supabase。
- `Deploy Dashboard`：当 dashboard 代码变化后，构建并部署到 GitHub Pages。

新版本不会再把 CSV/JSON 数据提交回 Git 仓库。
