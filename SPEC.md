# SPEC: notifier

notifier 是一个 Linux 命令，既可作为普通 CLI 命令执行（执行完即退出），也可以 `--daemon` 模式作为常驻守护进程运行。

## 1. 定位 (Role)

- 作为 CLI：通过子命令管理即时任务和定时任务（添加/查看/删除）。
- 作为 Daemon：监听文件变动和时间信号，执行预设的 Shell 命令。

## 2. 技术栈与项目结构

遵循 pai repo 的目录结构约定：

```
notifier/
├── src/
│   ├── index.ts              # 入口，CLI 解析与 --daemon 分发
│   ├── commands/             # 子命令实现
│   │   ├── task.ts           # task add / task list / task remove
│   │   └── timer.ts          # timer add / timer list / timer remove
│   ├── daemon.ts             # daemon 主循环
│   ├── task-file.ts          # 即时任务文件的读写与校验
│   ├── timer-file.ts         # 定时任务文件的读写与校验
│   ├── cron-parser.ts        # CRON 表达式解析与 timer_desc 生成
│   ├── executor.ts           # Shell 命令执行器
│   ├── help.ts               # --help / --help --verbose 输出
│   └── types.ts              # 共享类型定义
├── vitest/
│   ├── unit/                 # 单元测试（flat，无子目录）
│   ├── pbt/                  # Property-based 测试（flat）
│   ├── fixtures/             # 测试 fixtures
│   └── helpers/              # 测试辅助
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── SPEC.md
├── USAGE.md
└── README.md
```

- TypeScript + ESM
- 构建：tsup（target node20，ESM，shebang banner）
- 测试：vitest（遵循 testing-conventions.md）
- CLI 解析：commander

## 3. 数据目录规范

基础路径：`~/.local/share/notifier/`（可通过 `NOTIFIER_HOME` 环境变量覆盖）。

```
~/.local/share/notifier/
├── tasks/
│   ├── pending/    # 待执行的即时任务文件
│   ├── done/       # 已成功执行的即时任务文件
│   └── error/      # 格式错误的即时任务文件
├── timers/         # 定时任务文件
└── logs/           # Daemon 运行日志
```

## 4. 任务文件格式

所有任务文件使用 env 格式（`KEY=VALUE`，每行一个），后缀统一为 `.txt`。
每个文件只包含一个任务。

### 4.1 即时任务文件（tasks/pending/*.txt）

必需字段：

| 字段 | 说明 |
|------|------|
| `author` | 添加者标识，用于区分不同的添加者 |
| `task_id` | 任务 ID，由添加者提供，notifier 不解释其含义 |
| `command` | 要执行的 Shell 命令（单行，可包含 pipe/composition 等） |

自动生成字段：

| 字段 | 说明 |
|------|------|
| `created_at` | 任务添加时间，ISO 8601 格式（由 `task add` 自动写入） |

可选字段：

| 字段 | 说明 |
|------|------|
| `description` | 人类可读的任务说明，由调用者提供 |

示例：
```
author=agent-007
task_id=build-42
command=cd /opt/app && make build 2>&1 | tee /tmp/build.log
description=Build the app and capture output
created_at=2026-03-18T10:30:00Z
```

文件名约定：`<author>-<task_id>.txt`（由 `task add` 子命令自动生成）。

### 4.2 定时任务文件（timers/*.txt）

必需字段：

| 字段 | 说明 |
|------|------|
| `author` | 添加者标识 |
| `task_id` | 任务 ID，由添加者提供 |
| `command` | 要执行的 Shell 命令（单行） |
| `timer` | CRON 表达式（标准 5 字段格式：分 时 日 月 周） |

自动生成字段：

| 字段 | 说明 |
|------|------|
| `timer_desc` | CRON 的英文可读描述（由 notifier 自动生成，添加者无需提供） |
| `created_at` | 任务添加时间，ISO 8601 格式（由 `timer add` 自动写入） |

可选字段：

| 字段 | 说明 |
|------|------|
| `description` | 人类可读的任务说明，由调用者提供 |

示例：
```
author=ops
task_id=cleanup-logs
command=find /var/log/app -name '*.log' -mtime +7 -delete
timer=0 2 * * *
timer_desc=Every day at 2:00 AM
description=Clean up application logs older than 7 days
created_at=2026-03-18T10:30:00Z
```

