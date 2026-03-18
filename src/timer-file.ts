import type { ParseResult, TimerFile } from './types.js';

const REQUIRED_FIELDS = ['author', 'task_id', 'command', 'timer', 'timer_desc', 'created_at'] as const;
const VALID_ON_MISS = ['skip', 'run-once'] as const;

/**
 * Parse an env-format string into a TimerFile object.
 * Lines starting with '#' and empty lines are ignored.
 * Each line is split on the first '=' into key/value.
 */
export function parseTimerFile(content: string): ParseResult<TimerFile> {
  const fields: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1);
    fields[key] = value;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in fields)) {
      return { ok: false, error: `Missing required field: ${field}` };
    }
  }

  if ('on_miss' in fields) {
    const val = fields['on_miss'];
    if (val !== 'skip' && val !== 'run-once') {
      return {
        ok: false,
        error: `Invalid value for on_miss: "${val}". Valid values are: ${VALID_ON_MISS.join(', ')}`,
      };
    }
  }

  const timer: TimerFile = {
    author: fields['author']!,
    task_id: fields['task_id']!,
    command: fields['command']!,
    timer: fields['timer']!,
    timer_desc: fields['timer_desc']!,
    created_at: fields['created_at']!,
  };

  if ('description' in fields) {
    timer.description = fields['description'];
  }

  if ('on_miss' in fields) {
    timer.on_miss = fields['on_miss'] as 'skip' | 'run-once';
  }

  return { ok: true, value: timer };
}

/**
 * Serialize a TimerFile object to an env-format string.
 */
export function serializeTimerFile(timer: TimerFile): string {
  const lines: string[] = [
    `author=${timer.author}`,
    `task_id=${timer.task_id}`,
    `command=${timer.command}`,
    `timer=${timer.timer}`,
    `timer_desc=${timer.timer_desc}`,
    `created_at=${timer.created_at}`,
  ];

  if (timer.description !== undefined) {
    lines.push(`description=${timer.description}`);
  }

  if (timer.on_miss !== undefined) {
    lines.push(`on_miss=${timer.on_miss}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Returns the filename for a timer file: <author>-<taskId>.txt
 */
export function timerFileName(author: string, taskId: string): string {
  return `${author}-${taskId}.txt`;
}
