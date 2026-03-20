import { Command } from 'commander';
import { getNotifierHome } from '../paths.js';
import { readPidFile, isProcessAlive } from '../pid-file.js';

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
        // Foreground mode: import and run daemon directly (logs to stdout)
        const { runDaemon } = await import('../daemon.js');
        await runDaemon({ foreground: true });
      } else {
        // Background mode: spawn detached child process
        const { spawn } = await import('node:child_process');
        const child = spawn(process.execPath, [...process.execArgv, ...getStartArgs()], {
          detached: true,
          stdio: 'ignore',
          env: { ...process.env, NOTIFIER_DAEMON: '1' },
        });
        child.unref();
        process.stdout.write(`Daemon started (PID: ${child.pid})\n`);
        process.exit(0);
      }
    });
}

/**
 * Build the argv for the detached child: re-invoke `notifier start --foreground`
 * so the child enters foreground mode (which actually runs the daemon loop).
 */
function getStartArgs(): string[] {
  const script = process.argv[1] ?? '';
  return [script, 'start', '--foreground'];
}
