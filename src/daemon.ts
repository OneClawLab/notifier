import { readdir, readFile, rename } from 'node:fs/promises';
import { watch, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { getNotifierHome, getPaths, ensureDirs } from './paths.js';
import { parseTaskFile } from './task-file.js';
import { parseTimerFile } from './timer-file.js';
import { parseCron } from './cron-parser.js';
import { executeCommand } from './executor.js';
import { createFileLogger, createForegroundLogger } from './repo-utils/logger.js';
import type { Logger } from './repo-utils/logger.js';
import { writePidFile, removePidFile, readPidFile, isProcessAlive } from './pid-file.js';
import type { TimerFile } from './types.js';

// ─── Job Table ────────────────────────────────────────────────────────────────

interface Job {
  timer: TimerFile;
  nextRun: Date;
  lastRun?: Date;
}

type JobTable = Map<string, Job>; // key = filename

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the Job Table by scanning the timers/ directory.
 * Invalid timer files are logged and skipped.
 */
async function buildJobTable(timersDir: string, logger: Logger, now: Date): Promise<JobTable> {
  const table: JobTable = new Map();

  let files: string[];
  try {
    files = await readdir(timersDir);
  } catch {
    return table;
  }

  for (const filename of files) {
    if (!filename.endsWith('.txt')) continue;
    const filePath = join(timersDir, filename);
    try {
      const content = await readFile(filePath, 'utf8');
      const result = parseTimerFile(content);
      if (!result.ok) {
        logger.error(`Timer file parse error [${filename}]: ${result.error}`);
        continue;
      }
      const cronResult = parseCron(result.value.timer, now);
      if (!cronResult.ok) {
        logger.error(`Timer file invalid CRON [${filename}]: ${cronResult.error}`);
        continue;
      }
      table.set(filename, {
        timer: result.value,
        nextRun: cronResult.value.nextTime,
      });
    } catch (err) {
      logger.error(`Failed to read timer file [${filename}]: ${String(err)}`);
    }
  }

  logger.info(`Job Table built: ${table.size} timer(s) loaded`);
  return table;
}

/**
 * Handle on_miss=run-once: calculate the previous trigger time and run if missed.
 */
async function handleOnMiss(
  filename: string,
  job: Job,
  logger: Logger,
  currentTaskRef: { promise: Promise<void> | null },
): Promise<void> {
  if (job.timer.on_miss !== 'run-once') return;

  // Calculate the previous trigger time by looking backwards from now
  const now = new Date();
  // We look for the most recent trigger before now
  // Strategy: go back minute by minute from (now - 1 min) up to 366 days
  const prevTime = calcPrevTrigger(job.timer.timer, now);
  if (prevTime === null) return;

  // If there's a previous trigger time, it means daemon was stopped during a window — run once
  logger.info(`on_miss=run-once: running missed trigger for [${filename}] (was due at ${prevTime.toISOString()})`);
  const taskPromise = (async () => {
    const result = await executeCommand(job.timer.command);
    if (result.exitCode !== 0) {
      logger.error(`Timer [${filename}] missed run exited with code ${result.exitCode} (${result.durationMs}ms)`);
    } else {
      logger.info(`Timer [${filename}] missed run completed (exit ${result.exitCode}, ${result.durationMs}ms)`);
    }
  })();
  currentTaskRef.promise = taskPromise;
  await taskPromise;
  currentTaskRef.promise = null;
  job.lastRun = now;
}

/**
 * Calculate the most recent trigger time before `now` for a CRON expression.
 * Returns null if no trigger exists in the past 366 days.
 */
function calcPrevTrigger(expr: string, now: Date): Date | null {
  // We use parseCron going backwards: check (now - 1min), (now - 2min), ...
  // For efficiency, we check up to 366 days back
  const maxMs = 366 * 24 * 60 * 60 * 1000;
  const limit = new Date(now.getTime() - maxMs);

  // Start from the previous minute
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() - 1);

  // We need to check if the CRON matches this candidate
  // Use parseCron with candidate as "now" and check if nextTime is > candidate
  // Actually, we need to check if candidate itself is a trigger time
  // We'll do this by checking parseCron(expr, candidate - 1min).nextTime === candidate
  while (candidate >= limit) {
    const checkFrom = new Date(candidate.getTime() - 60000); // 1 min before candidate
    const result = parseCron(expr, checkFrom);
    if (result.ok && result.value.nextTime.getTime() === candidate.getTime()) {
      return candidate;
    }
    candidate.setMinutes(candidate.getMinutes() - 1);
  }

  return null;
}

