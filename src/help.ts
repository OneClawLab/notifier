import { Command } from 'commander';
import { createTaskCommand } from './commands/task.js';
import { createTimerCommand } from './commands/timer.js';
import { createStatusCommand } from './commands/status.js';
import { createStartCommand } from './commands/start.js';
import { createStopCommand } from './commands/stop.js';
import { getNotifierHome } from './paths.js';

const MAIN_EXAMPLES = `
Daemon:
  $ notifier start             # 启动后台 daemon 进程
  $ notifier start --foreground # 前台运行 (日志输出到 stdout)
  $ notifier stop              # 停止 daemon
  $ notifier status            # 查看 daemon 运行状态

Examples:
  $ notifier task add --author me --task-id t1 --command "echo hello"
  $ notifier timer add --author me --task-id daily --timer "0 9 * * *" --command "echo morning"
  $ notifier status`;

export const program = new Command();

program
  .name('notifier')
  .description('CLI tool and daemon for scheduling and executing shell commands')
  .version('1.0.0', '-v, --version', 'output the current version')
  .addHelpText('after', MAIN_EXAMPLES)
  .configureHelp({ sortSubcommands: true })
  .addCommand(createStartCommand())
  .addCommand(createStopCommand())
  .addCommand(createTaskCommand())
  .addCommand(createTimerCommand())
  .addCommand(createStatusCommand());

// --verbose: show data path info alongside --help
program.option('--verbose', '(与 --help 一起使用) 显示完整帮助信息');
program.on('option:verbose', () => {
  (program as unknown as Record<string, boolean>).__verboseHelp = true;
});
program.addHelpText('afterAll', () => {
  if ((program as unknown as Record<string, boolean>).__verboseHelp) {
    const home = getNotifierHome();
    return `
Data:
  数据目录: ${home}
  可通过 NOTIFIER_HOME 环境变量覆盖

Exit Codes:
  0  成功
  1  参数/用法错误
  2  运行时错误`;
  }
  return '';
});

// Show help and exit with code 2 when no subcommand is given
program.action(() => {
  program.help();
});
