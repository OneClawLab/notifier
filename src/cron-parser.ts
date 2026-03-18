import type { CronParseResult, ParseResult } from './types.js';

const FIELD_NAMES = ['minute', 'hour', 'day', 'month', 'weekday'] as const;
type FieldName = (typeof FIELD_NAMES)[number];

interface FieldRange {
  min: number;
  max: number;
}

const FIELD_RANGES: Record<FieldName, FieldRange> = {
  minute:  { min: 0, max: 59 },
  hour:    { min: 0, max: 23 },
  day:     { min: 1, max: 31 },
  month:   { min: 1, max: 12 },
  weekday: { min: 0, max: 7 },
};

/**
 * Parse a single CRON field expression into a sorted array of matching values.
 * Returns null if the expression is invalid.
 */
function parseField(expr: string, range: FieldRange): number[] | null {
  const { min, max } = range;
  const values = new Set<number>();

  // Handle comma-separated list
  const parts = expr.split(',');
  for (const part of parts) {
    if (part === '*') {
      for (let i = min; i <= max; i++) values.add(i);
    } else if (part.startsWith('*/')) {
      const step = parseInt(part.slice(2), 10);
      if (isNaN(step) || step <= 0) return null;
      for (let i = min; i <= max; i += step) values.add(i);
    } else if (part.includes('/')) {
      // range/step: a-b/n
      const slashIdx = part.indexOf('/');
      const rangePart = part.slice(0, slashIdx);
      const stepStr = part.slice(slashIdx + 1);
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) return null;
      if (rangePart.includes('-')) {
        const dashIdx = rangePart.indexOf('-');
        const aStr = rangePart.slice(0, dashIdx);
        const bStr = rangePart.slice(dashIdx + 1);
        const a = parseInt(aStr, 10);
        const b = parseInt(bStr, 10);
        if (isNaN(a) || isNaN(b) || a < min || b > max || a > b) return null;
        for (let i = a; i <= b; i += step) values.add(i);
      } else {
        return null;
      }
    } else if (part.includes('-')) {
      const dashIdx = part.indexOf('-');
      const aStr = part.slice(0, dashIdx);
      const bStr = part.slice(dashIdx + 1);
      const a = parseInt(aStr, 10);
      const b = parseInt(bStr, 10);
      if (isNaN(a) || isNaN(b) || a < min || b > max || a > b) return null;
      for (let i = a; i <= b; i++) values.add(i);
    } else {
      const n = parseInt(part, 10);
      if (isNaN(n) || n < min || n > max) return null;
      values.add(n);
    }
  }

  return [...values].sort((a, b) => a - b);
}

interface ParsedCron {
  minute: number[];
  hour: number[];
  day: number[];
  month: number[];
  weekday: number[];
}

function parseCronFields(expr: string): ParseResult<ParsedCron> {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    return { ok: false, error: `Invalid CRON expression: expected 5 fields, got ${fields.length}` };
  }

  const exprs: [FieldName, string][] = [
    ['minute', fields[0]!],
    ['hour', fields[1]!],
    ['day', fields[2]!],
    ['month', fields[3]!],
    ['weekday', fields[4]!],
  ];

  const result: Partial<ParsedCron> = {};
  for (const [name, fieldExpr] of exprs) {
    const values = parseField(fieldExpr, FIELD_RANGES[name]);
    if (values === null || values.length === 0) {
      return { ok: false, error: `Invalid CRON expression: invalid value in field "${name}"` };
    }
    result[name] = values;
  }

  return { ok: true, value: result as ParsedCron };
}

/**
 * Check if a given date matches the parsed CRON fields.
 * Weekday: 0 and 7 both mean Sunday.
 */
function matchesCron(cron: ParsedCron, date: Date): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const day = date.getDate();
  const month = date.getMonth() + 1; // 1-based
  const weekday = date.getDay(); // 0=Sunday

  if (!cron.minute.includes(minute)) return false;
  if (!cron.hour.includes(hour)) return false;
  if (!cron.month.includes(month)) return false;
  if (!cron.day.includes(day)) return false;

  // Weekday: 0 and 7 both mean Sunday
  const normalizedWeekdays = cron.weekday.map(w => (w === 7 ? 0 : w));
  if (!normalizedWeekdays.includes(weekday)) return false;

  return true;
}

/**
 * Calculate the next trigger time after `now` (strictly greater than now).
 * Advances minute-by-minute, up to 366 days.
 */
