# 实现计划：notifier-daemon

## 概述

按照设计文档，将 notifier 分为以下实现阶段：核心类型与工具模块 → 文件解析/序列化 → CRON 解析 → CLI 子命令 → Daemon 主循环 → 日志与收尾。每个阶段完成后通过测试验证，最终将所有模块串联。

---

## Tasks

- [ ] 1. 初始化项目结构与配置
  - 从 `pai` repo 复制并调整 `package.json`（修改 name 为 `notifier`，bin 为 `notifier`，调整 dependencies：保留 commander、vitest、fast-check、tsup，移除 pai 专用依赖）
  - 从 `pai` repo 直接复制 `tsconfig.json`（完全相同）
  - 从 `pai` repo 直接复制 `tsup.config.ts`（完全相同）
  - 从 `pai` repo 直接复制 `vitest.config.ts`（完全相同）
  - 从 `pai/src/os-utils.ts` 复制到 `src/os-utils.ts`（Shell 命令执行工具，不修改）
  - 创建 `src/types.ts`（`TaskFile`、`TimerFile`（含 `on_miss?`）、`ParseResult`、`TaskStatus`、`CronParseResult`、`ExecuteResult`、`DaemonStatus` 等共享类型）
  - 创建目录骨架：`src/commands/`、`vitest/unit/`、`vitest/pbt/`、`vitest/fixtures/`、`vitest/helpers/`
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 2. 实现数据目录管理模块
  - [ ] 2.1 实现 `src/paths.ts`
    - 导出 `getNotifierHome()`：读取 `NOTIFIER_HOME` 环境变量，默认 `~/.local/share/notifier`
    - 导出 `getPaths(home)`：返回所有子目录路径对象
    - 导出 `ensureDirs(home)`：使用 `fs.mkdir` 递归创建所有必需目录
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [ ]* 2.2 为 `paths.ts` 编写单元测试
    - 测试 `NOTIFIER_HOME` 环境变量覆盖行为
    - 测试目录自动创建
    - _Requirements: 1.2, 1.4_

- [ ] 3. 实现即时任务文件 Parser/Serializer
  - [ ] 3.1 实现 `src/task-file.ts`
    - 实现 `parseTaskFile(content: string): ParseResult<TaskFile>`
    - 实现 `serializeTaskFile(task: TaskFile): string`
    - 实现 `taskFileName(author, taskId): string`
    - 解析规则：按行分割，忽略空行和 `#` 注释，按第一个 `=` 分割 key/value
    - 必需字段验证：`author`、`task_id`、`command`、`created_at`；缺失时错误信息包含字段名
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [ ]* 3.2 为 `task-file.ts` 编写单元测试（`vitest/unit/task-file.test.ts`）
    - 测试合法文件解析、缺失各必需字段的错误信息、可选字段、序列化格式
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [ ]* 3.3 为 `task-file.ts` 编写 PBT（`vitest/pbt/task-file.pbt.test.ts`）
    - **Property 1：即时任务文件 Round-Trip**
    - `parse(serialize(task)) === task`，对所有合法 `TaskFile` 对象成立
    - 使用 `fast-check` 生成随机合法 `TaskFile`，最少 100 次迭代
    - `// Feature: notifier-daemon, Property 1: 即时任务文件 Round-Trip`
    - _Requirements: 2.5, 2.6_

