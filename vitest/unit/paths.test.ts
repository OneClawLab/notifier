import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureDirs, getNotifierHome, getPaths } from '../../src/paths.js';

describe('getNotifierHome', () => {
  const originalEnv = process.env['NOTIFIER_HOME'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['NOTIFIER_HOME'];
    } else {
      process.env['NOTIFIER_HOME'] = originalEnv;
    }
  });

  it('returns default path when NOTIFIER_HOME is not set', () => {
    delete process.env['NOTIFIER_HOME'];
    const home = getNotifierHome();
    expect(home).toContain('.local');
    expect(home).toContain('notifier');
  });

  it('returns NOTIFIER_HOME env var when set', () => {
    process.env['NOTIFIER_HOME'] = '/custom/notifier/home';
    expect(getNotifierHome()).toBe('/custom/notifier/home');
  });
});

describe('getPaths', () => {
  it('returns correct sub-paths for a given home', () => {
    const home = join('some', 'home');
    const paths = getPaths(home);
    expect(paths.home).toBe(home);
    expect(paths.tasksPending).toBe(join(home, 'tasks', 'pending'));
    expect(paths.tasksDone).toBe(join(home, 'tasks', 'done'));
    expect(paths.tasksError).toBe(join(home, 'tasks', 'error'));
    expect(paths.timers).toBe(join(home, 'timers'));
    expect(paths.logs).toBe(join(home, 'logs'));
    expect(paths.pidFile).toBe(join(home, 'notifier.pid'));
  });
});

describe('ensureDirs', () => {
  let tmpHome: string;

  beforeEach(async () => {
    tmpHome = await mkdtemp(join(tmpdir(), 'notifier-test-'));
  });

  afterEach(async () => {
    await rm(tmpHome, { recursive: true, force: true });
  });

  it('creates all required directories', async () => {
    const home = join(tmpHome, 'notifier');
    await ensureDirs(home);

    const paths = getPaths(home);
    for (const dir of [paths.tasksPending, paths.tasksDone, paths.tasksError, paths.timers, paths.logs]) {
      const s = await stat(dir);
      expect(s.isDirectory()).toBe(true);
    }
  });

  it('is idempotent — calling twice does not throw', async () => {
    const home = join(tmpHome, 'notifier');
    await ensureDirs(home);
    await expect(ensureDirs(home)).resolves.toBeUndefined();
  });
});
