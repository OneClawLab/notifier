// Feature: notifier-daemon, Property 3: 缺失必需字段时错误信息包含字段名
// Feature: notifier-daemon, Property 3b: on_miss 非法值时错误信息包含字段名和合法值
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { parseTaskFile } from '../../src/task-file.js';
import { parseTimerFile } from '../../src/timer-file.js';
import { makeTaskFileContent, makeTimerFileContent } from '../helpers/file-gen.js';

const TASK_REQUIRED_FIELDS = ['author', 'task_id', 'command', 'created_at'] as const;
const TIMER_REQUIRED_FIELDS = ['author', 'task_id', 'command', 'timer', 'timer_desc', 'created_at'] as const;

describe('Property 3: 缺失必需字段时错误信息包含字段名', () => {
  it('task file: error message contains the missing field name', () => {
    // Validates: Requirements 2.3
    fc.assert(
      fc.property(fc.constantFrom(...TASK_REQUIRED_FIELDS), (missingField) => {
        // Build content with the field removed
        const overrides: Record<string, string> = {};
        for (const f of TASK_REQUIRED_FIELDS) {
          if (f !== missingField) overrides[f] = `value-for-${f}`;
        }
        const content = Object.entries(overrides).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
        const result = parseTaskFile(content);
        if (result.ok) return false; // should have failed
        return result.error.includes(missingField);
      }),
      { numRuns: 100 }
    );
  });

  it('timer file: error message contains the missing field name', () => {
    // Validates: Requirements 3.3
    fc.assert(
      fc.property(fc.constantFrom(...TIMER_REQUIRED_FIELDS), (missingField) => {
        const overrides: Record<string, string> = {};
        for (const f of TIMER_REQUIRED_FIELDS) {
          if (f !== missingField) overrides[f] = `value-for-${f}`;
        }
        const content = Object.entries(overrides).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
        const result = parseTimerFile(content);
        if (result.ok) return false;
        return result.error.includes(missingField);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 3b: on_miss 非法值时错误信息包含字段名和合法值', () => {
  it('error message contains "on_miss", "skip", and "run-once"', () => {
    // Validates: Requirements 3.6
    // Generate strings that are not valid on_miss values
    const invalidOnMissArb = fc.string({ minLength: 1, maxLength: 30 })
      .filter(s => s !== 'skip' && s !== 'run-once' && !s.includes('\n'));

    fc.assert(
      fc.property(invalidOnMissArb, (invalidValue) => {
        const content = makeTimerFileContent({ on_miss: invalidValue });
        const result = parseTimerFile(content);
        if (result.ok) return false;
        return (
          result.error.includes('on_miss') &&
          result.error.includes('skip') &&
          result.error.includes('run-once')
        );
      }),
      { numRuns: 100 }
    );
  });
});