- [ ] 4. 实现定时任务文件 Parser/Serializer
  - [ ] 4.1 实现 `src/timer-file.ts`
    - 实现 `parseTimerFile(content: string): ParseResult<TimerFile>`
    - 实现 `serializeTimerFile(timer: TimerFile): string`
    - 实现 `timerFileName(author, taskId): string`
    - 必需字段：`author`、`task_id`、`command`、`timer`、`timer_desc`、`created_at`
    - 可选字段：`description`、`on_miss`（合法值：`skip` | `run-once`，默认 `skip`；非法值返回错误，错误信息包含字段名和合法值列表）
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [ ]* 4.2 为 `timer-file.ts` 编写单元测试（`vitest/unit/timer-file.test.ts`）
    - 测试合法文件解析、缺失各必需字段的错误信息、可选字段、序列化格式
    - 测试 `on_miss` 合法值（`skip`、`run-once`、未设置）和非法值的错误信息
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_
  - [ ]* 4.3 为 `timer-file.ts` 编写 PBT（`vitest/pbt/timer-file.pbt.test.ts`）
    - **Property 2：定时任务文件 Round-Trip**
    - `parse(serialize(timer)) === timer`，对所有合法 `TimerFile` 对象成立（包含 `on_miss` 字段的所有合法值）
    - `// Feature: notifier-daemon, Property 2: 定时任务文件 Round-Trip`
    - _Requirements: 3.7, 3.8_
  - [ ]* 4.4 为 Parser 错误信息编写 PBT（`vitest/pbt/parser-errors.pbt.test.ts`）
    - **Property 3：缺失必需字段时错误信息包含字段名**
    - 随机删除即时任务或定时任务文件的必需字段，验证错误信息包含该字段名
    - `// Feature: notifier-daemon, Property 3: 缺失必需字段时错误信息包含字段名`
    - **Property 3b：on_miss 非法值时错误信息包含字段名和合法值**
    - 随机生成非法 `on_miss` 值，验证错误信息包含 `on_miss` 和合法值列表
    - `// Feature: notifier-daemon, Property 3b: on_miss 非法值时错误信息包含字段名和合法值`
    - _Requirements: 2.3, 3.3, 3.6_

- [ ] 5. 实现 CRON 表达式解析器
  - [ ] 5.1 实现 `src/cron-parser.ts`
    - 实现 `parseCron(expr: string, now?: Date): ParseResult<CronParseResult>`
    - 实现 `describeCron(expr: string): ParseResult<string>`
    - 支持 5 字段格式：分 时 日 月 周
    - 支持 `*`、数字、`*/n`、`a-b`、`a,b,c`
    - 字段数量不等于 5 时返回格式错误
    - 非法字段值时错误信息包含字段名（minute/hour/day/month/weekday）
    - 下一次触发时间计算：从 now 向前逐分钟推进（最多 366 天）
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ]* 5.2 为 `cron-parser.ts` 编写单元测试（`vitest/unit/cron-parser.test.ts`）
    - 测试已知 CRON 表达式的 timer_desc 和下一次触发时间
    - 测试非法字段数量、非法字段值的错误信息
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ]* 5.3 为 `cron-parser.ts` 编写 PBT（`vitest/pbt/cron-parser.pbt.test.ts`）
    - **Property 4：CRON 下一次触发时间不早于当前时间**
    - 对所有合法 CRON 表达式和随机时间，`nextTime > now`
    - `// Feature: notifier-daemon, Property 4: CRON 下一次触发时间不早于当前时间`
    - **Property 5：非法 CRON 字段数量返回错误**
    - 对所有字段数量 ≠ 5 的字符串，`parseCron` 返回 `ok: false`
    - `// Feature: notifier-daemon, Property 5: 非法 CRON 字段数量返回错误`
    - **Property 6：非法 CRON 字段值错误信息包含字段名**
    - 对包含非法字段值的 CRON 表达式，错误信息包含字段名
    - `// Feature: notifier-daemon, Property 6: 非法 CRON 字段值错误信息包含字段名`
    - _Requirements: 4.2, 4.3, 4.6_

- [ ] 6. 实现 Shell 命令执行器
  - [ ] 6.1 实现 `src/executor.ts`（薄封装 os-utils.ts）
    - 实现 `executeCommand(command: string): Promise<ExecuteResult>`
    - 内部调用 `os-utils.ts` 的 `spawnCommand('sh', ['-c', command])`
    - 额外记录 `durationMs`（执行前后 `Date.now()` 差值）
    - 返回 `{ exitCode, durationMs }`
    - _Requirements: 12.5, 12.6, 12.7_
  - [ ]* 6.2 从 `pai/vitest/unit/bash-exec.test.ts` 适配复制 `vitest/unit/os-utils.test.ts`
    - 保留 spawnCommand/execCommand 的核心测试用例（pipes、exit codes、stderr、PBT 部分）
    - 去掉 pai 专用的 bash_exec tool 相关测试，改为直接测试 os-utils 函数
    - _Requirements: 12.5, 12.6_

