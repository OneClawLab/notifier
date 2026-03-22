/**
 * Integration tests for notifier daemon lifecycle
 * Spawns real CLI processes via `npx tsx src/index.ts`
 * Uses NOTIFIER_HOME env var to isolate test directories
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createTmpNotifierHome } from '../helpers/tmp-dir.js';
import { getPaths } from '../../src/paths.js';
import { isProcessAlive } from '../../src/pid-file.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Repo root is two levels up from vitest/integration/
const REPO_ROOT = join(__dirname, '../../');

// ── Helpers ───────────────────────────────────────────────────────────────────

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Run a notifier CLI command and wait for it to exit.
 * Inherits NOTIFIER_HOME from process.env (set by createTmpNotifierHome).
 */
function runCli(args: string[], timeoutMs = 8000): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    // Use node + tsx loader directly for cross-platform compatibility
    const child = spawn(
      process.execPath,
      ['--import', 'tsx/esm', 'src/index.ts', ...args],
      {
        cwd: REPO_ROOT,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`CLI timed out after ${timeoutMs}ms: notifier ${args.join(' ')}`));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Read the PID from the notifier.pid file in the given home directory.
 */
async function readPid(home: string): Promise<number | null> {
  const pidFile = getPaths(home).pidFile;
  if (!existsSync(pidFile)) return null;
  const content = await readFile(pidFile, 'utf8');
  const pid = parseInt(content.trim(), 10);
  return isNaN(pid) ? null : pid;
}

/**
 * Kill a process by PID, ignoring errors (process may already be gone).
 */
function killPid(pid: number): void {
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // already dead — ignore
  }
}

// ── Test state ────────────────────────────────────────────────────────────────

let home: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  const tmp = await createTmpNotifierHome();
  home = tmp.home;
  cleanup = tmp.cleanup;
});

afterEach(async () => {
  // Force-kill any daemon that may still be running to avoid process leaks
  const pid = await readPid(home);
  if (pid !== null) {
    killPid(pid);
  }
  await cleanup();
});

// ── Requirement 2.1: start creates PID file and process is alive ──────────────

describe('Requirement 2.1 — notifier start creates PID file and process is alive', () => {
  it('PID file exists after notifier start', async () => {
    await runCli(['start']);

    // Poll for PID file to appear (up to 3s)
    const pidFile = getPaths(home).pidFile;
    const deadline = Date.now() + 3000;
    while (!existsSync(pidFile) && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }

    expect(existsSync(pidFile)).toBe(true);
  }, 15000);

  it('process recorded in PID file is alive after notifier start', async () => {
    await runCli(['start']);

    // Poll for PID file to appear (up to 3s)
    const pidFile = getPaths(home).pidFile;
    const deadline = Date.now() + 3000;
    while (!existsSync(pidFile) && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }

    const pid = await readPid(home);
    expect(pid).not.toBeNull();
    expect(isProcessAlive(pid!)).toBe(true);
  }, 15000);
});

// ── Requirement 2.2: stop deletes PID file ────────────────────────────────────

describe('Requirement 2.2 — notifier stop deletes PID file', () => {
  it('PID file is deleted after notifier stop', async () => {
    await runCli(['start']);

    // Poll for PID file to appear (up to 3s)
    const pidFilePath = getPaths(home).pidFile;
    const startDeadline = Date.now() + 3000;
    while (!existsSync(pidFilePath) && Date.now() < startDeadline) {
      await new Promise(r => setTimeout(r, 100));
    }

    // Verify daemon is running first
    const pidBefore = await readPid(home);
    expect(pidBefore).not.toBeNull();

    const result = await runCli(['stop'], 12000);
    expect(result.exitCode).toBe(0);

    const pidFile = getPaths(home).pidFile;
    expect(existsSync(pidFile)).toBe(false);
  }, 20000);
});

// ── Requirement 2.3: task add creates file in tasks/pending/ ─────────────────

describe('Requirement 2.3 — notifier task add creates file in tasks/pending/', () => {
  it('task file appears in tasks/pending/ after task add', async () => {
    const result = await runCli([
      'task', 'add',
      '--author', 'test-author',
      '--task-id', 'task-001',
      '--command', 'echo hello',
    ]);

    expect(result.exitCode).toBe(0);

    const taskFile = join(getPaths(home).tasksPending, 'test-author-task-001.txt');
    expect(existsSync(taskFile)).toBe(true);
  }, 15000);

  it('task file content contains correct author and task-id', async () => {
    await runCli([
      'task', 'add',
      '--author', 'my-agent',
      '--task-id', 'dispatch-42',
      '--command', 'echo dispatch',
    ]);

    const taskFile = join(getPaths(home).tasksPending, 'my-agent-dispatch-42.txt');
    const content = await readFile(taskFile, 'utf8');
    expect(content).toContain('author=my-agent');
    expect(content).toContain('task_id=dispatch-42');
    expect(content).toContain('command=echo dispatch');
  }, 15000);
});

// ── Requirement 2.4: status shows running: false when daemon not running ──────

describe('Requirement 2.4 — notifier status shows running: false when daemon not running', () => {
  it('status output contains "running: false" when daemon is not running', async () => {
    const result = await runCli(['status', '--json']);

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { running: boolean; pid: number | null };
    expect(parsed.running).toBe(false);
  }, 15000);

  it('status plain text output says daemon is not running', async () => {
    const result = await runCli(['status']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('not running');
  }, 15000);
});

// ── Requirement 2.5: repeated start exits with code 1 ────────────────────────

describe('Requirement 2.5 — repeated notifier start exits with code 1', () => {
  it('second notifier start exits with code 1 when daemon already running', async () => {
    await runCli(['start']);
    await new Promise(r => setTimeout(r, 500));

    const second = await runCli(['start']);
    expect(second.exitCode).toBe(1);
  }, 20000);

  it('second start writes error message to stderr', async () => {
    await runCli(['start']);
    await new Promise(r => setTimeout(r, 500));

    const second = await runCli(['start']);
    expect(second.stderr).toMatch(/already running/i);
  }, 20000);
});

// ── Requirement 2.6: timer add creates file in timers/ ───────────────────────

describe('Requirement 2.6 — notifier timer add creates file in timers/', () => {
  it('timer file appears in timers/ after timer add', async () => {
    const result = await runCli([
      'timer', 'add',
      '--author', 'test-author',
      '--task-id', 'daily-job',
      '--command', 'echo daily',
      '--timer', '0 9 * * *',
    ]);

    expect(result.exitCode).toBe(0);

    const timerFile = join(getPaths(home).timers, 'test-author-daily-job.txt');
    expect(existsSync(timerFile)).toBe(true);
  }, 15000);

  it('timer file content contains correct fields', async () => {
    await runCli([
      'timer', 'add',
      '--author', 'scheduler',
      '--task-id', 'weekly-report',
      '--command', 'echo report',
      '--timer', '0 8 * * 1',
    ]);

    const timerFile = join(getPaths(home).timers, 'scheduler-weekly-report.txt');
    const content = await readFile(timerFile, 'utf8');
    expect(content).toContain('author=scheduler');
    expect(content).toContain('task_id=weekly-report');
    expect(content).toContain('command=echo report');
    expect(content).toContain('timer=0 8 * * 1');
  }, 15000);
});
