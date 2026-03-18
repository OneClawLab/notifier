import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Returns the NOTIFIER_HOME directory path.
 * Uses NOTIFIER_HOME env var if set, otherwise defaults to ~/.local/share/notifier.
 */
export function getNotifierHome(): string {
  return process.env['NOTIFIER_HOME'] ?? join(homedir(), '.local', 'share', 'notifier');
}

export interface NotifierPaths {
  home: string;
  tasksPending: string;
  tasksDone: string;
  tasksError: string;
  timers: string;
  logs: string;
  pidFile: string;
}

/**
 * Returns all sub-directory paths derived from the given home directory.
 */
export function getPaths(home: string): NotifierPaths {
  return {
    home,
    tasksPending: join(home, 'tasks', 'pending'),
    tasksDone: join(home, 'tasks', 'done'),
    tasksError: join(home, 'tasks', 'error'),
    timers: join(home, 'timers'),
    logs: join(home, 'logs'),
    pidFile: join(home, 'notifier.pid'),
  };
}

/**
 * Recursively creates all required directories under home.
 */
export async function ensureDirs(home: string): Promise<void> {
  const paths = getPaths(home);
  await Promise.all([
    mkdir(paths.tasksPending, { recursive: true }),
    mkdir(paths.tasksDone, { recursive: true }),
    mkdir(paths.tasksError, { recursive: true }),
    mkdir(paths.timers, { recursive: true }),
    mkdir(paths.logs, { recursive: true }),
  ]);
}