文件名约定：`<author>-<task_id>.txt`。

## 5. CLI 子命令

notifier 遵循 ProgressiveDiscovery.md 的渐进披露规范。所有命令和子命令支持 `--help`、`--help --verbose`、`--version`。无参数或参数错误时自动显示 help（退出码 2）。

### 5.1 `notifier task`

管理即时任务。

#### `notifier task add`

添加一个即时任务文件到 `tasks/pending/`。

参数：
- `--author <name>`（必需）
- `--task-id <id>`（必需）
- `--command <cmd>`（必需）
- `--description <text>`（可选，人类可读的任务说明）

行为：
- 自动写入 `created_at` 字段（当前时间，ISO 8601）。
- 生成文件 `tasks/pending/<author>-<task_id>.txt`。
- 如果同名文件已存在，报错退出（退出码 1）。

支持 stdin：如果未提供 `--command`，从 stdin 读取命令（单行）。

#### `notifier task list`

列出即时任务。

参数：
- `--status <pending|done|error>`（可选，默认 `pending`）
- `--json`（可选，输出 JSON 数组）

行为：
- 列出指定状态子目录下的所有任务文件，输出摘要信息（author、task_id、command 截断显示）。

#### `notifier task remove`

删除一个即时任务文件。

参数：
- `--author <name>`（必需）
- `--task-id <id>`（必需）
- `--status <pending|done|error>`（可选，默认 `pending`）

行为：
- 删除对应文件。文件不存在时报错退出（退出码 1）。

### 5.2 `notifier timer`

管理定时任务。

#### `notifier timer add`

添加一个定时任务文件到 `timers/`。

参数：
- `--author <name>`（必需）
- `--task-id <id>`（必需）
- `--command <cmd>`（必需）
- `--timer <cron-expr>`（必需，标准 5 字段 CRON）
- `--description <text>`（可选，人类可读的任务说明）

行为：
- 自动生成 `timer_desc` 字段（CRON 的英文可读描述）。
- 自动写入 `created_at` 字段（当前时间，ISO 8601）。
- 生成文件 `timers/<author>-<task_id>.txt`。
- 如果同名文件已存在，报错退出（退出码 1）。
- CRON 表达式校验失败时报错退出（退出码 2）。

#### `notifier timer list`

列出所有定时任务。

参数：
- `--json`（可选，输出 JSON 数组）

行为：
- 列出 `timers/` 下所有任务文件，输出摘要信息（author、task_id、timer、timer_desc、command 截断显示）。

#### `notifier timer remove`

删除一个定时任务文件。

参数：
- `--author <name>`（必需）
- `--task-id <id>`（必需）

行为：
- 删除对应文件。文件不存在时报错退出（退出码 1）。

### 5.3 `notifier --daemon`

以守护进程模式启动。详见第 6 节。

### 5.4 `notifier --help`

显示主命令帮助，列出所有子命令及简要说明。遵循渐进披露规范（约 50 行以内），末尾提示 `--help --verbose` 可获取完整信息。

### 5.5 `notifier --version`

输出版本号。

## 6. Daemon 模式

通过 `notifier --daemon` 启动。

### 6.1 即时任务监听

- 监听目录：`$NOTIFIER_HOME/tasks/pending/`
- 监听方式：使用 `fs.watch`（Node.js 内置，跨平台）或 `inotify`（Linux）监听文件创建/移入事件。
- 触发动作：
  1. 读取新文件内容，解析 env 格式。
  2. 格式校验失败：向 stderr 打一行警告日志，立即将文件移动到 `tasks/error/`。
  3. 格式校验成功：执行 `command` 字段中的 Shell 命令。
  4. 执行完成后（无论命令退出码），将文件移动到 `tasks/done/`。
  5. 如果命令返回非零退出码，记录错误日志到 stderr，但 daemon 不崩溃。

### 6.2 定时任务调度

- 配置目录：`$NOTIFIER_HOME/timers/`
- 启动时扫描 `timers/` 目录，解析所有定时任务文件，构建内存中的 Job Table。
- 动态重载：监控 `timers/` 目录变动，文件增删改时重新解析并更新 Job Table，无需重启。
- 定时任务文件格式校验失败时：不移动源文件，仅向 stderr 打错误日志。
- 到达 CRON 触发时间时执行对应命令，并计算下一次执行时间。

### 6.3 主循环逻辑

