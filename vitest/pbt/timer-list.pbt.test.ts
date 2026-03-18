// Feature: notifier-daemon, Property 8: timer list --json 输出合法 JSON 数组
import { describe, it, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTmpNotifierHome } from '../helpers/tmp-dir.js';
import { ensureDirs, getPaths } from '../../src/paths.js';
import { parseTimerFile, serializeTimerFile, timerFileName } from '../../src/timer-file.js';
import type { TimerFile } from '../../src/types.js';

// Filesystem-safe string: alphanumeric + hyphen/underscore only
const fsafeArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/);

const fsafeTimerFileArb: fc.Arbitrary<TimerFile> = fc.record({
  author: fsafeArb,
  task_id: fsafeArb,
  command: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\n') && s.trim().length > 0),
  timer: fc.tuple(
    fc.integer({ min: 0, max: 59 }),
    fc.integer({ min: 0, max: 23 }),
    fc.integer({ min: 1, max: 28 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 0, max: 6 }),
  ).map(([m, h, d, mo, w]) => `${m} ${h} ${d} ${mo} ${w}`),
  timer_desc: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\n') && s.trim().length > 0),
  created_at: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).filter(d => !isNaN(d.getTime())).map(d => d.toISOString()),
  description: fc.option(
    fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.includes('\n')),
    { nil: undefined }
  ),
  on_miss: fc.option(fc.constantFrom('skip' as const, 'run-once' as const), { nil: undefined }),
}) as fc.Arbitrary<TimerFile>;

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = null;
  }
});

describe('Property 8: timer list --json 输出合法 JSON 数组', () => {
  it('reading and parsing timer files produces a valid array with required fields', async () => {
    // Validates: Requirements 9.2
    await fc.assert(
      fc.asyncProperty(
        fc.array(fsafeTimerFileArb, { minLength: 0, maxLength: 10 }),
        async (timers) => {
          const tmp = await createTmpNotifierHome();
          cleanup = tmp.cleanup;
          await ensureDirs(tmp.home);
          const paths = getPaths(tmp.home);

          // Deduplicate by author+task_id to avoid filename collisions
          const seen = new Set<string>();
          const uniqueTimers: TimerFile[] = [];
          for (const t of timers) {
            const key = `${t.author}-${t.task_id}`;
            if (!seen.has(key)) {
              seen.add(key);
              uniqueTimers.push(t);
            }
          }

          // Write all timer files
          for (const timer of uniqueTimers) {
            const filePath = join(paths.timers, timerFileName(timer.author, timer.task_id));
            await writeFile(filePath, serializeTimerFile(timer), 'utf8');
          }

          // Simulate timer list --json: read and parse all files
          const { readdir, readFile } = await import('node:fs/promises');
          const files = (await readdir(paths.timers)).filter(f => f.endsWith('.txt'));

          const parsed = await Promise.all(
            files.map(async f => {
              const content = await readFile(join(paths.timers, f), 'utf8');
              return parseTimerFile(content);
            })
          );

          // All must parse successfully
          if (!parsed.every(r => r.ok)) return false;

          // Simulate JSON output
          const jsonOutput = JSON.stringify(
            parsed.filter(r => r.ok).map(r => (r as { ok: true; value: TimerFile }).value)
          );

          // Must be valid JSON array
          let arr: unknown;
          try {
            arr = JSON.parse(jsonOutput);
          } catch {
            return false;
          }

          if (!Array.isArray(arr)) return false;

          // Each element must have author, task_id, timer, timer_desc, command
          return arr.every(
            (item): boolean =>
              typeof item === 'object' &&
              item !== null &&
              'author' in item &&
              'task_id' in item &&
              'timer' in item &&
              'timer_desc' in item &&
              'command' in item
          );
        }
      ),
      { numRuns: 50 }
    );
  });
});
