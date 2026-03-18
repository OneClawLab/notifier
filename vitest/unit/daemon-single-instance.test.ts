import { describe, it, expect, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTmpNotifierHome } from '../helpers/tmp-dir.js';
import { ensureDirs, getPaths } from '../../src/paths.js';
import { writePidFile, removePidFile, readPidFile, isProcessAlive } from '../../src/pid-file.js';

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = null;
  }
});

describe('daemon single-instance guarantee', () => {
  it('alive PID in pid file: isProcessAlive returns true for current process', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);

    await writePidFile(tmp.home);
    const pid = await readPidFile(tmp.home);

    expect(pid).toBe(process.pid);
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('stale PID in pid file: isProcessAlive returns false for non-existent PID', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);
    const paths = getPaths(tmp.home);

    // Write a PID that is very unlikely to exist (max int)
    const stalePid = 2147483647;
    await writeFile(paths.pidFile, stalePid.toString(), 'utf8');

    const pid = await readPidFile(tmp.home);
    expect(pid).toBe(stalePid);
    expect(isProcessAlive(stalePid)).toBe(false);
  });

  it('no pid file: readPidFile returns null', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);

    const pid = await readPidFile(tmp.home);
    expect(pid).toBeNull();
  });

  it('normal exit: removePidFile deletes the pid file', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);
    const paths = getPaths(tmp.home);

    await writePidFile(tmp.home);
    expect(existsSync(paths.pidFile)).toBe(true);

    await removePidFile(tmp.home);
    expect(existsSync(paths.pidFile)).toBe(false);
  });

  it('removePidFile is idempotent: no error when file already gone', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);

    // File doesn't exist — should not throw
    await expect(removePidFile(tmp.home)).resolves.toBeUndefined();
  });

  it('stale lock scenario: detect stale, overwrite with new PID', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;
    await ensureDirs(tmp.home);
    const paths = getPaths(tmp.home);

    // Simulate stale lock
    const stalePid = 2147483647;
    await writeFile(paths.pidFile, stalePid.toString(), 'utf8');

    const existingPid = await readPidFile(tmp.home);
    expect(existingPid).not.toBeNull();
    const isStale = existingPid !== null && !isProcessAlive(existingPid);
    expect(isStale).toBe(true);

    // Overwrite with current PID (as daemon would do)
    await writePidFile(tmp.home);
    const newPid = await readPidFile(tmp.home);
    expect(newPid).toBe(process.pid);
    expect(isProcessAlive(newPid!)).toBe(true);
  });
});