function calcNextTime(cron: ParsedCron, now: Date): Date | null {
  // Start from the next minute
  const start = new Date(now);
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  const maxMs = 366 * 24 * 60 * 60 * 1000;
  const limit = new Date(now.getTime() + maxMs);

  const candidate = new Date(start);
  while (candidate <= limit) {
    if (matchesCron(cron, candidate)) {
      return new Date(candidate);
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return null;
}

// ─── Description generation ──────────────────────────────────────────────────

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  const suffix = s[(v - 20) % 10] ?? s[v] ?? s[0] ?? 'th';
  return n + suffix;
}

function describeFieldValues(values: number[], type: FieldName): string {
  const range = FIELD_RANGES[type];
  const isAll = values.length === (range.max - range.min + 1);

  if (isAll) return 'every ' + type;

  if (type === 'weekday') {
    // Normalize 7 -> 0
    const normalized = [...new Set(values.map(v => (v === 7 ? 0 : v)))].sort((a, b) => a - b);
    const names = normalized.map(v => WEEKDAY_NAMES[v]);
    return names.join(', ');
  }

  if (type === 'month') {
    const names = values.map(v => MONTH_NAMES[v]);
    return names.join(', ');
  }

  if (type === 'minute' || type === 'hour' || type === 'day') {
    if (type === 'day') return values.map(ordinal).join(', ');
    return values.join(', ');
  }

  return values.join(', ');
}

function generateDescription(cron: ParsedCron): string {
  const minuteRange = FIELD_RANGES.minute;
  const hourRange = FIELD_RANGES.hour;
  const dayRange = FIELD_RANGES.day;
  const monthRange = FIELD_RANGES.month;
  const weekdayRange = FIELD_RANGES.weekday;

  const allMinutes = cron.minute.length === (minuteRange.max - minuteRange.min + 1);
  const allHours = cron.hour.length === (hourRange.max - hourRange.min + 1);
  const allDays = cron.day.length === (dayRange.max - dayRange.min + 1);
  const allMonths = cron.month.length === (monthRange.max - monthRange.min + 1);
  // weekday 0-7 has 8 values but 0 and 7 are both Sunday, so "all" means all 7 days
  const normalizedWeekdays = [...new Set(cron.weekday.map(v => (v === 7 ? 0 : v)))];
  const allWeekdays = normalizedWeekdays.length === 7;

  // Build time part
  let timePart: string;
  if (allMinutes && allHours) {
    timePart = 'every minute';
  } else if (allMinutes) {
    const hourDesc = describeFieldValues(cron.hour, 'hour');
    timePart = `every minute of hour ${hourDesc}`;
  } else if (allHours) {
    const minDesc = cron.minute.join(', ');
    timePart = `at minute ${minDesc} of every hour`;
  } else {
    // Specific hours and minutes
    const times = cron.hour.flatMap(h =>
      cron.minute.map(m => {
        const hh = String(h).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        return `${hh}:${mm}`;
      })
    );
    timePart = `at ${times.join(', ')}`;
  }

  // Build day/weekday part
  let dayPart: string;
  if (allDays && allWeekdays) {
    dayPart = 'every day';
  } else if (!allDays && allWeekdays) {
    dayPart = `on the ${describeFieldValues(cron.day, 'day')} of the month`;
  } else if (allDays && !allWeekdays) {
    dayPart = `on ${describeFieldValues(cron.weekday, 'weekday')}`;
  } else {
    dayPart = `on the ${describeFieldValues(cron.day, 'day')} and on ${describeFieldValues(cron.weekday, 'weekday')}`;
  }

  // Build month part
  let monthPart: string;
  if (allMonths) {
    monthPart = '';
  } else {
    monthPart = ` in ${describeFieldValues(cron.month, 'month')}`;
  }

  return `Runs ${timePart}, ${dayPart}${monthPart}`.trim();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function parseCron(expr: string, now?: Date): ParseResult<CronParseResult> {
  const fieldsResult = parseCronFields(expr);
  if (!fieldsResult.ok) return fieldsResult;

  const cron = fieldsResult.value;
  const base = now ?? new Date();
  const nextTime = calcNextTime(cron, base);

  if (nextTime === null) {
    return { ok: false, error: 'CRON expression never triggers within 366 days' };
  }

  const description = generateDescription(cron);
  return { ok: true, value: { nextTime, description } };
}

export function describeCron(expr: string): ParseResult<string> {
  const fieldsResult = parseCronFields(expr);
  if (!fieldsResult.ok) return fieldsResult;

  const description = generateDescription(fieldsResult.value);
  return { ok: true, value: description };
}
