// Feature: notifier-daemon, Property 12: 日志行格式符合规范
// Validates: Requirements 15.2
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createFileLogger } from '../../src/logger.js';

// [ISO8601] [LEVEL] message
const LOG_LINE_RE = /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[(INFO|WARN|ERROR)\] .+$/;

// Safe message: non-empty, no newlines
const safeMessageArb = fc.string({ minLength: 1, maxLength: 100 }).filter(
  s => !s.includes('\n') && !s.includes('\r') && s.trim().length > 0
);

const levelArb = fc.constantFrom('INFO' as const, 'WARN' as const, 'ERROR' as const);

describe('Property 12: 日志行格式符合规范', () => {
  it('for any log message and level, the written line matches [ISO8601] [LEVEL] message format', async () => {
    // Validates: Requirements 15.2
    await fc.assert(
      fc.asyncProperty(safeMessageArb, levelArb, async (message, level) => {
        const tmpDir = await mkdtemp(path.join(tmpdir(), 'logger-pbt-'));
        try {
          const logger = await createFileLogger(tmpDir);

          if (level === 'INFO') logger.info(message);
          else if (level === 'WARN') logger.warn(message);
          else logger.error(message);

          await logger.close();

          const content = fs.readFileSync(path.join(tmpDir, 'notifier.log'), 'utf8');
          const lines = content.split('\n').filter(l => l.length > 0);

          return lines.length === 1 && LOG_LINE_RE.test(lines[0]!) && lines[0]!.includes(message);
        } finally {
          await rm(tmpDir, { recursive: true, force: true });
        }
      }),
      { numRuns: 100 }
    );
  });
});
