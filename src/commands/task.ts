import { readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { getNotifierHome, getPaths, ensureDirs } from '../paths.js';
import { parseTaskFile, serializeTaskFile, taskFileName } from '../task-file.js';
import type { TaskStatus } from '../types.js';

function outputError(error: string, suggestion: string, json: boolean): void {
  if (json) {
    process.stderr.write(JSON.stringify({ error, suggestion }) + '\n');
  } else {
    process.stderr.write(`Error: ${error}\nSuggestion: ${suggestion}\n`);
  }
}

function getTaskDir(status: TaskStatus): string {
  const home = getNotifierHome();
  const paths = getPaths(home);
  switch (status) {
    case 'pending': return paths.tasksPending;
    case 'done':    return paths.tasksDone;
    case 'error':   return paths.tasksError;
  }
}

export function createTaskCommand(): Command {
  const task = new Command('task').description('Manage instant tasks');

  // task add
  task
    .command('add')
    .description('Add a new task')
    .requiredOption('--author <name>', 'Author name')
    .requiredOption('--task-id <id>', 'Task ID')
    .option('--command <cmd>', 'Command to run (reads from stdin if omitted)')
    .option('--cmd <cmd>', 'Alias for --command')
    .action(async (opts) => {
      const { author, taskId, command: cmdOpt, cmd: cmdAlias } = opts as {
        author: string;
        taskId: string;
        command?: string;
        cmd?: string;
      };

      let command: string;
      const resolvedCmd = cmdOpt ?? cmdAlias;
      if (resolvedCmd !== undefined) {
        command = resolvedCmd;
      } else {
        // Read single line from stdin
        const stdinData = await new Promise<string>((resolve, reject) => {
          const chunks: Buffer[] = [];
          process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
          process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
          process.stdin.on('error', reject);
        });
        command = stdinData.split('\n')[0] ?? '';
      }

      const home = getNotifierHome();
      await ensureDirs(home);
      const paths = getPaths(home);
      const fileName = taskFileName(author, taskId);
      const filePath = join(paths.tasksPending, fileName);

      if (existsSync(filePath)) {
        outputError(
          `task file already exists at ${filePath}`,
          `Use a different --task-id or remove the existing task first with: notifier task remove --author ${author} --task-id ${taskId}`,
          false,
        );
        process.exit(1);
      }

      const content = serializeTaskFile({
        author,
        task_id: taskId,
        command,
        created_at: new Date().toISOString(),
      });

      writeFileSync(filePath, content, 'utf8');
      process.exit(0);
    });

  // task list
  task
    .command('list')
    .description('List tasks')
    .option('--status <status>', 'Task status: pending, done, or error', 'pending')
    .option('--json', 'Output as JSON array')
    .action((opts) => {
      const { status, json } = opts as { status: string; json?: boolean };
      const validStatuses: TaskStatus[] = ['pending', 'done', 'error'];
      if (!validStatuses.includes(status as TaskStatus)) {
        outputError(
          `Invalid status: ${status}`,
          `Valid values are: pending, done, error`,
          json ?? false,
        );
        process.exit(1);
      }

      const dir = getTaskDir(status as TaskStatus);

      let files: string[] = [];
      try {
        files = readdirSync(dir).filter((f) => f.endsWith('.txt'));
      } catch {
        // Directory doesn't exist yet — treat as empty
        files = [];
      }

      if (json) {
        if (files.length === 0) {
          process.stdout.write('[]\n');
          return;
        }
        const tasks = files.map((f) => {
          const content = readFileSync(join(dir, f), 'utf8');
          const result = parseTaskFile(content);
          return result.ok ? result.value : null;
        }).filter(Boolean);
        process.stdout.write(JSON.stringify(tasks) + '\n');
      } else {
        if (files.length === 0) {
          process.stdout.write(`No tasks found in ${status}.\n`);
          return;
        }
        for (const f of files) {
          const content = readFileSync(join(dir, f), 'utf8');
          const result = parseTaskFile(content);
          if (!result.ok) continue;
          const { author, task_id, command } = result.value;
          const truncated = command.length > 50 ? command.slice(0, 50) + '…' : command;
          process.stdout.write(`${author}\t${task_id}\t${truncated}\n`);
        }
      }
    });

  // task remove
  task
    .command('remove')
    .description('Remove a task')
    .requiredOption('--author <name>', 'Author name')
    .requiredOption('--task-id <id>', 'Task ID')
    .option('--status <status>', 'Task status: pending, done, or error', 'pending')
    .action((opts) => {
      const { author, taskId, status } = opts as {
        author: string;
        taskId: string;
        status: string;
      };

      const validStatuses: TaskStatus[] = ['pending', 'done', 'error'];
      if (!validStatuses.includes(status as TaskStatus)) {
        outputError(
          `Invalid status: ${status}`,
          `Valid values are: pending, done, error`,
          false,
        );
        process.exit(1);
      }

      const dir = getTaskDir(status as TaskStatus);
      const fileName = taskFileName(author, taskId);
      const filePath = join(dir, fileName);

      if (!existsSync(filePath)) {
        outputError(
          `task file not found at ${filePath}`,
          `Check the author, task-id, and status. List tasks with: notifier task list --status ${status}`,
          false,
        );
        process.exit(1);
      }

      unlinkSync(filePath);
      process.exit(0);
    });

  return task;
}
