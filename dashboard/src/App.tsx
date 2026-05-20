import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Clock3,
  Database,
  Gauge,
  Trophy,
} from "lucide-react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatDateTime,
  formatDuration,
  formatPeriodLabel,
  formatPeriodLabelParts,
  steamIconUrl,
} from "./format";
import { hasSupabaseConfig, supabase } from "./supabase";
import type { Language, Period, PeriodGamePlaytime, PeriodSummary, RunHistory } from "./types";

const LANGUAGE_STORAGE_KEY = "steam-playtime-language";

const TRANSLATIONS = {
  en: {
    periods: {
      day: "Day",
      week: "Week",
      month: "Month",
    },
    lastRunTitle: "Last successful collector run",
    missingConfig: "Missing `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`.",
    dashboardControls: "Dashboard controls",
    period: "Period",
    keyMetrics: "Key metrics",
    selected: "Selected",
    topGame: "Top game",
    none: "None",
    gamesPlayed: "Games played",
    totalTracked: "Total tracked",
    trend: "trend",
    periodsCount: "periods",
    loading: "Loading",
    noPlaytime: "No playtime yet",
    playtime: "Playtime",
    games: "Games",
    noGames: "No games",
    language: "Language",
    app: "App",
    hourUnit: "h",
  },
  zh: {
    periods: {
      day: "日",
      week: "周",
      month: "月",
    },
    lastRunTitle: "最近一次成功采集",
    missingConfig: "缺少 `VITE_SUPABASE_URL` 或 `VITE_SUPABASE_ANON_KEY`。",
    dashboardControls: "仪表盘控制项",
    period: "周期",
    keyMetrics: "关键指标",
    selected: "所选周期",
    topGame: "游玩最多",
    none: "无",
    gamesPlayed: "游玩游戏数",
    totalTracked: "累计追踪",
    trend: "趋势",
    periodsCount: "个周期",
    loading: "加载中",
    noPlaytime: "暂无游玩时长",
    playtime: "游玩时长",
    games: "游戏",
    noGames: "暂无游戏",
    language: "语言",
    app: "App",
    hourUnit: "小时",
  },
} satisfies Record<
  Language,
  {
    periods: Record<Period, string>;
    lastRunTitle: string;
    missingConfig: string;
    dashboardControls: string;
    period: string;
    keyMetrics: string;
    selected: string;
    topGame: string;
    none: string;
    gamesPlayed: string;
    totalTracked: string;
    trend: string;
    periodsCount: string;
    loading: string;
    noPlaytime: string;
    playtime: string;
    games: string;
    noGames: string;
    language: string;
    app: string;
    hourUnit: string;
  }
>;

const PERIODS: Period[] = ["day", "week", "month"];
const LANGUAGES: Language[] = ["zh", "en"];

function compareDateDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

function isLanguage(value: string | null): value is Language {
  return value === "en" || value === "zh";
}

