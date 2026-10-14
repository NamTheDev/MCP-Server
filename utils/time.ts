import {
  DATE_ONLY_RE,
  DAY,
  DEFAULT_HOUR,
  HOUR,
  MIN,
  MONTH,
  REL_RE,
  SEC,
  UNITS,
  WEEK,
  YEAR,
} from "../config/time";

const atDefaultHour = (d: Date): Date => {
  const c = new Date(d);
  c.setHours(DEFAULT_HOUR, 0, 0, 0);
  return c;
};

export function parseWhen(input: string): Date | null {
  const s = input.trim();
  if (!s) return null;

  const rel = REL_RE.exec(s);
  if (rel) {
    const [, nRaw, unitRaw] = rel;
    if (nRaw !== undefined && unitRaw !== undefined) {
      const n = Number(nRaw);
      const unit = UNITS[unitRaw.toLowerCase()];
      if (Number.isFinite(n) && unit !== undefined) {
        return new Date(Date.now() + n * unit);
      }
    }
  }

  const low = s.toLowerCase();
  if (low === "tomorrow") {
    const d = new Date(); d.setDate(d.getDate() + 1); return atDefaultHour(d);
  }
  if (low === "next week") {
    const d = new Date(); d.setDate(d.getDate() + 7); return atDefaultHour(d);
  }
  if (low === "next month") {
    const d = new Date(); d.setMonth(d.getMonth() + 1); return atDefaultHour(d);
  }
  if (low === "next year") {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1); return atDefaultHour(d);
  }

  const dateOnly = DATE_ONLY_RE.exec(s);
  if (dateOnly) {
    const [, y, mo, da] = dateOnly;
    if (y !== undefined && mo !== undefined && da !== undefined) {
      const d = new Date(Number(y), Number(mo) - 1, Number(da), DEFAULT_HOUR, 0, 0, 0);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function humanDelta(ms: number): string {
  const past = ms < 0;
  const abs = Math.abs(ms);
  const table: [number, string][] = [
    [YEAR, "year"], [MONTH, "month"], [WEEK, "week"],
    [DAY, "day"], [HOUR, "hour"], [MIN, "minute"], [SEC, "second"],
  ];
  for (const [unit, name] of table) {
    if (abs >= unit) {
      const n = Math.round(abs / unit);
      const label = `${n} ${name}${n === 1 ? "" : "s"}`;
      return past ? `${label} ago` : `in ${label}`;
    }
  }
  return "now";
}

export function fmt(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
