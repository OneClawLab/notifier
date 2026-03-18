import { describe, it, expect, afterEach } from 'vitest';
import { createTmpNotifierHome } from '../helpers/tmp-dir.js';
import { writePidFile } from '../../src/pid-file.js';
import { getDaemonStatus } from '../../src/commands/status.js';

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = null;
  }
});

describe('getDaemonStatus', () => {
  it('returns { running: false, pid: null } when no PID file exists', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;

    const status = await getDaemonStatus(tmp.home);
    expect(status).toEqual({ running: false, pid: null });
  });

  it('returns { running: false, pid: null } for a stale PID file (PID does not exist)', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;

    // Write a PID that is very unlikely to exist
    const { writeFile } = await import('node:fs/promises');
    const { getPaths } = await import('../../src/paths.js');
    const { pidFile } = getPaths(tmp.home);
    await writeFile(pidFile, '999999', 'utf8');

    const status = await getDaemonStatus(tmp.home);
    expect(status).toEqual({ running: false, pid: null });
  });

  it('returns { running: true, pid: <pid> } for a valid PID file (current process)', async () => {
    const tmp = await createTmpNotifierHome();
    cleanup = tmp.cleanup;

    await writePidFile(tmp.home);
    const status = await getDaemonStatus(tmp.home);
    expect(status).toEqual({ running: true, pid: process.pid });
  });
});