function getBrowserLanguage(): Language {
  if (typeof navigator === "undefined") {
    return "en";
  }

  const browserLanguages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  return browserLanguages.some((item) => item.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function getInitialLanguage(): Language {
  if (typeof window === "undefined") {
    return "en";
  }

  const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isLanguage(savedLanguage) ? savedLanguage : getBrowserLanguage();
}

type PeriodLabelProps = {
  period: Period;
  value: string;
  language: Language;
  className?: string;
};

function PeriodLabel({ period, value, language, className }: PeriodLabelProps) {
  const parts = formatPeriodLabelParts(period, value, language);

  return (
    <span className={["date-stack", className].filter(Boolean).join(" ")}>
      <span>{parts.date}</span>
      {parts.weekday && <span>{parts.weekday}</span>}
    </span>
  );
}

type PeriodAxisTickProps = {
  x?: number;
  y?: number;
  payload?: {
    value?: string;
  };
  period: Period;
  language: Language;
};

function PeriodAxisTick({ x = 0, y = 0, payload, period, language }: PeriodAxisTickProps) {
  const parts = formatPeriodLabelParts(period, String(payload?.value ?? ""), language);

  return (
    <g transform={`translate(${x},${y})`}>
      <text fill="#61728e" fontSize={12} textAnchor="middle">
        <tspan x={0} dy={12}>
          {parts.date}
        </tspan>
        {parts.weekday && (
          <tspan x={0} dy={15}>
            {parts.weekday}
          </tspan>
        )}
      </text>
    </g>
  );
}

export function App() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);
  const [period, setPeriod] = useState<Period>("day");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [summaries, setSummaries] = useState<PeriodSummary[]>([]);
  const [games, setGames] = useState<PeriodGamePlaytime[]>([]);
  const [runs, setRuns] = useState<RunHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const t = TRANSLATIONS[language];

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      setLoading(false);
      return;
    }

    async function loadData() {
      const client = supabase;
      if (!client) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const [summaryResult, gameResult, runResult] = await Promise.all([
        client
          .from("v_period_summary")
          .select("period, period_start, total_minutes, games_played")
          .order("period_start", { ascending: true }),
        client
          .from("v_period_game_playtime")
          .select("period, period_start, appid, name, img_icon_hash, total_minutes")
          .order("period_start", { ascending: false })
          .order("total_minutes", { ascending: false }),
        client
          .from("v_run_history")
          .select("id, fetched_at, game_count, total_playtime_minutes, source")
          .order("fetched_at", { ascending: false })
          .limit(1),
      ]);

      const firstError = summaryResult.error ?? gameResult.error ?? runResult.error;
      if (firstError) {
        setError(firstError.message);
      } else {
        setSummaries((summaryResult.data ?? []) as PeriodSummary[]);
        setGames((gameResult.data ?? []) as PeriodGamePlaytime[]);
        setRuns((runResult.data ?? []) as RunHistory[]);
      }

      setLoading(false);
    }

    void loadData();
  }, []);

  const periodSummaries = useMemo(
    () =>
      summaries
        .filter((item) => item.period === period)
        .sort((a, b) => a.period_start.localeCompare(b.period_start)),
    [period, summaries],
  );

  useEffect(() => {
    const latest = [...periodSummaries].sort((a, b) =>
      compareDateDesc(a.period_start, b.period_start),
    )[0];
    if (latest && !periodSummaries.some((item) => item.period_start === selectedPeriod)) {
      setSelectedPeriod(latest.period_start);
    }
  }, [periodSummaries, selectedPeriod]);

  const selectedSummary = periodSummaries.find((item) => item.period_start === selectedPeriod);

  const selectedGames = useMemo(
    () =>
      games
        .filter((item) => item.period === period && item.period_start === selectedPeriod)
        .sort((a, b) => b.total_minutes - a.total_minutes),
    [games, period, selectedPeriod],
  );

  const chartRows = useMemo(() => {
    const limit = period === "day" ? 30 : period === "week" ? 16 : 12;
    return periodSummaries.slice(-limit).map((item) => ({
      minutes: item.total_minutes,
      hours: Number((item.total_minutes / 60).toFixed(2)),
      games: item.games_played,
      period_start: item.period_start,
    }));
  }, [language, period, periodSummaries]);

  const latestRun = runs[0];
  const topGame = selectedGames[0];
  const totalTrackedHours = latestRun
    ? Math.round(latestRun.total_playtime_minutes / 60)
    : 0;

  return (
    <main className="app-shell" lang={language === "zh" ? "zh-CN" : "en"}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Steam Playtime</p>
          <h1>Tracker</h1>
        </div>
        <div className="topbar-actions">
          <div className="sync-pill" title={t.lastRunTitle}>
            <Database size={16} aria-hidden="true" />
            <span>{formatDateTime(latestRun?.fetched_at, language)}</span>
          </div>
          <div className="language-toggle" role="group" aria-label={t.language}>
            {LANGUAGES.map((item) => (
              <button
                key={item}
                className={item === language ? "active" : ""}
                type="button"
                aria-pressed={item === language}
                onClick={() => setLanguage(item)}
              >
                {item === "zh" ? "中文" : "EN"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {!hasSupabaseConfig && (
        <section className="notice" role="status">
          {t.missingConfig}
        </section>
      )}

      {error && (
        <section className="notice danger" role="alert">
          {error}
        </section>
      )}

      <section className="controls" aria-label={t.dashboardControls}>
        <div className="segmented" role="tablist" aria-label={t.period}>
          {PERIODS.map((item) => (
            <button
              key={item}
              className={item === period ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={item === period}
              onClick={() => setPeriod(item)}
            >
              {t.periods[item]}
            </button>
          ))}
        </div>

        <label className="period-select">
          <CalendarDays size={18} aria-hidden="true" />
          <span className="period-select-display" aria-hidden="true">
            <PeriodLabel period={period} value={selectedPeriod} language={language} />
          </span>
          <select
            aria-label={t.period}
            value={selectedPeriod}
            onChange={(event) => setSelectedPeriod(event.target.value)}
            disabled={periodSummaries.length === 0}
          >
            {[...periodSummaries]
              .sort((a, b) => compareDateDesc(a.period_start, b.period_start))
              .map((item) => (
                <option key={item.period_start} value={item.period_start}>
                  {formatPeriodLabel(period, item.period_start, language)}
                </option>
              ))}
          </select>
        </label>
      </section>

      <section className="metrics" aria-label={t.keyMetrics}>
        <article className="metric-card">
          <Clock3 size={20} aria-hidden="true" />
          <span>{t.selected}</span>
          <strong>{formatDuration(selectedSummary?.total_minutes ?? 0, language)}</strong>
        </article>
        <article className="metric-card">
          <Trophy size={20} aria-hidden="true" />
          <span>{t.topGame}</span>
          <strong>{topGame ? topGame.name : t.none}</strong>
        </article>
        <article className="metric-card">
          <BarChart3 size={20} aria-hidden="true" />
          <span>{t.gamesPlayed}</span>
          <strong>{selectedSummary?.games_played ?? 0}</strong>
        </article>
        <article className="metric-card">
          <Gauge size={20} aria-hidden="true" />
          <span>{t.totalTracked}</span>
          <strong>
            {totalTrackedHours.toLocaleString(language === "zh" ? "zh-CN" : "en")}
            {t.hourUnit}
          </strong>
        </article>
      </section>

      <section className="main-grid">
        <div className="chart-panel">
          <div className="panel-heading">
            <h2>
              {language === "zh"
                ? `${t.periods[period]}${t.trend}`
                : `${t.periods[period]} ${t.trend}`}
            </h2>
            <span>
              {chartRows.length} {t.periodsCount}
            </span>
          </div>

          <div className="chart-frame">
            {loading ? (
              <div className="empty-state">{t.loading}</div>
            ) : chartRows.length === 0 ? (
              <div className="empty-state">{t.noPlaytime}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartRows} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="period_start"
                    height={44}
                    minTickGap={24}
                    tickLine={false}
                    tick={<PeriodAxisTick period={period} language={language} />}
                  />
                  <YAxis
                    width={42}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}${t.hourUnit}`}
                  />
                  <Tooltip
                    formatter={(value) => [`${value}${t.hourUnit}`, t.playtime]}
                    labelFormatter={(value) => formatPeriodLabel(period, String(value), language)}
                    labelStyle={{ color: "#0f172a" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="hours"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="chart-panel compact">
          <div className="panel-heading">
            <h2>{t.games}</h2>
            <PeriodLabel
              period={period}
              value={selectedPeriod}
              language={language}
              className="panel-date"
            />
          </div>

          <div className="bar-frame">
            {selectedGames.length === 0 ? (
              <div className="empty-state">{t.noGames}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart
                  data={selectedGames.slice(0, 8)}
                  layout="vertical"
                  margin={{ left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" hide />
                  <Tooltip
                    formatter={(value) => [
                      formatDuration(Number(value), language),
                      t.playtime,
                    ]}
                    labelStyle={{ color: "#0f172a" }}
                  />
                  <Bar dataKey="total_minutes" fill="#14b8a6" radius={[0, 6, 6, 0]} />
                </RechartsBarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      <section className="game-list" aria-label={t.gamesPlayed}>
        {selectedGames.map((game) => {
          const iconUrl = steamIconUrl(game.appid, game.img_icon_hash);
          return (
            <article className="game-row" key={game.appid}>
              {iconUrl ? (
                <img alt="" src={iconUrl} loading="lazy" />
              ) : (
                <div className="icon-fallback" aria-hidden="true">
                  {game.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <h3>{game.name}</h3>
                <p>
                  {t.app} {game.appid}
                </p>
              </div>
              <strong>{formatDuration(game.total_minutes, language)}</strong>
            </article>
          );
        })}
      </section>
    </main>
  );
}
