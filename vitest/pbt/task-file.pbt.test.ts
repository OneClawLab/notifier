// Feature: notifier-daemon, Property 1: 即时任务文件 Round-Trip
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { parseTaskFile, serializeTaskFile } from '../../src/task-file.js';
import { taskFileArb } from '../helpers/file-gen.js';

describe('Property 1: 即时任务文件 Round-Trip', () => {
  it('parse(serialize(task)) === task', () => {
    // Validates: Requirements 2.5, 2.6
    fc.assert(
      fc.property(taskFileArb, (task) => {
        const serialized = serializeTaskFile(task);
        const result = parseTaskFile(serialized);
        if (!result.ok) return false;
        const parsed = result.value;
        return (
          parsed.author === task.author &&
          parsed.task_id === task.task_id &&
          parsed.command === task.command &&
          parsed.created_at === task.created_at &&
          parsed.description === task.description
        );
      }),
      { numRuns: 100 }
    );
  });
});