- [ ] 7. 实现日志模块
  - [ ] 7.1 实现 `src/logger.ts`
    - 实现 `createFileLogger(logDir: string): Promise<Logger>`
    - 实现 `createStderrLogger(): Logger`
    - 日志格式：`[<ISO8601>] [<LEVEL>] <message>`
    - 初始化时检查 `notifier.log` 行数，超过 10000 行触发轮换
    - 轮换：重命名为 `notifier-<YYYYMMDD-HHmmss>.log`，创建新 `notifier.log`
    - _Requirements: 15.1, 15.2, 15.4, 15.5_
  - [ ]* 7.2 为 `logger.ts` 编写单元测试（`vitest/unit/logger.test.ts`）
    - 测试日志格式、日志轮换触发（行数超限）、轮换文件命名
    - _Requirements: 15.2, 15.4, 15.5_
  - [ ]* 7.3 为 `logger.ts` 编写 PBT（`vitest/pbt/logger.pbt.test.ts`）
    - **Property 12：日志行格式符合规范**
    - 对任意日志消息和级别，写入的日志行符合 `[ISO8601] [LEVEL] message` 格式
    - `// Feature: notifier-daemon, Property 12: 日志行格式符合规范`
    - _Requirements: 15.2_

- [ ] 8. Checkpoint — 确保所有测试通过
  - 运行 `vitest run`，确保所有已实现的单元测试和 PBT 通过，如有问题请告知。

- [ ] 9. 实现 `task` CLI 子命令
  - [ ] 9.1 实现 `src/commands/task.ts`
    - 实现 `task add`：验证参数、支持 stdin 读取 command、写入 `tasks/pending/<author>-<task_id>.txt`、自动写入 `created_at`、重复文件报错退出码 1
    - 实现 `task list`：支持 `--status`（默认 pending）、`--json`，输出摘要信息
    - 实现 `task remove`：支持 `--status`（默认 pending），文件不存在报错退出码 1
    - 错误信息输出到 stderr，包含问题描述和修复建议
    - `--json` 模式下错误以 `{"error": "...", "suggestion": "..."}` 格式输出
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 16.1, 16.2, 16.3_
  - [ ]* 9.2 为 `task` 子命令编写集成测试（`vitest/unit/task-commands.test.ts`）
    - 使用临时目录（`vitest/helpers/tmp-dir.ts`）
    - 测试 task add 成功、重复添加报错、stdin 读取、task list 各状态、task remove 成功/不存在报错
    - _Requirements: 5.1, 5.4, 6.1, 6.2, 7.1, 7.3_
  - [ ]* 9.3 为 `task list --json` 编写 PBT（`vitest/pbt/task-list.pbt.test.ts`）
    - **Property 7：task list --json 输出合法 JSON 数组**
    - 对任意任务文件集合，`--json` 输出为合法 JSON 数组，每个元素包含必需字段
    - `// Feature: notifier-daemon, Property 7: task list --json 输出合法 JSON 数组`
    - _Requirements: 6.3_
  - [ ]* 9.4 为 CLI 错误输出编写 PBT（`vitest/pbt/cli-errors.pbt.test.ts`）
    - **Property 9：错误输出到 stderr 且包含修复建议**
    - **Property 10：--json 模式下错误以 JSON 格式输出**
    - `// Feature: notifier-daemon, Property 9: 错误输出到 stderr 且包含修复建议`
    - `// Feature: notifier-daemon, Property 10: --json 模式下错误以 JSON 格式输出`
    - _Requirements: 16.1, 16.2, 16.3_

