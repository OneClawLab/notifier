// Feature: notifier-daemon, Property 2: 定时任务文件 Round-Trip
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { parseTimerFile, serializeTimerFile } from '../../src/timer-file.js';
import { timerFileArb } from '../helpers/file-gen.js';

describe('Property 2: 定时任务文件 Round-Trip', () => {
  it('parse(serialize(timer)) === timer', () => {
    // Validates: Requirements 3.7, 3.8
    fc.assert(
      fc.property(timerFileArb, (timer) => {
        const serialized = serializeTimerFile(timer);
        const result = parseTimerFile(serialized);
        if (!result.ok) return false;
        const parsed = result.value;
        return (
          parsed.author === timer.author &&
          parsed.task_id === timer.task_id &&
          parsed.command === timer.command &&
          parsed.timer === timer.timer &&
          parsed.timer_desc === timer.timer_desc &&
          parsed.created_at === timer.created_at &&
          parsed.description === timer.description &&
          parsed.on_miss === timer.on_miss
        );
      }),
      { numRuns: 100 }
    );
  });
});
