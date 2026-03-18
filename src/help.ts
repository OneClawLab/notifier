import { Command } from 'commander';
import { createTaskCommand } from './commands/task.js';
import { createTimerCommand } from './commands/timer.js';
import { createStatusCommand } from './commands/status.js';

export const program = new Command();

program
  .name('notifier')
  .description('CLI tool and daemon for scheduling and executing shell commands')
  .version('1.0.0', '-v, --version', 'output the current version')
  .addHelpText('after', '\nRun a subcommand with --help for more details.')
  .configureHelp({ sortSubcommands: true })
  .addCommand(createTaskCommand())
  .addCommand(createTimerCommand())
  .addCommand(createStatusCommand());

// Show help and exit with code 2 when no subcommand is given
program.action(() => {
  program.help();
});