- [ ] 10. 实现 `timer` CLI 子命令
  - [ ] 10.1 实现 `src/commands/timer.ts`
    - 实现 `timer add`：验证参数、调用 `parseCron` 验证 CRON 表达式、自动生成 `timer_desc`、写入 `timers/<author>-<task_id>.txt`、自动写入 `created_at`、重复文件报错退出码 1、CRON 非法报错退出码 2
    - 实现 `timer list`：支持 `--json`，输出摘要信息
    - 实现 `timer remove`：文件不存在报错退出码 1
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.1, 9.2, 9.3, 10.1, 10.2, 10.3_
  - [ ]* 10.2 为 `timer` 子命令编写集成测试（`vitest/unit/timer-commands.test.ts`）
    - 测试 timer add 成功（验证 timer_desc 字段）、CRON 非法报错、重复添加报错、timer list、timer remove
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 9.1, 10.1, 10.2_
  - [ ]* 10.3 为 `timer list --json` 编写 PBT（`vitest/pbt/timer-list.pbt.test.ts`）
    - **Property 8：timer list --json 输出合法 JSON 数组**
    - 对任意定时任务文件集合，`--json` 输出为合法 JSON 数组，每个元素包含必需字段
    - `// Feature: notifier-daemon, Property 8: timer list --json 输出合法 JSON 数组`
    - _Requirements: 9.2_

- [ ] 11. 实现帮助与版本输出
  - [ ] 11.1 实现 `src/help.ts` 和 `src/index.ts` 入口
    - 配置 commander：主命令 `--help`（简洁版，50 行以内）、`--help --verbose`（完整版）、`--version`
    - 所有子命令支持 `--help` 和 `--help --verbose`
    - 无参数或参数错误时自动显示帮助，退出码 2
    - 检测 `--daemon` 标志，分发到 `daemon.ts`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 12. Checkpoint — 确保所有 CLI 测试通过
  - 运行 `vitest run`，确保所有 CLI 相关测试通过，如有问题请告知。

- [ ] 13. 实现 PID 文件管理与单实例保证
  - [ ] 13.1 实现 `src/pid-file.ts`
    - 实现 `writePidFile(home: string): Promise<void>`：写入 `$NOTIFIER_HOME/notifier.pid`
    - 实现 `removePidFile(home: string): Promise<void>`：删除 PID 文件（不存在时静默忽略）
    - 实现 `readPidFile(home: string): Promise<number | null>`：读取 PID，文件不存在返回 null
    - 实现 `isProcessAlive(pid: number): boolean`：用 `process.kill(pid, 0)` 检查进程存活
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_
  - [ ]* 13.2 为 `pid-file.ts` 编写单元测试（`vitest/unit/pid-file.test.ts`）
    - 测试写入/读取/删除 PID 文件、stale lock 检测、进程存活检查
    - _Requirements: 17.1, 17.3, 17.4_

- [ ] 14. 实现 `status` CLI 子命令
  - [ ] 14.1 实现 `src/commands/status.ts`
    - 实现 `getDaemonStatus(home: string): Promise<DaemonStatus>`
    - 文本输出：运行中显示 `Daemon is running (PID: <pid>)`，未运行显示 `Daemon is not running`
    - `--json` 输出：`{"running": true, "pid": 12345}` 或 `{"running": false, "pid": null}`
    - 退出码始终为 0
    - _Requirements: 18.1, 18.2, 18.3, 18.4_
  - [ ]* 14.2 为 `status` 子命令编写单元测试（`vitest/unit/status-command.test.ts`）
    - 测试无 PID 文件、stale PID 文件、有效 PID 文件三种场景的文本和 JSON 输出
    - _Requirements: 18.1, 18.2, 18.3, 18.4_
  - [ ]* 14.3 为 `status --json` 编写 PBT（`vitest/pbt/status.pbt.test.ts`）
    - **Property 13：status --json 输出合法 JSON 且字段类型正确**
    - `running=true` 时 `pid` 为正整数，`running=false` 时 `pid` 为 null
    - `// Feature: notifier-daemon, Property 13: status --json 输出合法 JSON 且字段类型正确`
    - _Requirements: 18.4_

