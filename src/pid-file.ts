import { readFile, unlink, writeFile } from 'node:fs/promises';
import { getPaths } from './paths.js';

/**
 * Write current process PID to <home>/notifier.pid
 */
export async function writePidFile(home: string): Promise<void> {
  const { pidFile } = getPaths(home);
  await writeFile(pidFile, process.pid.toString(), 'utf8');
}

/**
 * Delete PID file (silently ignore if not found)
 */
export async function removePidFile(home: string): Promise<void> {
  const { pidFile } = getPaths(home);
  try {
    await unlink(pidFile);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Read PID file, return PID or null if file doesn't exist
 */
export async function readPidFile(home: string): Promise<number | null> {
  const { pidFile } = getPaths(home);
  try {
    const content = await readFile(pidFile, 'utf8');
    return parseInt(content.trim(), 10);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Check if process with given PID is alive using process.kill(pid, 0)
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
      return false;
    }
    // EPERM means process exists but we don't have permission to signal it
    return true;
  }
}
