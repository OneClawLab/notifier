import { program } from './help.js';

if (process.argv.includes('--daemon')) {
  // daemon.ts will be implemented in a later task
  const { runDaemon } = await import('./daemon.js' as string) as { runDaemon: () => Promise<void> };
  await runDaemon();
} else {
  await program.parseAsync(process.argv);
}