/**
 * Calculate the minimum nextRun across all jobs. Returns null if no jobs.
 */
function calcMinNextRun(table: JobTable): Date | null {
  let min: Date | null = null;
  for (const job of table.values()) {
    if (min === null || job.nextRun < min) {
      min = job.nextRun;
    }
  }
  return min;
}

/**
 * Process a single instant task file.
 */
async function processTaskFile(
  filename: string,
  pendingDir: string,
  doneDir: string,
  errorDir: string,
  logger: Logger,
): Promise<void> {
  const srcPath = join(pendingDir, filename);
  logger.info(`Processing task file: ${filename}`);

  let content: string;
  try {
    content = await readFile(srcPath, 'utf8');
  } catch (err) {
    logger.warn(`Could not read task file [${filename}]: ${String(err)}`);
    return;
  }

  const result = parseTaskFile(content);
  if (!result.ok) {
    logger.warn(`Task file parse error [${filename}]: ${result.error}`);
    try {
      await rename(srcPath, join(errorDir, filename));
      logger.info(`Moved [${filename}] to tasks/error/`);
    } catch (err) {
      logger.error(`Failed to move [${filename}] to error: ${String(err)}`);
    }
    return;
  }

  const task = result.value;
  logger.info(`Executing command for task [${filename}]: ${task.command}`);
  const execResult = await executeCommand(task.command);

  if (execResult.exitCode !== 0) {
    logger.error(`Task [${filename}] exited with code ${execResult.exitCode} (${execResult.durationMs}ms)`);
  } else {
    logger.info(`Task [${filename}] completed (exit ${execResult.exitCode}, ${execResult.durationMs}ms)`);
  }

  try {
    await rename(srcPath, join(doneDir, filename));
    logger.info(`Moved [${filename}] to tasks/done/`);
  } catch (err) {
    logger.error(`Failed to move [${filename}] to done: ${String(err)}`);
  }
}

/**
 * Scan tasks/pending/ and process all residual files.
 */
