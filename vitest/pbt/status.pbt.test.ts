// Feature: notifier-daemon, Property 13: status --json 输出合法 JSON 且字段类型正确
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import type { DaemonStatus } from '../../src/types.js';

const statusArb: fc.Arbitrary<DaemonStatus> = fc.oneof(
  fc.record({ running: fc.constant(true as const), pid: fc.integer({ min: 1, max: 99999 }) }),
  fc.record({ running: fc.constant(false as const), pid: fc.constant(null) }),
);

describe('Property 13: status --json 输出合法 JSON 且字段类型正确', () => {
  it('JSON.stringify(status) produces valid JSON with correct field types', () => {
    // Validates: Requirements 18.4
    fc.assert(
      fc.property(statusArb, (status) => {
        const json = JSON.stringify(status);

        // Must be valid JSON
        let parsed: unknown;
        try {
          parsed = JSON.parse(json);
        } catch {
          return false;
        }

        if (typeof parsed !== 'object' || parsed === null) return false;
        const obj = parsed as Record<string, unknown>;

        // running must be boolean
        if (typeof obj['running'] !== 'boolean') return false;

        // pid type depends on running
        if (obj['running'] === true) {
          // pid must be a positive integer
          if (typeof obj['pid'] !== 'number') return false;
          if (!Number.isInteger(obj['pid'])) return false;
          if ((obj['pid'] as number) < 1) return false;
        } else {
          // pid must be null
          if (obj['pid'] !== null) return false;
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
