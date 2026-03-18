import { Command } from 'commander';
import { getNotifierHome } from '../paths.js';
import { readPidFile, isProcessAlive } from '../pid-file.js';
import type { DaemonStatus } from '../types.js';

export async function getDaemonStatus(home: string): Promise<DaemonStatus> {
  const pid = await readPidFile(home);
  if (pid === null) {
    return { running: false, pid: null };
  }
  if (isProcessAlive(pid)) {
    return { running: true, pid };
  }
  return { running: false, pid: null };
}

export function createStatusCommand(): Command {
  return new Command('status')
    .description('Show daemon status')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const { json } = opts as { json?: boolean };
      const home = getNotifierHome();
      const status = await getDaemonStatus(home);

      if (json) {
        process.stderr.write(`Data: ${home}\n`);
        process.stdout.write(JSON.stringify(status) + '\n');
      } else {
        process.stdout.write(`Data: ${home}\n`);
        if (status.running) {
          process.stdout.write(`Daemon is running (PID: ${status.pid})\n`);
        } else {
          process.stdout.write('Daemon is not running\n');
        }
      }
      process.exit(0);
    });
}
