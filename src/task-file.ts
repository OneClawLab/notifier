import type { ParseResult, TaskFile } from './types.js';

const REQUIRED_FIELDS = ['author', 'task_id', 'command', 'created_at'] as const;

/**
 * Parse an env-format string into a TaskFile object.
 * Lines starting with '#' and empty lines are ignored.
 * Each line is split on the first '=' into key/value.
 */
export function parseTaskFile(content: string): ParseResult<TaskFile> {
  const fields: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1); // value may contain '=' and trailing spaces
    fields[key] = value;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in fields)) {
      return { ok: false, error: `Missing required field: ${field}` };
    }
  }

  const task: TaskFile = {
    author: fields['author']!,
    task_id: fields['task_id']!,
    command: fields['command']!,
    created_at: fields['created_at']!,
  };

  if ('description' in fields) {
    task.description = fields['description'];
  }

  return { ok: true, value: task };
}

/**
 * Serialize a TaskFile object to an env-format string.
 */
export function serializeTaskFile(task: TaskFile): string {
  const lines: string[] = [
    `author=${task.author}`,
    `task_id=${task.task_id}`,
    `command=${task.command}`,
    `created_at=${task.created_at}`,
  ];

  if (task.description !== undefined) {
    lines.push(`description=${task.description}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Returns the filename for a task file: <author>-<taskId>.txt
 */
export function taskFileName(author: string, taskId: string): string {
  return `${author}-${taskId}.txt`;
}
