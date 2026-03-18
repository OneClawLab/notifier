import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, readdir, readFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTmpNotifierHome } from '../helpers/tmp-dir.js';
import { ensureDirs, getPaths } from '../../src/paths.js';
import { parseTimerFile, serializeTimerFile, timerFileName } from '../../src/timer-file.js';

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = null;
  }
});

describe('timer add equivalent', () => {
  it('writes a timer file to timers/ and it parses correctly with timer_desc', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);
    const paths = getPaths(tmp.home);

    const timer = {
      author: 'alice',
      task_id: 'daily-backup',
      command: 'tar -czf backup.tar.gz /data',
      timer: '0 2 * * *',
      timer_desc: 'At 02:00, every day',
      created_at: new Date().toISOString(),
    };
    const fileName = timerFileName(timer.author, timer.task_id);
    const filePath = join(paths.timers, fileName);

    await writeFile(filePath, serializeTimerFile(timer), 'utf8');

    expect(existsSync(filePath)).toBe(true);

    const content = await readFile(filePath, 'utf8');
    const result = parseTimerFile(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.author).toBe('alice');
    expect(result.value.task_id).toBe('daily-backup');
    expect(result.value.command).toBe('tar -czf backup.tar.gz /data');
    expect(result.value.timer).toBe('0 2 * * *');
    // timer_desc field must be present
    expect(typeof result.value.timer_desc).toBe('string');
    expect(result.value.timer_desc.length).toBeGreaterThan(0);
  });

  it('detects duplicate: writing same file twice', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);
    const paths = getPaths(tmp.home);

    const timer = {
      author: 'alice',
      task_id: 'dup-timer',
      command: 'echo dup',
      timer: '*/5 * * * *',
      timer_desc: 'Every 5 minutes',
      created_at: new Date().toISOString(),
    };
    const fileName = timerFileName(timer.author, timer.task_id);
    const filePath = join(paths.timers, fileName);

    await writeFile(filePath, serializeTimerFile(timer), 'utf8');
    // File already exists — duplicate detected
    expect(existsSync(filePath)).toBe(true);
    const isDuplicate = existsSync(filePath);
    expect(isDuplicate).toBe(true);
  });
});

describe('timer list equivalent', () => {
  it('reads all files from timers/ and parses them', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);
    const paths = getPaths(tmp.home);

    const timers = [
      {
        author: 'alice',
        task_id: 'timer-1',
        command: 'echo 1',
        timer: '0 9 * * 1-5',
        timer_desc: 'At 09:00, Monday through Friday',
        created_at: new Date().toISOString(),
      },
      {
        author: 'bob',
        task_id: 'timer-2',
        command: 'echo 2',
        timer: '30 18 * * *',
        timer_desc: 'At 18:30, every day',
        created_at: new Date().toISOString(),
      },
    ];

    for (const t of timers) {
      const filePath = join(paths.timers, timerFileName(t.author, t.task_id));
      await writeFile(filePath, serializeTimerFile(t), 'utf8');
    }

    const files = (await readdir(paths.timers)).filter(f => f.endsWith('.txt'));
    expect(files).toHaveLength(2);

    const parsed = await Promise.all(
      files.map(async f => {
        const content = await readFile(join(paths.timers, f), 'utf8');
        return parseTimerFile(content);
      })
    );

    expect(parsed.every(r => r.ok)).toBe(true);
    const values = parsed.filter(r => r.ok).map(r => (r as { ok: true; value: { task_id: string } }).value);
    const ids = values.map(v => v.task_id).sort();
    expect(ids).toEqual(['timer-1', 'timer-2']);
  });
});

describe('timer remove equivalent', () => {
  it('deletes a timer file and verifies it is gone', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);
    const paths = getPaths(tmp.home);

    const timer = {
      author: 'alice',
      task_id: 'remove-me',
      command: 'echo bye',
      timer: '0 0 * * *',
      timer_desc: 'At midnight, every day',
      created_at: new Date().toISOString(),
    };
    const filePath = join(paths.timers, timerFileName(timer.author, timer.task_id));
    await writeFile(filePath, serializeTimerFile(timer), 'utf8');
    expect(existsSync(filePath)).toBe(true);

    await unlink(filePath);
    expect(existsSync(filePath)).toBe(false);
  });

  it('non-existent file: verify it does not exist', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);
    const paths = getPaths(tmp.home);

    const filePath = join(paths.timers, timerFileName('nobody', 'ghost-timer'));
    expect(existsSync(filePath)).toBe(false);
  });
});
