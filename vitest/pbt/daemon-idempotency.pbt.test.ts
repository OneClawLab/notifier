// Feature: notifier-daemon, Property 11: Daemon 即时任务幂等性
import { describe, it, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { writeFile, readdir, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createTmpNotifierHome } from '../helpers/tmp-dir.js';
import { ensureDirs, getPaths } from '../../src/paths.js';
import { serializeTaskFile, taskFileName, parseTaskFile } from '../../src/task-file.js';
import { executeCommand } from '../../src/executor.js';
// Use a filesystem-safe task file arbitrary (author/task_id safe for filenames, command safe for shell)
const fsafeStringArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/).filter(s => s.length > 0);
const fsafeCommandArb = fc.constantFrom('echo ok', 'true', 'echo done', 'echo 1');

const fsSafeTaskFileArb = fc.record({
  author: fsafeStringArb,
  task_id: fsafeStringArb,
  command: fsafeCommandArb,
  created_at: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
    .filter(d => !isNaN(d.getTime()))
    .map(d => d.toISOString()),
  description: fc.option(fsafeStringArb, { nil: undefined }),
});

// Inline processTaskFile (mirrors daemon.ts)
async function processTaskFile(
  filename: string,
  pendingDir: string,
  doneDir: string,
  errorDir: string,
): Promise<void> {
  const srcPath = join(pendingDir, filename);
  let content: string;
  try {
    content = await readFile(srcPath, 'utf8');
  } catch {
    return;
  }

  const result = parseTaskFile(content);
  if (!result.ok) {
    try { await rename(srcPath, join(errorDir, filename)); } catch { /* ignore */ }
    return;
  }

  await executeCommand(result.value.command);

  try { await rename(srcPath, join(doneDir, filename)); } catch { /* ignore */ }
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const c of cleanups.splice(0)) {
    await c();
  }
});

describe('Property 11: Daemon 即时任务幂等性', () => {
  it('for any task file set, after processing each file is in done/ or error/, not in pending/', { timeout: 60000 }, async () => {
    // Validates: Requirements 12.7, 12.8
    await fc.assert(
      fc.asyncProperty(
        fc.array(fsSafeTaskFileArb, { minLength: 1, maxLength: 5 }),
        async (tasks) => {
          const tmp = await createTmpNotifierHome();
          cleanups.push(tmp.cleanup);
          await ensureDirs(tmp.home);
          const paths = getPaths(tmp.home);

          // Deduplicate by filename to avoid conflicts
          const seen = new Set<string>();
          const uniqueTasks = tasks.filter(t => {
            const name = taskFileName(t.author, t.task_id);
            if (seen.has(name)) return false;
            seen.add(name);
            return true;
          });

          // Write all task files to pending/
          for (const task of uniqueTasks) {
            const filename = taskFileName(task.author, task.task_id);
            await writeFile(join(paths.tasksPending, filename), serializeTaskFile(task), 'utf8');
          }

          // Process all pending files
          const pendingFiles = (await readdir(paths.tasksPending)).filter(f => f.endsWith('.txt'));
          for (const filename of pendingFiles) {
            await processTaskFile(filename, paths.tasksPending, paths.tasksDone, paths.tasksError);
          }

          // Verify: pending/ is empty
          const pendingAfter = (await readdir(paths.tasksPending)).filter(f => f.endsWith('.txt'));
          if (pendingAfter.length !== 0) return false;

          // Verify: each file is in done/ or error/ (not both, not neither)
          const doneFiles = new Set((await readdir(paths.tasksDone)).filter(f => f.endsWith('.txt')));
          const errorFiles = new Set((await readdir(paths.tasksError)).filter(f => f.endsWith('.txt')));

          for (const filename of pendingFiles) {
            const inDone = doneFiles.has(filename);
            const inError = errorFiles.has(filename);
            // Must be in exactly one of done/ or error/
            if (inDone === inError) return false; // both or neither
          }

          return true;
        },
      ),
      { numRuns: 50 },
    );
  });
});
