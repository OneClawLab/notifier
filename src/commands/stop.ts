import { Command } from 'commander';
import { getNotifierHome } from '../paths.js';
import { readPidFile, isProcessAlive, removePidFile } from '../pid-file.js';

export function createStopCommand(): Command {
  return new Command('stop')
    .description('Stop the notifier daemon')
    .action(async () => {
      const home = getNotifierHome();
      const pid = await readPidFile(home);

      if (pid === null) {
        process.stderr.write('Daemon is not running (no PID file found)\n');
        process.exit(1);
      }

      if (!isProcessAlive(pid)) {
        process.stderr.write(`Daemon is not running (stale PID: ${pid}). Cleaning up PID file.\n`);
        await removePidFile(home);
        process.exit(1);
      }

      // Send SIGTERM and wait briefly
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        process.stderr.write(`Failed to send SIGTERM to PID ${pid}\n`);
        process.exit(1);
      }

      // Poll for up to 5 seconds
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 200));
        if (!isProcessAlive(pid)) {
          process.stdout.write(`Daemon stopped (was PID: ${pid})\n`);
          process.exit(0);
        }
      }

      process.stderr.write(`Daemon (PID: ${pid}) did not stop within 5 seconds. Try: kill -9 ${pid}\n`);
      process.exit(1);
    });
}