async function processResidualTasks(
  pendingDir: string,
  doneDir: string,
  errorDir: string,
  logger: Logger,
): Promise<void> {
  let files: string[];
  try {
    files = await readdir(pendingDir);
  } catch {
    return;
  }

  const txtFiles = files.filter(f => f.endsWith('.txt'));
  if (txtFiles.length > 0) {
    logger.info(`Processing ${txtFiles.length} residual task file(s) in tasks/pending/`);
  }

  for (const filename of txtFiles) {
    await processTaskFile(filename, pendingDir, doneDir, errorDir, logger);
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface DaemonOptions {
  foreground?: boolean;
}

export async function runDaemon(opts: DaemonOptions = {}): Promise<void> {
  const home = getNotifierHome();
  const paths = getPaths(home);

  // ── Single instance check ──────────────────────────────────────────────────
  const existingPid = await readPidFile(home);
  if (existingPid !== null) {
    if (isProcessAlive(existingPid)) {
      process.stderr.write(
        `Error: Daemon is already running (PID: ${existingPid}). Use 'notifier stop' first.\n`,
      );
      process.exit(1);
    } else {
      // Stale lock — will be overwritten below; log after logger is ready
    }
  }

  // ── Ensure directories ─────────────────────────────────────────────────────
  await ensureDirs(home);

  // ── Logger ─────────────────────────────────────────────────────────────────
  const logger = opts.foreground
    ? await createForegroundLogger(paths.logs, 'notifier')
    : await createFileLogger(paths.logs, 'notifier');

  if (existingPid !== null && !isProcessAlive(existingPid)) {
    logger.warn(`Detected stale lock (PID: ${existingPid}). Overwriting PID file.`);
  }

  // ── Write PID file ─────────────────────────────────────────────────────────
  await writePidFile(home);
  logger.info(`Daemon started (PID: ${process.pid})`);

  // ── Cleanup helper ─────────────────────────────────────────────────────────
  async function cleanup(): Promise<void> {
    logger.info('Daemon stopping — cleaning up');
    await removePidFile(home);
    await logger.close();
  }

  // Register synchronous exit cleanup (fallback)
  process.on('exit', () => {
    try {
      unlinkSync(paths.pidFile);
    } catch {
      // ignore
    }
  });

  // ── Signal handling ────────────────────────────────────────────────────────
  let shuttingDown = false;
  let shutdownResolve: (() => void) | null = null;
  const shutdownPromise = new Promise<void>(resolve => { shutdownResolve = resolve; });

  const currentTaskRef: { promise: Promise<void> | null } = { promise: null };

  async function handleSignal(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal} — waiting for current task to complete`);
    if (currentTaskRef.promise) {
      await currentTaskRef.promise;
    }
    await cleanup();
    shutdownResolve?.();
    process.exit(0);
  }

  process.on('SIGTERM', () => { void handleSignal('SIGTERM'); });
  process.on('SIGINT',  () => { void handleSignal('SIGINT'); });

  // ── Build initial Job Table ────────────────────────────────────────────────
  let jobTable = await buildJobTable(paths.timers, logger, new Date());

  // ── Handle on_miss=run-once for startup ───────────────────────────────────
  for (const [filename, job] of jobTable) {
    await handleOnMiss(filename, job, logger, currentTaskRef);
  }

  // ── Process residual instant tasks ────────────────────────────────────────
  await processResidualTasks(paths.tasksPending, paths.tasksDone, paths.tasksError, logger);

  // ── Watch timers/ for changes → rebuild Job Table ─────────────────────────
  const timersWatcher = watch(paths.timers, { persistent: false }, (_event, _filename) => {
    logger.info('timers/ directory changed — rebuilding Job Table');
    void buildJobTable(paths.timers, logger, new Date()).then(table => {
      jobTable = table;
    });
  });

  // ── Main loop ──────────────────────────────────────────────────────────────
  while (!shuttingDown) {
    const now = new Date();
    const minNextRun = calcMinNextRun(jobTable);

    // Calculate sleep duration until next CRON trigger (or 60s default)
    let sleepMs = 60_000;
    if (minNextRun !== null) {
      const diff = minNextRun.getTime() - now.getTime();
      sleepMs = Math.max(0, diff);
    }

    // Create a file-event promise for tasks/pending/
    let fileEventResolve: ((filename: string) => void) | null = null;
    const fileEventPromise = new Promise<string>(resolve => {
      fileEventResolve = resolve;
    });

    const pendingWatcher = watch(
      paths.tasksPending,
      { persistent: false },
      (_event, filename) => {
        if (filename && filename.endsWith('.txt')) {
          fileEventResolve?.(filename);
        }
      },
    );

    // Race: file event vs timeout vs shutdown
    type RaceResult = { type: 'file'; filename: string } | { type: 'timeout' } | { type: 'shutdown' };

    const timeoutPromise = new Promise<RaceResult>(resolve =>
      setTimeout(() => resolve({ type: 'timeout' }), sleepMs),
    );

    const raceResult = await Promise.race<RaceResult>([
      fileEventPromise.then(filename => ({ type: 'file' as const, filename })),
      timeoutPromise,
      shutdownPromise.then(() => ({ type: 'shutdown' as const })),
    ]);

    // Clean up the pending watcher after each race
    try { pendingWatcher.close(); } catch { /* ignore */ }

    if (shuttingDown || raceResult.type === 'shutdown') {
      break;
    }

    if (raceResult.type === 'file') {
      // Process the instant task file
      const filename = raceResult.filename;
      const taskPromise = processTaskFile(
        filename,
        paths.tasksPending,
        paths.tasksDone,
        paths.tasksError,
        logger,
      );
      currentTaskRef.promise = taskPromise;
      await taskPromise;
      currentTaskRef.promise = null;

      // Drain any additional files that appeared while we were processing
      await processResidualTasks(paths.tasksPending, paths.tasksDone, paths.tasksError, logger);

    } else if (raceResult.type === 'timeout') {
      // Execute all due CRON jobs
      const loopNow = new Date();
      for (const [filename, job] of jobTable) {
        if (job.nextRun <= loopNow) {
          logger.info(`CRON trigger: executing timer [${filename}]`);
          const taskPromise = (async () => {
            const result = await executeCommand(job.timer.command);
            if (result.exitCode !== 0) {
              logger.error(`Timer [${filename}] exited with code ${result.exitCode} (${result.durationMs}ms)`);
            } else {
              logger.info(`Timer [${filename}] completed (exit ${result.exitCode}, ${result.durationMs}ms)`);
            }
          })();
          currentTaskRef.promise = taskPromise;
          await taskPromise;
          currentTaskRef.promise = null;
          job.lastRun = loopNow;

          // Update nextRun
          const nextResult = parseCron(job.timer.timer, loopNow);
          if (nextResult.ok) {
            job.nextRun = nextResult.value.nextTime;
            logger.info(`Timer [${filename}] next run: ${job.nextRun.toISOString()}`);
          }
        }
      }
    }
  }

  // ── Shutdown ───────────────────────────────────────────────────────────────
  try { timersWatcher.close(); } catch { /* ignore */ }
  await cleanup();
}
