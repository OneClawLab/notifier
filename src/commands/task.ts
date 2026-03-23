import { readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { getNotifierHome, getPaths, ensureDirs } from '../paths.js';
import { parseTaskFile, serializeTaskFile, taskFileName } from '../task-file.js';
import type { TaskFile, TaskStatus } from '../types.js';

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

function printTaskDetail(task: TaskFile): void {
  process.stdout.write(`  author:      ${task.author}\n`);
  process.stdout.write(`  task_id:     ${task.task_id}\n`);
  process.stdout.write(`  created_at:  ${task.created_at}\n`);
  if (task.description) process.stdout.write(`  description: ${task.description}\n`);
  process.stdout.write(`  command:     ${task.command}\n`);
  process.stdout.write('\n');
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
    .option('--status <status>', 'Task status: pending, done, or error (ignored when --all)', 'pending')
    .option('--all', 'Show pending + latest 10 done + latest 10 error')
    .option('--json', 'Output as JSON array')
    .action((opts) => {
      const { status, all, json } = opts as { status: string; all?: boolean; json?: boolean };

      const validStatuses: TaskStatus[] = ['pending', 'done', 'error'];

      if (all) {
        // Collect all three buckets
        const readBucket = (s: TaskStatus, limit?: number): { status: TaskStatus; file: string; task: ReturnType<typeof parseTaskFile> }[] => {
          const dir = getTaskDir(s);
          let files: string[] = [];
          try { files = readdirSync(dir).filter(f => f.endsWith('.txt')); } catch { files = []; }
          // done/error: newest first (by filename lexicographic order is fine for ISO dates)
          if (limit !== undefined) files = files.slice(-limit).reverse();
          return files.map(f => ({ status: s, file: f, task: parseTaskFile(readFileSync(join(dir, f), 'utf8')) }));
        };

        const pending = readBucket('pending');
        const done    = readBucket('done', 10);
        const error   = readBucket('error', 10);
        const all_items = [...pending, ...done, ...error];

        if (json) {
          const out = all_items
            .filter(i => i.task.ok)
            .map(i => ({ status: i.status, ...(i.task.ok ? i.task.value : {}) }));
          process.stdout.write(JSON.stringify(out) + '\n');
          return;
        }

        for (const bucket of [
          { label: 'PENDING', items: pending },
          { label: 'DONE (latest 10)', items: done },
          { label: 'ERROR (latest 10)', items: error },
        ]) {
          process.stdout.write(`\n── ${bucket.label} ──\n`);
          if (bucket.items.length === 0) { process.stdout.write('  (none)\n'); continue; }
          for (const { file, task } of bucket.items) {
            if (!task.ok) { process.stdout.write(`  [parse error] ${file}\n`); continue; }
            printTaskDetail(task.value);
          }
        }
        return;
      }

      // single-status mode
      if (!validStatuses.includes(status as TaskStatus)) {
        outputError(`Invalid status: ${status}`, `Valid values are: pending, done, error`, json ?? false);
        process.exit(1);
      }

      const dir = getTaskDir(status as TaskStatus);
      let files: string[] = [];
      try { files = readdirSync(dir).filter(f => f.endsWith('.txt')); } catch { files = []; }

      if (json) {
        if (files.length === 0) { process.stdout.write('[]\n'); return; }
        const tasks = files.map(f => {
          const r = parseTaskFile(readFileSync(join(dir, f), 'utf8'));
          return r.ok ? r.value : null;
        }).filter(Boolean);
        process.stdout.write(JSON.stringify(tasks) + '\n');
        return;
      }

      if (files.length === 0) { process.stdout.write(`No tasks found in ${status}.\n`); return; }
      for (const f of files) {
        const r = parseTaskFile(readFileSync(join(dir, f), 'utf8'));
        if (!r.ok) continue;
        printTaskDetail(r.value);
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
