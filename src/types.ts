export interface TaskFile {
  author: string;
  task_id: string;
  command: string;
  created_at: string;       // ISO 8601
  description?: string;
}

export interface TimerFile {
  author: string;
  task_id: string;
  command: string;
  timer: string;            // CRON 表达式
  timer_desc: string;       // 自动生成的英文描述
  created_at: string;       // ISO 8601
  description?: string;
  on_miss?: 'skip' | 'run-once';
}

export type ParseResult<T> = {
  ok: true;
  value: T;
} | {
  ok: false;
  error: string;
}

export interface CronParseResult {
  nextTime: Date;
  description: string;
}

export type TaskStatus = 'pending' | 'done' | 'error';

export interface ExecuteResult {
  exitCode: number;
  durationMs: number;
}

export interface DaemonStatus {
  running: boolean;
  pid: number | null;
}