使用非阻塞 IO 驱动：

1. **Initialize**：扫描 `timers/` 构建 Job Table；扫描 `tasks/pending/` 处理残留文件。
2. **Calculate Sleep**：找到最近的 CRON 触发时间，计算等待时长 T。
3. **Poll**：等待以下事件之一：
   - `tasks/pending/` 有文件变动。
   - 达到超时时间 T（CRON 到期）。
   - 收到终止信号（SIGTERM / SIGINT）。
4. **Execute**：根据事件类型执行对应任务。
5. **Repeat**：回到步骤 2。

### 6.4 并发与健壮性

- 串行处理 `tasks/pending/` 中的任务文件，保证调度顺序。
- 命令执行的并行性由被调用命令自行决定。
- 收到 SIGTERM/SIGINT 时优雅退出（等待当前任务完成）。

## 7. 错误处理与退出码

遵循 ProgressiveDiscovery.md 的退出码约定：

| 退出码 | 含义 |
|--------|------|
| `0` | 成功 |
| `1` | 一般错误（文件不存在、重复添加等） |
| `2` | 参数/用法错误（参数缺失、CRON 格式错误、自动 --help 触发） |

错误信息输出到 stderr，包含两部分：
1. 什么错了 — 明确描述问题
2. 怎么修 — 给出可操作的修复建议

示例：`Error: task file already exists at ~/.local/share/notifier/tasks/pending/agent-build-42.txt. Use a different --task-id or remove the existing task first.`

`--json` 模式下错误也以 JSON 格式输出：`{"error": "...", "suggestion": "..."}`

## 8. 机器可读输出

- 默认面向人类输出。
- `--json` 参数启用结构化 JSON 输出（`task list`、`timer list` 等）。
- USAGE 中说明 `--json` 支持情况。

## 9. 日志

### CLI 模式
错误和警告输出到 stderr。CLI 进程不写 daemon 的日志文件（不同进程）。

### Daemon 模式
日志自动写入 `$NOTIFIER_HOME/logs/` 目录。

日志文件名：`notifier.log`（当前活跃日志）。

日志轮换：
- 触发条件：daemon 每次重启时，或当前日志文件超过 10000 行时。
- 轮换方式：将当前 `notifier.log` 重命名为 `notifier-<timestamp>.log`（timestamp 格式：`YYYYMMDD-HHmmss`），然后创建新的 `notifier.log`。
- 示例：`notifier-20260318-103000.log`

日志内容（覆盖调度各环节，便于追查调度历史和故障排查）：
- daemon 启动/停止事件
- `tasks/pending/` 文件变动检测
- 即时任务文件解析结果（成功/失败及原因）
- 即时任务命令执行开始、结束、退出码、耗时
- 即时任务文件移动（→ done 或 → error）
- `timers/` 目录变动检测与 Job Table 重建
- 定时任务文件解析结果（成功/失败及原因）
- 定时任务 CRON 触发、命令执行开始、结束、退出码、耗时
- 下一次 CRON 触发时间计算结果
- 信号处理（SIGTERM/SIGINT 收到、优雅退出过程）

日志行格式（人类可读）：
```
[2026-03-18T10:30:00.123Z] [INFO] daemon started, NOTIFIER_HOME=~/.local/share/notifier
[2026-03-18T10:30:01.456Z] [INFO] task detected: agent-007-build-42.txt
[2026-03-18T10:30:01.500Z] [INFO] task executing: author=agent-007 task_id=build-42 command="cd /opt/app && make build"
[2026-03-18T10:30:05.789Z] [INFO] task completed: author=agent-007 task_id=build-42 exit_code=0 duration=4289ms → done
[2026-03-18T10:30:06.000Z] [WARN] task parse failed: bad-file.txt reason="missing required field: command" → error
[2026-03-18T10:31:00.000Z] [INFO] cron triggered: author=ops task_id=cleanup-logs timer="0 2 * * *"
```

## 10. 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NOTIFIER_HOME` | 数据目录根路径 | `~/.local/share/notifier` |

## 11. 幂等性与安全

- `task add` / `timer add`：不覆盖已存在的同名文件（非幂等，重复添加报错）。
- `task remove` / `timer remove`：删除不存在的文件报错（幂等性不适用）。
- Daemon 对 `tasks/pending/` 的处理是幂等的：同一文件只会被处理一次（处理后移走）。
