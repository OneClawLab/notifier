import { describe, it, expect, afterEach } from 'vitest';
import { createTmpNotifierHome } from '../helpers/tmp-dir.js';
import { writePidFile, readPidFile, removePidFile, isProcessAlive } from '../../src/pid-file.js';

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = null;
  }
});

describe('writePidFile', () => {
  it('writes current PID to <home>/notifier.pid', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;

    await writePidFile(tmp.home);
    const pid = await readPidFile(tmp.home);
    expect(pid).toBe(process.pid);
  });
});

describe('readPidFile', () => {
  it('reads back the PID correctly', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;

    await writePidFile(tmp.home);
    const pid = await readPidFile(tmp.home);
    expect(pid).toBe(process.pid);
  });

  it('returns null when file does not exist', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;

    const pid = await readPidFile(tmp.home);
    expect(pid).toBeNull();
  });
});

describe('removePidFile', () => {
  it('deletes the PID file', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;

    await writePidFile(tmp.home);
    expect(await readPidFile(tmp.home)).toBe(process.pid);

    await removePidFile(tmp.home);
    expect(await readPidFile(tmp.home)).toBeNull();
  });

  it('does not throw when file does not exist (stale lock)', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;

    await expect(removePidFile(tmp.home)).resolves.toBeUndefined();
  });
});

describe('isProcessAlive', () => {
  it('returns true for the current process PID', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('returns false for a non-existent PID', () => {
    expect(isProcessAlive(999999)).toBe(false);
  });
});
