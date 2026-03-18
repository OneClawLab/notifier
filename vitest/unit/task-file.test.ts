import { describe, it, expect } from 'vitest';
import { parseTaskFile, serializeTaskFile, taskFileName } from '../../src/task-file.js';

const VALID_CONTENT = `author=alice
task_id=build-42
command=echo hello
created_at=2024-01-15T10:00:00.000Z
`;

describe('parseTaskFile', () => {
  it('parses a valid file with all required fields', () => {
    const result = parseTaskFile(VALID_CONTENT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.author).toBe('alice');
    expect(result.value.task_id).toBe('build-42');
    expect(result.value.command).toBe('echo hello');
    expect(result.value.created_at).toBe('2024-01-15T10:00:00.000Z');
    expect(result.value.description).toBeUndefined();
  });

  it('parses a valid file with optional description field', () => {
    const content = VALID_CONTENT + 'description=my task description\n';
    const result = parseTaskFile(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.description).toBe('my task description');
  });

  it('ignores empty lines and comment lines', () => {
    const content = `# this is a comment
author=alice

task_id=build-42
# another comment
command=echo hello
created_at=2024-01-15T10:00:00.000Z
`;
    const result = parseTaskFile(content);
    expect(result.ok).toBe(true);
  });

  it('handles values containing = signs', () => {
    const content = `author=alice
task_id=build-42
command=VAR=value echo hello
created_at=2024-01-15T10:00:00.000Z
`;
    const result = parseTaskFile(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.command).toBe('VAR=value echo hello');
  });

  describe('missing required fields', () => {
    for (const field of ['author', 'task_id', 'command', 'created_at']) {
      it(`returns error containing "${field}" when ${field} is missing`, () => {
        const lines = VALID_CONTENT.split('\n').filter(l => !l.startsWith(field));
        const result = parseTaskFile(lines.join('\n'));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toContain(field);
      });
    }
  });
});

describe('serializeTaskFile', () => {
  it('serializes required fields in key=value format', () => {
    const task = {
      author: 'alice',
      task_id: 'build-42',
      command: 'echo hello',
      created_at: '2024-01-15T10:00:00.000Z',
    };
    const output = serializeTaskFile(task);
    expect(output).toContain('author=alice');
    expect(output).toContain('task_id=build-42');
    expect(output).toContain('command=echo hello');
    expect(output).toContain('created_at=2024-01-15T10:00:00.000Z');
  });

  it('includes description when present', () => {
    const task = {
      author: 'alice',
      task_id: 'build-42',
      command: 'echo hello',
      created_at: '2024-01-15T10:00:00.000Z',
      description: 'my task',
    };
    const output = serializeTaskFile(task);
    expect(output).toContain('description=my task');
  });

  it('omits description when undefined', () => {
    const task = {
      author: 'alice',
      task_id: 'build-42',
      command: 'echo hello',
      created_at: '2024-01-15T10:00:00.000Z',
    };
    const output = serializeTaskFile(task);
    expect(output).not.toContain('description');
  });

  it('each field is on its own line', () => {
    const task = {
      author: 'alice',
      task_id: 'build-42',
      command: 'echo hello',
      created_at: '2024-01-15T10:00:00.000Z',
    };
    const lines = serializeTaskFile(task).split('\n').filter(l => l.length > 0);
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      expect(line).toMatch(/^[^=]+=.*/);
    }
  });
});

describe('taskFileName', () => {
  it('returns <author>-<taskId>.txt', () => {
    expect(taskFileName('alice', 'build-42')).toBe('alice-build-42.txt');
  });

  it('handles various author and taskId values', () => {
    expect(taskFileName('agent-007', 'task-1')).toBe('agent-007-task-1.txt');
  });
});
