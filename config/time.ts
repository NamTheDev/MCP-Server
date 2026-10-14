export const SEC = 1000;
export const MIN = 60 * SEC;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;
export const MONTH = 30 * DAY;
export const YEAR = 365 * DAY;

/** Hour (local) that bare words like "tomorrow" and date-only strings land on. */
export const DEFAULT_HOUR = 9;

export const UNITS: Record<string, number> = {
  s: SEC, sec: SEC, secs: SEC, second: SEC, seconds: SEC,
  m: MIN, min: MIN, mins: MIN, minute: MIN, minutes: MIN,
  h: HOUR, hr: HOUR, hrs: HOUR, hour: HOUR, hours: HOUR,
  d: DAY, day: DAY, days: DAY,
  w: WEEK, wk: WEEK, wks: WEEK, week: WEEK, weeks: WEEK,
  mo: MONTH, month: MONTH, months: MONTH,
  y: YEAR, yr: YEAR, yrs: YEAR, year: YEAR, years: YEAR,
};

export const REL_RE = /^(?:in\s+)?(\d+(?:\.\d+)?)\s*([a-z]+)$/i;
export const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
