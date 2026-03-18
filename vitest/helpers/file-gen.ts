import * as fc from 'fast-check';
import type { TaskFile, TimerFile } from '../../src/types.js';

// Arbitrary for valid non-empty strings (no newlines, no = signs for keys)
const safeStringArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\n') && s.trim().length > 0);

// Arbitrary for ISO 8601 dates
const isoDateArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
  .filter(d => !isNaN(d.getTime()))
  .map(d => d.toISOString());

// Arbitrary for valid CRON expressions
export const validCronArb: fc.Arbitrary<string> = fc.tuple(
  fc.integer({ min: 0, max: 59 }),  // minute
  fc.integer({ min: 0, max: 23 }),  // hour
  fc.integer({ min: 1, max: 28 }),  // day (1-28 to avoid month-end issues)
  fc.integer({ min: 1, max: 12 }),  // month
  fc.integer({ min: 0, max: 6 }),   // weekday
).map(([m, h, d, mo, w]) => `${m} ${h} ${d} ${mo} ${w}`);

// Arbitrary for TaskFile
export const taskFileArb: fc.Arbitrary<TaskFile> = fc.record({
  author: safeStringArb,
  task_id: safeStringArb,
  command: safeStringArb,
  created_at: isoDateArb,
  description: fc.option(safeStringArb, { nil: undefined }),
}) as fc.Arbitrary<TaskFile>;

// Arbitrary for TimerFile
export const timerFileArb: fc.Arbitrary<TimerFile> = fc.record({
  author: safeStringArb,
  task_id: safeStringArb,
  command: safeStringArb,
  timer: validCronArb,
  timer_desc: safeStringArb,
  created_at: isoDateArb,
  description: fc.option(safeStringArb, { nil: undefined }),
  on_miss: fc.option(fc.constantFrom('skip' as const, 'run-once' as const), { nil: undefined }),
}) as fc.Arbitrary<TimerFile>;

// Helper: generate valid task file content string
export function makeTaskFileContent(overrides: Partial<Record<string, string>> = {}): string {
  const defaults = {
    author: 'test-author',
    task_id: 'test-task-1',
    command: 'echo hello',
    created_at: new Date().toISOString(),
  };
  const fields = { ...defaults, ...overrides };
  return Object.entries(fields).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
}

// Helper: generate valid timer file content string
export function makeTimerFileContent(overrides: Partial<Record<string, string>> = {}): string {
  const defaults = {
    author: 'test-author',
    task_id: 'test-timer-1',
    command: 'echo hello',
    timer: '0 9 * * 1-5',
    timer_desc: 'At 09:00, Monday through Friday',
    created_at: new Date().toISOString(),
  };
  const fields = { ...defaults, ...overrides };
  return Object.entries(fields).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
}
