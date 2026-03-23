import { Command } from 'commander';
import { getNotifierHome, getPaths, ensureDirs } from '../paths.js';
import { readPidFile, isProcessAlive } from '../pid-file.js';
import { openSync } from 'node:fs';
import { join } from 'node:path';

/** Poll for PID file to appear and contain a live PID, up to `timeoutMs`. */
async function waitForReady(home: string, timeoutMs: number): Promise<number | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 100));
    const pid = await readPidFile(home);
    if (pid !== null && isProcessAlive(pid)) return pid;
  }
  return null;
}

/**
 * Filter execArgv to pass through loader flags (tsx, esm) but drop
 * debug/inspect flags that would cause port conflicts in the child.
 */
function safeExecArgv(): string[] {
  return process.execArgv.filter(arg =>
    !arg.startsWith('--inspect') &&
    !arg.startsWith('--debug')
  );
}

export function createStartCommand(): Command {
  return new Command('start')
    .description('Start the notifier daemon')
    .option('--foreground', 'Run in foreground (logs to stdout)')
    .action(async (opts) => {
      const { foreground } = opts as { foreground?: boolean };
      const home = getNotifierHome();

      // Single instance check
      const existingPid = await readPidFile(home);
      if (existingPid !== null && isProcessAlive(existingPid)) {
        process.stderr.write(
          `Error: Daemon is already running (PID: ${existingPid}). Use 'notifier stop' first.\n`,
        );
        process.exit(1);
      }

      if (foreground) {
        // Foreground mode: run daemon directly in this process
        const { runDaemon } = await import('../daemon.js');
        await runDaemon({ foreground: true });
      } else {
        // Background mode: spawn detached child, redirect stderr to log file
        const { spawn } = await import('node:child_process');
        const paths = getPaths(home);
        await ensureDirs(home);
        const logFile = join(paths.logs, 'notifier.log');
        const logFd = openSync(logFile, 'a');
        const script = process.argv[1] ?? '';
        const child = spawn(process.execPath, [...safeExecArgv(), script, 'start', '--foreground'], {
          detached: true,
          stdio: ['ignore', logFd, logFd],
          env: { ...process.env, NOTIFIER_DAEMON: '1' },
        });
        child.unref();

        // Wait up to 5s for daemon to write its PID file
        const pid = await waitForReady(home, 5000);
        if (pid === null) {
          process.stderr.write('Error: Daemon did not start within 5 seconds. Check logs: ' + logFile + '\n');
          process.exit(1);
        }
        process.stdout.write(`Daemon started (PID: ${pid})\n`);
        process.exit(0);
      }
    });
}
