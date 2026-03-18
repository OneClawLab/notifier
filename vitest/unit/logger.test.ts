import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createFileLogger, createStderrLogger } from '../../src/logger.js';
import { createTmpNotifierHome } from '../helpers/tmp-dir.js';

// Regex for [ISO8601] [LEVEL] message format
const LOG_LINE_RE = /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[(INFO|WARN|ERROR)\] .+$/;

describe('log line format', () => {
  it('each written line matches [ISO8601] [LEVEL] message pattern', async () => {
    const { home, cleanup } = await createTmpNotifierHome();
    try {
      const logger = await createFileLogger(home);
      logger.info('hello world');
      logger.warn('something odd');
      logger.error('something broke');
      await logger.close();

      const content = fs.readFileSync(path.join(home, 'notifier.log'), 'utf8');
      const lines = content.split('\n').filter(l => l.length > 0);
      expect(lines).toHaveLength(3);
      for (const line of lines) {
        expect(line).toMatch(LOG_LINE_RE);
      }
    } finally {
      await cleanup();
    }
  });

  it('INFO line contains INFO level tag', async () => {
    const { home, cleanup } = await createTmpNotifierHome();
    try {
      const logger = await createFileLogger(home);
      logger.info('test message');
      await logger.close();

      const content = fs.readFileSync(path.join(home, 'notifier.log'), 'utf8');
      expect(content).toContain('[INFO] test message');
    } finally {
      await cleanup();
    }
  });

  it('WARN line contains WARN level tag', async () => {
    const { home, cleanup } = await createTmpNotifierHome();
    try {
      const logger = await createFileLogger(home);
      logger.warn('watch out');
      await logger.close();

      const content = fs.readFileSync(path.join(home, 'notifier.log'), 'utf8');
      expect(content).toContain('[WARN] watch out');
    } finally {
      await cleanup();
    }
  });

  it('ERROR line contains ERROR level tag', async () => {
    const { home, cleanup } = await createTmpNotifierHome();
    try {
      const logger = await createFileLogger(home);
      logger.error('it failed');
      await logger.close();

      const content = fs.readFileSync(path.join(home, 'notifier.log'), 'utf8');
      expect(content).toContain('[ERROR] it failed');
    } finally {
      await cleanup();
    }
  });
});

describe('createFileLogger', () => {
  it('writes to notifier.log in the given directory', async () => {
    const { home, cleanup } = await createTmpNotifierHome();
    try {
      const logger = await createFileLogger(home);
      logger.info('written to file');
      await logger.close();

      const logPath = path.join(home, 'notifier.log');
      expect(fs.existsSync(logPath)).toBe(true);
      const content = fs.readFileSync(logPath, 'utf8');
      expect(content).toContain('written to file');
    } finally {
      await cleanup();
    }
  });

  it('close() resolves without error', async () => {
    const { home, cleanup } = await createTmpNotifierHome();
    try {
      const logger = await createFileLogger(home);
      await expect(logger.close()).resolves.toBeUndefined();
    } finally {
      await cleanup();
    }
  });
});

describe('log rotation', () => {
  it('renames notifier.log when it has > 10000 lines', async () => {
    const { home, cleanup } = await createTmpNotifierHome();
    try {
      // Write 10001 lines to notifier.log
      const logPath = path.join(home, 'notifier.log');
      const bigContent = Array.from({ length: 10001 }, (_, i) => `line ${i}`).join('\n') + '\n';
      fs.writeFileSync(logPath, bigContent, 'utf8');

      const logger = await createFileLogger(home);
      await logger.close();

      // Original notifier.log should no longer contain the old content
      const newContent = fs.readFileSync(logPath, 'utf8');
      expect(newContent).not.toContain('line 0');

      // A rotated file matching notifier-<YYYYMMDD-HHmmss>.log should exist
      const files = fs.readdirSync(home);
      const rotated = files.filter(f => /^notifier-\d{8}-\d{6}\.log$/.test(f));
      expect(rotated).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });

  it('does NOT rotate when notifier.log has exactly 10000 lines', async () => {
    const { home, cleanup } = await createTmpNotifierHome();
    try {
      const logPath = path.join(home, 'notifier.log');
      const content = Array.from({ length: 10000 }, (_, i) => `line ${i}`).join('\n') + '\n';
      fs.writeFileSync(logPath, content, 'utf8');

      const logger = await createFileLogger(home);
      await logger.close();

      const files = fs.readdirSync(home);
      const rotated = files.filter(f => /^notifier-\d{8}-\d{6}\.log$/.test(f));
      expect(rotated).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('rotation filename matches notifier-<YYYYMMDD-HHmmss>.log format', async () => {
    const { home, cleanup } = await createTmpNotifierHome();
    try {
      const logPath = path.join(home, 'notifier.log');
      const bigContent = Array.from({ length: 10001 }, (_, i) => `line ${i}`).join('\n') + '\n';
      fs.writeFileSync(logPath, bigContent, 'utf8');

      const logger = await createFileLogger(home);
      await logger.close();

      const files = fs.readdirSync(home);
      const rotated = files.filter(f => /^notifier-\d{8}-\d{6}\.log$/.test(f));
      expect(rotated).toHaveLength(1);
      // Verify the timestamp portion is a plausible date
      const match = rotated[0].match(/^notifier-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.log$/);
      expect(match).not.toBeNull();
    } finally {
      await cleanup();
    }
  });

  it('creates a fresh notifier.log after rotation', async () => {
    const { home, cleanup } = await createTmpNotifierHome();
    try {
      const logPath = path.join(home, 'notifier.log');
      const bigContent = Array.from({ length: 10001 }, (_, i) => `line ${i}`).join('\n') + '\n';
      fs.writeFileSync(logPath, bigContent, 'utf8');

      const logger = await createFileLogger(home);
      logger.info('fresh start');
      await logger.close();

      const newContent = fs.readFileSync(logPath, 'utf8');
      expect(newContent).toContain('[INFO] fresh start');
      // Should not contain old lines
      expect(newContent).not.toContain('line 0');
    } finally {
      await cleanup();
    }
  });
});

describe('createStderrLogger', () => {
  it('writes to stderr', () => {
    const chunks: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    // Capture stderr
    process.stderr.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
      return true;
    };

    try {
      const logger = createStderrLogger();
      logger.info('stderr test');
    } finally {
      process.stderr.write = originalWrite;
    }

    expect(chunks.join('')).toContain('[INFO] stderr test');
  });

  it('close() resolves without error', async () => {
    const logger = createStderrLogger();
    await expect(logger.close()).resolves.toBeUndefined();
  });
});
