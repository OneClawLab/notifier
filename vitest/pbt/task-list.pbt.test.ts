// Feature: notifier-daemon, Property 7: task list --json 输出合法 JSON 数组
import { describe, it, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTmpNotifierHome } from '../helpers/tmp-dir.js';
import { ensureDirs, getPaths } from '../../src/paths.js';
import { parseTaskFile, serializeTaskFile, taskFileName } from '../../src/task-file.js';
import type { TaskFile } from '../../src/types.js';

// Filesystem-safe string: alphanumeric + hyphen/underscore only
const fsafeArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/);

const fsafeTaskFileArb: fc.Arbitrary<TaskFile> = fc.record({
  author: fsafeArb,
  task_id: fsafeArb,
  command: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\n') && s.trim().length > 0),
  created_at: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).filter(d => !isNaN(d.getTime())).map(d => d.toISOString()),
  description: fc.option(fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.includes('\n')), { nil: undefined }),
}) as fc.Arbitrary<TaskFile>;

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = null;
  }
});

describe('Property 7: task list --json 输出合法 JSON 数组', () => {
  it('reading and parsing task files produces a valid array with required fields', async () => {
    // Validates: Requirements 6.3
    await fc.assert(
      fc.asyncProperty(
        fc.array(fsafeTaskFileArb, { minLength: 0, maxLength: 10 }),
        async (tasks) => {
          const tmp = await createTmpNotifierHome();
          cleanup = tmp.cleanup;
          await ensureDirs(tmp.home);
          const paths = getPaths(tmp.home);

          // Deduplicate by author+task_id to avoid filename collisions
          const seen = new Set<string>();
          const uniqueTasks: TaskFile[] = [];
          for (const t of tasks) {
            const key = `${t.author}-${t.task_id}`;
            if (!seen.has(key)) {
              seen.add(key);
              uniqueTasks.push(t);
            }
          }

          // Write all task files
          for (const task of uniqueTasks) {
            const filePath = join(paths.tasksPending, taskFileName(task.author, task.task_id));
            await writeFile(filePath, serializeTaskFile(task), 'utf8');
          }

          // Simulate task list --json: read and parse all files
          const { readdir, readFile } = await import('node:fs/promises');
          const files = (await readdir(paths.tasksPending)).filter(f => f.endsWith('.txt'));

          const parsed = await Promise.all(
            files.map(async f => {
              const content = await readFile(join(paths.tasksPending, f), 'utf8');
              return parseTaskFile(content);
            })
          );

          // All must parse successfully
          if (!parsed.every(r => r.ok)) return false;

          // Simulate JSON output
          const jsonOutput = JSON.stringify(parsed.filter(r => r.ok).map(r => (r as { ok: true; value: TaskFile }).value));

          // Must be valid JSON array
          let arr: unknown;
          try {
            arr = JSON.parse(jsonOutput);
          } catch {
            return false;
          }

          if (!Array.isArray(arr)) return false;

          // Each element must have author, task_id, command
          return arr.every(
            (item): item is { author: unknown; task_id: unknown; command: unknown } =>
              typeof item === 'object' &&
              item !== null &&
              'author' in item &&
              'task_id' in item &&
              'command' in item
          );
        }
      ),
      { numRuns: 50 }
    );
  });
});
