import type { CronParseResult, ParseResult } from './types.js';

// Supports both 5-field (minute hour day month weekday)
// and 6-field (second minute hour day month weekday) CRON expressions.

const FIELD_NAMES_5 = ['minute', 'hour', 'day', 'month', 'weekday'] as const;
const FIELD_NAMES_6 = ['second', 'minute', 'hour', 'day', 'month', 'weekday'] as const;
type FieldName = (typeof FIELD_NAMES_6)[number];

interface FieldRange {
  min: number;
  max: number;
}

const FIELD_RANGES: Record<FieldName, FieldRange> = {
  second:  { min: 0, max: 59 },
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

  const parts = expr.split(',');
  for (const part of parts) {
    if (part === '*') {
      for (let i = min; i <= max; i++) values.add(i);
    } else if (part.startsWith('*/')) {
      const step = parseInt(part.slice(2), 10);
      if (isNaN(step) || step <= 0) return null;
      for (let i = min; i <= max; i += step) values.add(i);
    } else if (part.includes('/')) {
      const slashIdx = part.indexOf('/');
      const rangePart = part.slice(0, slashIdx);
      const stepStr = part.slice(slashIdx + 1);
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) return null;
      if (rangePart.includes('-')) {
        const dashIdx = rangePart.indexOf('-');
        const a = parseInt(rangePart.slice(0, dashIdx), 10);
        const b = parseInt(rangePart.slice(dashIdx + 1), 10);
        if (isNaN(a) || isNaN(b) || a < min || b > max || a > b) return null;
        for (let i = a; i <= b; i += step) values.add(i);
      } else {
        return null;
      }
    } else if (part.includes('-')) {
      const dashIdx = part.indexOf('-');
      const a = parseInt(part.slice(0, dashIdx), 10);
      const b = parseInt(part.slice(dashIdx + 1), 10);
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
  second: number[];   // always present; [0] for 5-field expressions
  minute: number[];
  hour: number[];
  day: number[];
  month: number[];
  weekday: number[];
  hasSeconds: boolean;
}

function parseCronFields(expr: string): ParseResult<ParsedCron> {
  const fields = expr.trim().split(/\s+/);

  let fieldDefs: [FieldName, string][];
  let hasSeconds: boolean;

  if (fields.length === 5) {
    hasSeconds = false;
    fieldDefs = [
      ['minute',  fields[0]!],
      ['hour',    fields[1]!],
      ['day',     fields[2]!],
      ['month',   fields[3]!],
      ['weekday', fields[4]!],
    ];
  } else if (fields.length === 6) {
    hasSeconds = true;
    fieldDefs = [
      ['second',  fields[0]!],
      ['minute',  fields[1]!],
      ['hour',    fields[2]!],
      ['day',     fields[3]!],
      ['month',   fields[4]!],
      ['weekday', fields[5]!],
    ];
  } else {
    return { ok: false, error: `Invalid CRON expression: expected 5 or 6 fields, got ${fields.length}` };
  }

  const result: Partial<ParsedCron> = { hasSeconds };

  // For 5-field, second is always 0
  if (!hasSeconds) {
    result.second = [0];
  }

  for (const [name, fieldExpr] of fieldDefs) {
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
  const second  = date.getSeconds();
  const minute  = date.getMinutes();
  const hour    = date.getHours();
  const day     = date.getDate();
  const month   = date.getMonth() + 1;
  const weekday = date.getDay();

  if (!cron.second.includes(second))  return false;
  if (!cron.minute.includes(minute))  return false;
  if (!cron.hour.includes(hour))      return false;
  if (!cron.month.includes(month))    return false;
  if (!cron.day.includes(day))        return false;

  const normalizedWeekdays = cron.weekday.map(w => (w === 7 ? 0 : w));
  if (!normalizedWeekdays.includes(weekday)) return false;

  return true;
}

/**
 * Calculate the next trigger time strictly after `now`.
 * Steps by second for 6-field expressions, by minute for 5-field.
 */
function calcNextTime(cron: ParsedCron, now: Date): Date | null {
  const stepMs = cron.hasSeconds ? 1_000 : 60_000;
  const maxMs  = 366 * 24 * 60 * 60 * 1000;
  const limit  = new Date(now.getTime() + maxMs);

  // Start from the next step boundary after now
  const start = new Date(now.getTime() + stepMs);
  if (cron.hasSeconds) {
    start.setMilliseconds(0);
  } else {
    start.setSeconds(0, 0);
    // already advanced by 60s above, but re-align to next minute boundary
    start.setTime(now.getTime());
    start.setSeconds(0, 0);
    start.setMinutes(start.getMinutes() + 1);
  }

  const candidate = new Date(start);
  while (candidate <= limit) {
    if (matchesCron(cron, candidate)) {
      return new Date(candidate);
    }
    candidate.setTime(candidate.getTime() + stepMs);
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
    const normalized = [...new Set(values.map(v => (v === 7 ? 0 : v)))].sort((a, b) => a - b);
    return normalized.map(v => WEEKDAY_NAMES[v]).join(', ');
  }
  if (type === 'month') return values.map(v => MONTH_NAMES[v]).join(', ');
  if (type === 'day')   return values.map(ordinal).join(', ');
  return values.join(', ');
}

function generateDescription(cron: ParsedCron): string {
  const allSeconds  = cron.second.length  === 60;
  const allMinutes  = cron.minute.length  === 60;
  const allHours    = cron.hour.length    === 24;
  const allDays     = cron.day.length     === 31;
  const allMonths   = cron.month.length   === 12;
  const normalizedWeekdays = [...new Set(cron.weekday.map(v => (v === 7 ? 0 : v)))];
  const allWeekdays = normalizedWeekdays.length === 7;

  // Build time part
  let timePart: string;
  if (cron.hasSeconds) {
    if (allSeconds && allMinutes && allHours) {
      timePart = 'every second';
    } else if (allSeconds && allMinutes) {
      timePart = `every second of hour ${describeFieldValues(cron.hour, 'hour')}`;
    } else if (allSeconds) {
      timePart = `every second of minute ${cron.minute.join(', ')}`;
    } else {
      const secDesc = cron.second.join(', ');
      if (allMinutes && allHours) {
        timePart = `at second ${secDesc} of every minute`;
      } else {
        timePart = `at second ${secDesc} of minute ${cron.minute.join(', ')}`;
      }
    }
  } else {
    if (allMinutes && allHours) {
      timePart = 'every minute';
    } else if (allMinutes) {
      timePart = `every minute of hour ${describeFieldValues(cron.hour, 'hour')}`;
    } else if (allHours) {
      timePart = `at minute ${cron.minute.join(', ')} of every hour`;
    } else {
      const times = cron.hour.flatMap(h =>
        cron.minute.map(m => {
          const hh = String(h).padStart(2, '0');
          const mm = String(m).padStart(2, '0');
          return `${hh}:${mm}`;
        })
      );
      timePart = `at ${times.join(', ')}`;
    }
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

  const monthPart = allMonths ? '' : ` in ${describeFieldValues(cron.month, 'month')}`;

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
  return { ok: true, value: generateDescription(fieldsResult.value) };
}

/**
 * Whether the expression uses second-level precision (6 fields).
 * Used by the daemon to decide its tick interval.
 */
export function cronHasSeconds(expr: string): boolean {
  return expr.trim().split(/\s+/).length === 6;
}
