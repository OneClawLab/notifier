import { describe, it, expect } from 'vitest';
import { parseTimerFile, serializeTimerFile, timerFileName } from '../../src/timer-file.js';

const VALID_CONTENT = `author=alice
task_id=daily-build
command=npm run build
timer=0 9 * * 1-5
timer_desc=At 09:00, Monday through Friday
created_at=2024-01-15T10:00:00.000Z
`;

describe('parseTimerFile', () => {
  it('parses a valid file with all required fields', () => {
    const result = parseTimerFile(VALID_CONTENT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.author).toBe('alice');
    expect(result.value.task_id).toBe('daily-build');
    expect(result.value.command).toBe('npm run build');
    expect(result.value.timer).toBe('0 9 * * 1-5');
    expect(result.value.timer_desc).toBe('At 09:00, Monday through Friday');
    expect(result.value.created_at).toBe('2024-01-15T10:00:00.000Z');
    expect(result.value.description).toBeUndefined();
    expect(result.value.on_miss).toBeUndefined();
  });

  it('parses optional description field', () => {
    const content = VALID_CONTENT + 'description=runs the build daily\n';
    const result = parseTimerFile(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.description).toBe('runs the build daily');
  });

  describe('on_miss field', () => {
    it('accepts on_miss=skip', () => {
      const content = VALID_CONTENT + 'on_miss=skip\n';
      const result = parseTimerFile(content);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.on_miss).toBe('skip');
    });

    it('accepts on_miss=run-once', () => {
      const content = VALID_CONTENT + 'on_miss=run-once\n';
      const result = parseTimerFile(content);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.on_miss).toBe('run-once');
    });

    it('on_miss is undefined when absent', () => {
      const result = parseTimerFile(VALID_CONTENT);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.on_miss).toBeUndefined();
    });

    it('returns error for invalid on_miss value containing field name and valid values', () => {
      const content = VALID_CONTENT + 'on_miss=invalid-value\n';
      const result = parseTimerFile(content);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain('on_miss');
      expect(result.error).toContain('skip');
      expect(result.error).toContain('run-once');
    });
  });

  describe('missing required fields', () => {
    for (const field of ['author', 'task_id', 'command', 'timer', 'timer_desc', 'created_at']) {
      it(`returns error containing "${field}" when ${field} is missing`, () => {
        const lines = VALID_CONTENT.split('\n').filter(l => !l.startsWith(field));
        const result = parseTimerFile(lines.join('\n'));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toContain(field);
      });
    }
  });
});

describe('serializeTimerFile', () => {
  it('serializes all required fields in key=value format', () => {
    const timer = {
      author: 'alice',
      task_id: 'daily-build',
      command: 'npm run build',
      timer: '0 9 * * 1-5',
      timer_desc: 'At 09:00, Monday through Friday',
      created_at: '2024-01-15T10:00:00.000Z',
    };
    const output = serializeTimerFile(timer);
    expect(output).toContain('author=alice');
    expect(output).toContain('task_id=daily-build');
    expect(output).toContain('command=npm run build');
    expect(output).toContain('timer=0 9 * * 1-5');
    expect(output).toContain('timer_desc=At 09:00, Monday through Friday');
    expect(output).toContain('created_at=2024-01-15T10:00:00.000Z');
  });

  it('includes description when present', () => {
    const timer = {
      author: 'alice',
      task_id: 'daily-build',
      command: 'npm run build',
      timer: '0 9 * * 1-5',
      timer_desc: 'At 09:00, Monday through Friday',
      created_at: '2024-01-15T10:00:00.000Z',
      description: 'daily build job',
    };
    const output = serializeTimerFile(timer);
    expect(output).toContain('description=daily build job');
  });

  it('includes on_miss when present', () => {
    const timer = {
      author: 'alice',
      task_id: 'daily-build',
      command: 'npm run build',
      timer: '0 9 * * 1-5',
      timer_desc: 'At 09:00, Monday through Friday',
      created_at: '2024-01-15T10:00:00.000Z',
      on_miss: 'run-once' as const,
    };
    const output = serializeTimerFile(timer);
    expect(output).toContain('on_miss=run-once');
  });

  it('omits optional fields when undefined', () => {
    const timer = {
      author: 'alice',
      task_id: 'daily-build',
      command: 'npm run build',
      timer: '0 9 * * 1-5',
      timer_desc: 'At 09:00, Monday through Friday',
      created_at: '2024-01-15T10:00:00.000Z',
    };
    const output = serializeTimerFile(timer);
    expect(output).not.toContain('description');
    expect(output).not.toContain('on_miss');
  });

  it('each field is on its own line', () => {
    const timer = {
      author: 'alice',
      task_id: 'daily-build',
      command: 'npm run build',
      timer: '0 9 * * 1-5',
      timer_desc: 'At 09:00, Monday through Friday',
      created_at: '2024-01-15T10:00:00.000Z',
    };
    const lines = serializeTimerFile(timer).split('\n').filter(l => l.length > 0);
    expect(lines).toHaveLength(6);
    for (const line of lines) {
      expect(line).toMatch(/^[^=]+=.*/);
    }
  });
});

describe('timerFileName', () => {
  it('returns <author>-<taskId>.txt', () => {
    expect(timerFileName('alice', 'daily-build')).toBe('alice-daily-build.txt');
  });

  it('handles various author and taskId values', () => {
    expect(timerFileName('agent-007', 'timer-1')).toBe('agent-007-timer-1.txt');
  });
});
