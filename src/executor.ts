import { spawn } from 'node:child_process';
import type { ExecuteResult } from './types.js';

/**
 * Execute a shell command via `sh -c <command>`.
 * Always resolves (never rejects) — non-zero exit codes are captured in exitCode.
 */
export async function executeCommand(command: string): Promise<ExecuteResult> {
  const start = Date.now();
  const exitCode = await new Promise<number>((resolve) => {
    const proc = spawn('sh', ['-c', command], {
      stdio: 'pipe',
      windowsHide: true,
    });
    proc.on('error', () => resolve(1));
    proc.on('close', (code) => resolve(code ?? 1));
  });
  const durationMs = Date.now() - start;
  return { exitCode, durationMs };
}
