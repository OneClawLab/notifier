import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTmpNotifierHome } from '../helpers/tmp-dir.js';
import { ensureDirs, getPaths } from '../../src/paths.js';
import { serializeTaskFile, taskFileName } from '../../src/task-file.js';
import { parseTaskFile } from '../../src/task-file.js';
import { rename, readFile } from 'node:fs/promises';
import { executeCommand } from '../../src/executor.js';

// Inline processTaskFile logic (mirrors daemon.ts internal function)
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
    try {
      await rename(srcPath, join(errorDir, filename));
    } catch { /* ignore */ }
    return;
  }

  await executeCommand(result.value.command);

  try {
    await rename(srcPath, join(doneDir, filename));
  } catch { /* ignore */ }
}

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = null;
  }
});

describe('daemon instant task processing', () => {
  it('processes residual files: valid file is executed and moved to done/', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);
    const paths = getPaths(tmp.home);

    const task = {
      author: 'alice',
      task_id: 'residual-1',
      command: 'echo hello',
      created_at: new Date().toISOString(),
    };
    const filename = taskFileName(task.author, task.task_id);
    await writeFile(join(paths.tasksPending, filename), serializeTaskFile(task), 'utf8');

    await processTaskFile(filename, paths.tasksPending, paths.tasksDone, paths.tasksError);

    expect(existsSync(join(paths.tasksPending, filename))).toBe(false);
    expect(existsSync(join(paths.tasksDone, filename))).toBe(true);
    expect(existsSync(join(paths.tasksError, filename))).toBe(false);
  });

  it('format-error file is moved to error/', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);
    const paths = getPaths(tmp.home);

    const filename = 'bad-format.txt';
    // Missing required fields
    await writeFile(join(paths.tasksPending, filename), 'not=valid\n', 'utf8');

    await processTaskFile(filename, paths.tasksPending, paths.tasksDone, paths.tasksError);

    expect(existsSync(join(paths.tasksPending, filename))).toBe(false);
    expect(existsSync(join(paths.tasksError, filename))).toBe(true);
    expect(existsSync(join(paths.tasksDone, filename))).toBe(false);
  });

  it('non-zero exit code does not crash — file still moved to done/', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);
    const paths = getPaths(tmp.home);

    const task = {
      author: 'alice',
      task_id: 'failing-cmd',
      command: 'exit 1',
      created_at: new Date().toISOString(),
    };
    const filename = taskFileName(task.author, task.task_id);
    await writeFile(join(paths.tasksPending, filename), serializeTaskFile(task), 'utf8');

    // Should not throw
    await expect(
      processTaskFile(filename, paths.tasksPending, paths.tasksDone, paths.tasksError)
    ).resolves.toBeUndefined();

    expect(existsSync(join(paths.tasksPending, filename))).toBe(false);
    expect(existsSync(join(paths.tasksDone, filename))).toBe(true);
  });

  it('multiple residual files are all processed', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);
    const paths = getPaths(tmp.home);

    const tasks = [
      { author: 'alice', task_id: 'multi-1', command: 'echo 1', created_at: new Date().toISOString() },
      { author: 'alice', task_id: 'multi-2', command: 'echo 2', created_at: new Date().toISOString() },
      { author: 'alice', task_id: 'multi-3', command: 'echo 3', created_at: new Date().toISOString() },
    ];

    for (const task of tasks) {
      const filename = taskFileName(task.author, task.task_id);
      await writeFile(join(paths.tasksPending, filename), serializeTaskFile(task), 'utf8');
    }

    const files = (await readdir(paths.tasksPending)).filter(f => f.endsWith('.txt'));
    for (const f of files) {
      await processTaskFile(f, paths.tasksPending, paths.tasksDone, paths.tasksError);
    }

    const pendingAfter = (await readdir(paths.tasksPending)).filter(f => f.endsWith('.txt'));
    const doneAfter = (await readdir(paths.tasksDone)).filter(f => f.endsWith('.txt'));

    expect(pendingAfter).toHaveLength(0);
    expect(doneAfter).toHaveLength(3);
  });
});
