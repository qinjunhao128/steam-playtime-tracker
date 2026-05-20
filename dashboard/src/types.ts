export type Language = "en" | "zh";

export type Period = "day" | "week" | "month";

export type PeriodSummary = {
  period: Period;
  period_start: string;
  total_minutes: number;
  games_played: number;
};

export type PeriodGamePlaytime = {
  period: Period;
  period_start: string;
  appid: number;
  name: string;
  img_icon_hash: string | null;
  total_minutes: number;
};

export type RunHistory = {
  id: string;
  fetched_at: string;
  game_count: number;
  total_playtime_minutes: number;
  source: string;
};
