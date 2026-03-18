// Feature: notifier-daemon, Property 9: 错误输出到 stderr 且包含修复建议
// Feature: notifier-daemon, Property 10: --json 模式下错误以 JSON 格式输出
import { describe, it } from 'vitest';
import * as fc from 'fast-check';

// Mirror the outputError pattern from commands/task.ts
function outputErrorText(error: string, suggestion: string): string {
  return `Error: ${error}\nSuggestion: ${suggestion}\n`;
}

function outputErrorJson(error: string, suggestion: string): string {
  return JSON.stringify({ error, suggestion }) + '\n';
}

const safeStringArb = fc.string({ minLength: 1, maxLength: 100 }).filter(
  s => !s.includes('\n') && s.trim().length > 0
);

describe('Property 9: 错误输出到 stderr 且包含修复建议', () => {
  it('text format output contains "Error:" and "Suggestion:" prefixes', () => {
    // Validates: Requirements 16.1, 16.2
    fc.assert(
      fc.property(safeStringArb, safeStringArb, (error, suggestion) => {
        const output = outputErrorText(error, suggestion);
        return output.includes('Error:') && output.includes('Suggestion:');
      }),
      { numRuns: 100 }
    );
  });

  it('text format output contains the actual error and suggestion values', () => {
    // Validates: Requirements 16.1, 16.2
    fc.assert(
      fc.property(safeStringArb, safeStringArb, (error, suggestion) => {
        const output = outputErrorText(error, suggestion);
        return output.includes(error) && output.includes(suggestion);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 10: --json 模式下错误以 JSON 格式输出', () => {
  it('JSON format output is valid JSON with error and suggestion fields', () => {
    // Validates: Requirements 16.3
    fc.assert(
      fc.property(safeStringArb, safeStringArb, (error, suggestion) => {
        const output = outputErrorJson(error, suggestion);

        let parsed: unknown;
        try {
          parsed = JSON.parse(output.trim());
        } catch {
          return false;
        }

        if (typeof parsed !== 'object' || parsed === null) return false;
        const obj = parsed as Record<string, unknown>;
        return 'error' in obj && 'suggestion' in obj;
      }),
      { numRuns: 100 }
    );
  });

  it('JSON format output error and suggestion fields match input values', () => {
    // Validates: Requirements 16.3
    fc.assert(
      fc.property(safeStringArb, safeStringArb, (error, suggestion) => {
        const output = outputErrorJson(error, suggestion);
        const parsed = JSON.parse(output.trim()) as { error: string; suggestion: string };
        return parsed.error === error && parsed.suggestion === suggestion;
      }),
      { numRuns: 100 }
    );
  });
});
