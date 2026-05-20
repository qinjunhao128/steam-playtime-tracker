import type { Language, Period } from "./types";

const LOCALES: Record<Language, string> = {
  en: "en",
  zh: "zh-CN",
};

export type PeriodLabelParts = {
  date: string;
  weekday: string | null;
};

function formatDatePart(date: Date, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatWeekdayPart(date: Date, language: Language): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    weekday: language === "zh" ? "long" : "short",
  }).format(date);
}

function formatDateWithWeekday(date: Date, language: Language): PeriodLabelParts {
  return {
    date: formatDatePart(date, language),
    weekday: formatWeekdayPart(date, language),
  };
}

export function formatPeriodLabelParts(
  period: Period,
  value: string,
  language: Language,
): PeriodLabelParts {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return { date: value, weekday: null };
  }

  if (period === "day" || period === "week") {
    return formatDateWithWeekday(date, language);
  }

  return {
    date: new Intl.DateTimeFormat(LOCALES[language], {
      year: "numeric",
      month: "short",
    }).format(date),
    weekday: null,
  };
}

function joinPeriodLabelParts(parts: PeriodLabelParts): string {
  return parts.weekday ? `${parts.date} ${parts.weekday}` : parts.date;
}

function formatDateTimeParts(date: Date, language: Language): string {
  const datePart = new Intl.DateTimeFormat(LOCALES[language], {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
  const weekdayPart = formatWeekdayPart(date, language);
  const timePart = new Intl.DateTimeFormat(LOCALES[language], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${datePart} ${weekdayPart} ${timePart}`;
}

export function formatDuration(minutes: number, language: Language): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return language === "zh" ? "0分钟" : "0m";
  }
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (language === "zh") {
    if (hours === 0) {
      return `${mins}分钟`;
    }
    if (mins === 0) {
      return `${hours}小时`;
    }
    return `${hours}小时${mins}分钟`;
  }
  if (hours === 0) {
    return `${mins}m`;
  }
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

export function formatPeriodLabel(period: Period, value: string, language: Language): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const locale = LOCALES[language];

  if (period === "day") {
    return joinPeriodLabelParts(formatPeriodLabelParts(period, value, language));
  }

  if (period === "week") {
    const formatted = joinPeriodLabelParts(formatPeriodLabelParts(period, value, language));
    return language === "zh" ? formatted : `Week of ${formatted}`;
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
  }).format(date);
}

export function formatDateTime(value: string | undefined, language: Language): string {
  if (!value) {
    return language === "zh" ? "从未同步" : "Never";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return formatDateTimeParts(date, language);
}

export function steamIconUrl(appid: number, iconHash: string | null): string | null {
  if (!iconHash) {
    return null;
  }
  return `https://media.steampowered.com/steamcommunity/public/images/apps/${appid}/${iconHash}.jpg`;
}
