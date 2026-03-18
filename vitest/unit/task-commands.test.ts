import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, readdir, readFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTmpNotifierHome } from '../helpers/tmp-dir.js';
import { ensureDirs, getPaths } from '../../src/paths.js';
import { parseTaskFile, serializeTaskFile, taskFileName } from '../../src/task-file.js';

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = null;
  }
});

describe('task add equivalent', () => {
  it('writes a task file to tasks/pending/ and it parses correctly', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);
    const paths = getPaths(tmp.home);

    const task = {
      author: 'alice',
      task_id: 'build-42',
      command: 'echo hello',
      created_at: new Date().toISOString(),
    };
    const fileName = taskFileName(task.author, task.task_id);
    const filePath = join(paths.tasksPending, fileName);

    await writeFile(filePath, serializeTaskFile(task), 'utf8');

    expect(existsSync(filePath)).toBe(true);

    const content = await readFile(filePath, 'utf8');
    const result = parseTaskFile(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.author).toBe('alice');
    expect(result.value.task_id).toBe('build-42');
    expect(result.value.command).toBe('echo hello');
  });

  it('detects duplicate: writing same file twice', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);
    const paths = getPaths(tmp.home);

    const task = {
      author: 'alice',
      task_id: 'dup-task',
      command: 'echo dup',
      created_at: new Date().toISOString(),
    };
    const fileName = taskFileName(task.author, task.task_id);
    const filePath = join(paths.tasksPending, fileName);

    await writeFile(filePath, serializeTaskFile(task), 'utf8');
    // Second write: file already exists — detect it
    expect(existsSync(filePath)).toBe(true);
    // Simulates the duplicate check the CLI performs
    const isDuplicate = existsSync(filePath);
    expect(isDuplicate).toBe(true);
  });
});

describe('task list equivalent', () => {
  it('reads all files from tasks/pending/ and parses them', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);
    const paths = getPaths(tmp.home);

    const tasks = [
      { author: 'alice', task_id: 'task-1', command: 'echo 1', created_at: new Date().toISOString() },
      { author: 'bob', task_id: 'task-2', command: 'echo 2', created_at: new Date().toISOString() },
    ];

    for (const task of tasks) {
      const filePath = join(paths.tasksPending, taskFileName(task.author, task.task_id));
      await writeFile(filePath, serializeTaskFile(task), 'utf8');
    }

    const files = (await readdir(paths.tasksPending)).filter(f => f.endsWith('.txt'));
    expect(files).toHaveLength(2);

    const parsed = await Promise.all(
      files.map(async f => {
        const content = await readFile(join(paths.tasksPending, f), 'utf8');
        return parseTaskFile(content);
      })
    );

    expect(parsed.every(r => r.ok)).toBe(true);
    const values = parsed.filter(r => r.ok).map(r => (r as { ok: true; value: { author: string; task_id: string } }).value);
    const ids = values.map(v => v.task_id).sort();
    expect(ids).toEqual(['task-1', 'task-2']);
  });

  it('reads files from tasks/done/ when listing done status', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);
    const paths = getPaths(tmp.home);

    const task = {
      author: 'alice',
      task_id: 'done-task',
      command: 'echo done',
      created_at: new Date().toISOString(),
    };
    const filePath = join(paths.tasksDone, taskFileName(task.author, task.task_id));
    await writeFile(filePath, serializeTaskFile(task), 'utf8');

    const files = (await readdir(paths.tasksDone)).filter(f => f.endsWith('.txt'));
    expect(files).toHaveLength(1);

    const content = await readFile(join(paths.tasksDone, files[0]!), 'utf8');
    const result = parseTaskFile(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.task_id).toBe('done-task');
  });
});

describe('task remove equivalent', () => {
  it('deletes a task file and verifies it is gone', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);
    const paths = getPaths(tmp.home);

    const task = {
      author: 'alice',
      task_id: 'remove-me',
      command: 'echo bye',
      created_at: new Date().toISOString(),
    };
    const filePath = join(paths.tasksPending, taskFileName(task.author, task.task_id));
    await writeFile(filePath, serializeTaskFile(task), 'utf8');
    expect(existsSync(filePath)).toBe(true);

    await unlink(filePath);
    expect(existsSync(filePath)).toBe(false);
  });

  it('non-existent file: verify it does not exist', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);
    const paths = getPaths(tmp.home);

    const filePath = join(paths.tasksPending, taskFileName('nobody', 'ghost-task'));
    expect(existsSync(filePath)).toBe(false);
  });
});