- [ ] 15. Checkpoint — 确保所有 CLI 测试通过（含 status）
  - 运行 `vitest run`，确保所有 CLI 相关测试通过，如有问题请告知。

- [ ] 16. 实现 Daemon 主循环
  - [ ] 16.1 实现 `src/daemon.ts` 核心逻辑
    - 实现 `runDaemon()`：单实例检查（读取/写入 PID 文件，stale lock 处理）→ 初始化 Logger → 创建目录 → 扫描 `timers/` 构建 Job Table → 扫描 `tasks/pending/` 处理残留文件
    - 实现主循环：计算最近 CRON 触发时间 → `Promise.race([fileEvent, timeout, shutdown])`
    - 实现即时任务处理：读取文件 → 解析 → 执行 → 移动到 done/error → 记录日志
    - 实现定时任务调度：到期执行 → 更新 nextRun → 记录日志
    - 实现 `timers/` 目录监听：文件增删改时重建 Job Table
    - 实现 `on_miss` 处理：启动时对 `run-once` 任务检查是否有错过的触发，有则立即补跑一次；`skip`（默认）直接跳过
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 14.1, 14.4, 17.1, 17.2, 17.3_
  - [ ] 16.2 实现信号处理（SIGTERM/SIGINT）
    - 设置 `shuttingDown` 标志，等待当前任务完成后优雅退出
    - 退出前删除 PID 文件，记录停止事件到日志
    - _Requirements: 14.2, 14.3, 17.4_
  - [ ]* 16.3 为 Daemon 即时任务处理编写集成测试（`vitest/unit/daemon-tasks.test.ts`）
    - 使用临时目录，测试：残留文件处理、格式错误文件移到 error、合法文件执行后移到 done、非零退出码不崩溃
    - _Requirements: 12.1, 12.3, 12.4, 12.5, 12.6, 12.7_
  - [ ]* 16.4 为 Daemon 单实例保证编写集成测试（`vitest/unit/daemon-single-instance.test.ts`）
    - 测试：已有存活 PID 时拒绝启动（退出码 1）、stale lock 时正常启动并记录 WARN、正常退出后 PID 文件被删除
    - _Requirements: 17.1, 17.2, 17.3, 17.4_
  - [ ]* 16.5 为 Daemon 幂等性编写 PBT（`vitest/pbt/daemon-idempotency.pbt.test.ts`）
    - **Property 11：Daemon 即时任务幂等性**
    - 对任意任务文件集合，处理后每个文件恰好出现在 done 或 error 之一，不再存在于 pending
    - `// Feature: notifier-daemon, Property 11: Daemon 即时任务幂等性`
    - _Requirements: 12.7, 12.8_

- [ ] 17. 实现测试辅助工具
  - [ ] 17.1 实现 `vitest/helpers/tmp-dir.ts`
    - 导出 `createTmpNotifierHome()`：创建临时目录并设置 `NOTIFIER_HOME`，返回清理函数
    - 在 `afterEach` 中自动清理
  - [ ] 17.2 实现 `vitest/helpers/file-gen.ts`
    - 导出生成合法/非法任务文件内容的辅助函数
    - 导出 fast-check 任意值生成器（`taskFileArb`、`timerFileArb`、`validCronArb`）
  - [ ] 17.3 添加 `vitest/fixtures/` 示例文件
    - 添加合法即时任务文件示例
    - 添加合法定时任务文件示例（含 `on_miss=run-once` 示例）
    - 添加各种非法文件示例（缺失字段、格式错误、非法 on_miss 值等）

- [ ] 18. Final Checkpoint — 确保所有测试通过
  - 运行 `vitest run`，确保所有单元测试和 PBT 全部通过，如有问题请告知。

---

## 备注

- 标有 `*` 的 sub-tasks 为可选任务（测试相关），可跳过以加快 MVP 进度
- 每个 task 引用了具体的需求条目，便于追溯
- Checkpoint 任务确保每个阶段完成后验证正确性
- PBT 任务每个 property 对应一个独立的 `it.prop` 测试，最少 100 次迭代
