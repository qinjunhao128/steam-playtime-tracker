# Steam Playtime Tracker

一个用于记录和展示 Steam 游戏时长的个人项目。

采集器会定时读取 Steam `GetOwnedGames` 接口，把每次返回的累计游玩分钟数保存为 Supabase 快照；前端仪表盘再基于快照差值展示按日、周、月汇总的游玩统计。

## 功能概览

- 定时采集 Steam 游戏库的累计游玩时长。
- 将每次采集保存为不可变快照，便于之后按需计算统计结果。
- 使用 Supabase 视图计算相邻快照之间的新增游玩分钟数。
- 提供公开只读的 React 仪表盘，支持中文和英文界面。
- 展示周期趋势、周期内游玩最多的游戏、游戏列表和最近一次采集时间。
- 支持从 CSV/JSON 历史记录导入既有快照。

## 仓库结构

```text
collector/   Python 采集器，负责调用 Steam API 并写入 Supabase
dashboard/   Vite + React + TypeScript 仪表盘，适合部署到 GitHub Pages
scripts/     一次性维护脚本，目前包含历史数据迁移工具
supabase/    数据库 schema、统计视图和 Supabase 配置说明
```

## 数据模型

项目在 Supabase 中保存原始采集结果，并通过 SQL 视图生成统计数据。

核心表：

- `steam_runs`：一次采集对应一条记录，保存 Steam ID、采集时间、游戏数量、总分钟数和来源。
- `steam_games`：游戏元数据，以 `appid` 为主键，保存名称、图标 hash 和最近出现时间。
- `steam_game_snapshots`：某次采集中每个游戏的累计游玩分钟数。

核心视图：

- `v_snapshot_deltas`：按游戏比较相邻快照，计算新增分钟数。
- `v_period_game_playtime`：按日、周、月和游戏汇总新增分钟数。
- `v_period_summary`：按日、周、月汇总总游玩时长和游戏数。
- `v_run_history`：供仪表盘读取采集历史。

统计规则：

- Steam 返回的是累计分钟数，周期统计由相邻快照差值得出。
- 每个游戏的第一条快照作为基线，新增时长记为 `0`。
- 如果累计时长下降，该次增量按 `0` 处理，原始快照仍会保留。
- 如果上一条来源是 `legacy_import` 而当前来源不是，本次新增分钟数记为 `0`。
- 日期使用 `Asia/Shanghai`，周统计按 PostgreSQL `date_trunc('week', ...)`，即周一作为周起点。

## Supabase 初始化

1. 创建 Supabase 项目。
2. 打开 Supabase SQL Editor。
3. 执行 [`supabase/schema.sql`](supabase/schema.sql)。
4. 保存项目 URL 和 API key：
   - 采集器使用 `SUPABASE_SERVICE_ROLE_KEY`，应填写 `sb_secret_...` 或 `service_role` key。
   - 仪表盘使用 `VITE_SUPABASE_ANON_KEY`，应填写 `sb_publishable_...` 或 `anon` key。

schema 会撤销匿名用户对原始表的访问，只向 `anon` 和 `authenticated` 授予统计视图的 `select` 权限。不要把 service role key 暴露给前端。

## 采集器

本地运行：

```bash
cd collector
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m steam_playtime.collect
```

也可以使用现有 conda 环境：

```bash
cd collector
conda run -n study python -m steam_playtime.collect
```

采集器会读取 `collector/.env` 或当前 shell 中的环境变量。可从示例文件开始：

```bash
cp collector/.env.example collector/.env
```

必需变量：

- `STEAM_API_KEY`
- `STEAM_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

可选变量：

- `STEAM_TIMEZONE`：默认 `Asia/Shanghai`
- `STEAM_COLLECTOR_SOURCE`：默认 `local`
- `STEAM_INCLUDE_PLAYED_FREE_GAMES`：默认 `true`

运行测试：

```bash
cd collector
python -m unittest discover -s tests
```

## Dashboard

本地开发：

```bash
cd dashboard
npm install
npm run dev
```

生产构建：

```bash
cd dashboard
npm run build
```

仪表盘读取以下构建环境变量：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

`dashboard/vite.config.ts` 会在 GitHub Actions 中根据仓库名设置 Pages base path，本地开发时使用 `/`。

## GitHub Actions

仓库包含两个 workflow：

- `Steam Playtime Tracker`：支持手动触发，并在上海时间 05:00、13:00、21:00 采集 Steam 数据。
- `Deploy Dashboard`：当 `dashboard/**` 或部署 workflow 变化时，构建仪表盘并发布到 GitHub Pages。

需要配置的 GitHub Secrets：

- `STEAM_API_KEY`
- `STEAM_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

需要配置的 GitHub Variables：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

GitHub Pages 的部署来源应选择 GitHub Actions。

## 历史数据迁移

迁移脚本支持从 `steam_playtime_log.csv` 和 `total_playtime_summary.json` 导入快照。建议先 dry run 检查解析结果：

```bash
conda run --no-capture-output -n study python scripts/migrate_legacy.py \
  --csv /path/to/steam_playtime_log.csv \
  --summary /path/to/total_playtime_summary.json \
  --steam-id YOUR_STEAM_ID \
  --dry-run
```

确认后写入 Supabase：

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
conda run --no-capture-output -n study python scripts/migrate_legacy.py \
  --csv /path/to/steam_playtime_log.csv \
  --summary /path/to/total_playtime_summary.json \
  --steam-id YOUR_STEAM_ID
```

CSV 和 JSON 原始文件包含个人数据，仓库的 `.gitignore` 会忽略这类文件；建议放在仓库外或 `.local/` 等本地目录中。
