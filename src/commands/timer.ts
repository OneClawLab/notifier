import { readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { getNotifierHome, getPaths, ensureDirs } from '../paths.js';
import { parseTimerFile, serializeTimerFile, timerFileName } from '../timer-file.js';
import { parseCron, describeCron } from '../cron-parser.js';

function outputError(error: string, suggestion: string, json: boolean): void {
  if (json) {
    process.stderr.write(JSON.stringify({ error, suggestion }) + '\n');
  } else {
    process.stderr.write(`Error: ${error}\nSuggestion: ${suggestion}\n`);
  }
}

export function createTimerCommand(): Command {
  const timer = new Command('timer').description('Manage timer tasks');

  // timer add
  timer
    .command('add')
    .description('Add a new timer')
    .requiredOption('--author <name>', 'Author name')
    .requiredOption('--task-id <id>', 'Task ID')
    .requiredOption('--command <cmd>', 'Command to run')
    .requiredOption('--timer <cron>', 'CRON expression')
    .action(async (opts) => {
      const { author, taskId, command, timer: cronExpr } = opts as {
        author: string;
        taskId: string;
        command: string;
        timer: string;
      };

      // Validate CRON expression
      const cronResult = parseCron(cronExpr);
      if (!cronResult.ok) {
        process.stderr.write(`Error: Invalid CRON expression: ${cronResult.error}\nSuggestion: Provide a valid 5-field CRON expression, e.g. "0 9 * * 1-5"\n`);
        process.exit(2);
      }

      // Generate timer_desc
      const descResult = describeCron(cronExpr);
      const timerDesc = descResult.ok ? descResult.value : cronExpr;

      const home = getNotifierHome();
      await ensureDirs(home);
      const paths = getPaths(home);
      const fileName = timerFileName(author, taskId);
      const filePath = join(paths.timers, fileName);

      if (existsSync(filePath)) {
        outputError(
          `timer file already exists at ${filePath}`,
          `Use a different --task-id or remove the existing timer first with: notifier timer remove --author ${author} --task-id ${taskId}`,
          false,
        );
        process.exit(1);
      }

      const content = serializeTimerFile({
        author,
        task_id: taskId,
        command,
        timer: cronExpr,
        timer_desc: timerDesc,
        created_at: new Date().toISOString(),
      });

      writeFileSync(filePath, content, 'utf8');
      process.exit(0);
    });

  // timer list
  timer
    .command('list')
    .description('List timers')
    .option('--json', 'Output as JSON array')
    .action((opts) => {
      const { json } = opts as { json?: boolean };

      const home = getNotifierHome();
      const paths = getPaths(home);

      let files: string[] = [];
      try {
        files = readdirSync(paths.timers).filter((f) => f.endsWith('.txt'));
      } catch {
        files = [];
      }

      if (json) {
        if (files.length === 0) {
          process.stdout.write('[]\n');
          return;
        }
        const timers = files.map((f) => {
          const content = readFileSync(join(paths.timers, f), 'utf8');
          const result = parseTimerFile(content);
          return result.ok ? result.value : null;
        }).filter(Boolean);
        process.stdout.write(JSON.stringify(timers) + '\n');
      } else {
        if (files.length === 0) {
          process.stdout.write('No timers found.\n');
          return;
        }
        for (const f of files) {
          const content = readFileSync(join(paths.timers, f), 'utf8');
          const result = parseTimerFile(content);
          if (!result.ok) continue;
          const { author, task_id, timer: cronExpr, timer_desc, command } = result.value;
          const truncated = command.length > 50 ? command.slice(0, 50) + '…' : command;
          process.stdout.write(`${author}\t${task_id}\t${cronExpr}\t${timer_desc}\t${truncated}\n`);
        }
      }
    });

  // timer remove
  timer
    .command('remove')
    .description('Remove a timer')
    .requiredOption('--author <name>', 'Author name')
    .requiredOption('--task-id <id>', 'Task ID')
    .action((opts) => {
      const { author, taskId } = opts as {
        author: string;
        taskId: string;
      };

      const home = getNotifierHome();
      const paths = getPaths(home);
      const fileName = timerFileName(author, taskId);
      const filePath = join(paths.timers, fileName);

      if (!existsSync(filePath)) {
        outputError(
          `timer file not found at ${filePath}`,
          `Check the author and task-id. List timers with: notifier timer list`,
          false,
        );
        process.exit(1);
      }

      unlinkSync(filePath);
      process.exit(0);
    });

  return timer;
}
