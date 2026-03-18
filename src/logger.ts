import * as fs from 'fs';
import * as path from 'path';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  close(): Promise<void>;
}

function formatLogLine(level: LogLevel, message: string): string {
  const iso = new Date().toISOString();
  return `[${iso}] [${level}] ${message}`;
}

/**
 * Format a Date as YYYYMMDD-HHmmss for log rotation filenames.
 */
function formatRotationTimestamp(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const Y = date.getUTCFullYear();
  const M = pad(date.getUTCMonth() + 1);
  const D = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const m = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  return `${Y}${M}${D}-${h}${m}${s}`;
}

/**
 * Count lines in a file. Returns 0 if the file does not exist.
 */
async function countLines(filePath: string): Promise<number> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    if (content.length === 0) return 0;
    // Count newlines; a trailing newline doesn't add an extra line
    const lines = content.split('\n');
    // If the last element is empty string, the file ends with a newline
    return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw err;
  }
}

/**
 * Creates a file-based Logger that writes to <logDir>/notifier.log.
 * On initialization, checks line count; if > 10000, rotates the log file.
 */
export async function createFileLogger(logDir: string): Promise<Logger> {
  const logFile = path.join(logDir, 'notifier.log');

  // Check if rotation is needed
  const lineCount = await countLines(logFile);
  if (lineCount > 10000) {
    const ts = formatRotationTimestamp(new Date());
    const rotatedFile = path.join(logDir, `notifier-${ts}.log`);
    await fs.promises.rename(logFile, rotatedFile);
  }

  // Open (or create) notifier.log in append mode
  const stream = fs.createWriteStream(logFile, { flags: 'a', encoding: 'utf8' });

  // Wait for the stream to be ready
  await new Promise<void>((resolve, reject) => {
    stream.on('open', () => resolve());
    stream.on('error', reject);
  });

  function writeLine(level: LogLevel, message: string): void {
    stream.write(formatLogLine(level, message) + '\n');
  }

  return {
    info(message: string) { writeLine('INFO', message); },
    warn(message: string) { writeLine('WARN', message); },
    error(message: string) { writeLine('ERROR', message); },
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        stream.end((err?: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}

/**
 * Creates a stderr-based Logger. close() is a no-op.
 */
export function createStderrLogger(): Logger {
  function writeLine(level: LogLevel, message: string): void {
    process.stderr.write(formatLogLine(level, message) + '\n');
  }

  return {
    info(message: string) { writeLine('INFO', message); },
    warn(message: string) { writeLine('WARN', message); },
    error(message: string) { writeLine('ERROR', message); },
    close(): Promise<void> {
      return Promise.resolve();
    },
  };
}
