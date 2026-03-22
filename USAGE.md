# USAGE: notifier

## 安装

```bash
npm run build && npm link
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NOTIFIER_HOME` | 数据目录根路径 | `~/.local/share/notifier` |

## 数据目录结构

```
$NOTIFIER_HOME/
├── tasks/
│   ├── pending/    # 待执行的即时任务
│   ├── done/       # 已执行完成的即时任务
│   └── error/      # 格式错误的即时任务
├── timers/         # 定时任务文件
├── logs/           # Daemon 运行日志
└── notifier.pid    # Daemon PID 文件
```

---

## 即时任务（task）

### task add

添加一个即时任务到 `tasks/pending/`。

```bash
notifier task add --author <name> --task-id <id> --command <cmd> [--description <text>]
```

`--command` 可省略，从 stdin 读取：

```bash
echo "make build" | notifier task add --author me --task-id build-1
```

示例：

```bash
notifier task add \
  --author agent-007 \
  --task-id build-42 \
  --command "cd /opt/app && make build 2>&1 | tee /tmp/build.log" \
  --description "Build the app"
```

生成文件：`tasks/pending/agent-007-build-42.txt`

同名文件已存在时报错退出（退出码 1）。

### task list

```bash
notifier task list [--status pending|done|error] [--json]
```

默认列出 `pending` 状态的任务，输出格式：`author  task_id  command（截断）`。

```bash
notifier task list
notifier task list --status done
notifier task list --status error --json
```

### task remove

```bash
notifier task remove --author <name> --task-id <id> [--status pending|done|error]
```

默认从 `pending` 删除，文件不存在时报错退出（退出码 1）。

---

## 定时任务（timer）

### timer add

添加一个定时任务到 `timers/`，`timer_desc` 由 notifier 自动生成。

```bash
notifier timer add \
  --author <name> \
  --task-id <id> \
  --command <cmd> \
  --timer <cron-expr> \
  [--description <text>]
```

示例：

```bash
# 每天凌晨 2 点清理日志（5 字段，分钟级）
notifier timer add \
  --author ops \
  --task-id cleanup-logs \
  --command "find /var/log/app -name '*.log' -mtime +7 -delete" \
  --timer "0 2 * * *" \
  --description "Clean up logs older than 7 days"

# 每 10 秒执行一次（6 字段，秒级）
notifier timer add \
  --author ops \
  --task-id heartbeat \
  --command "echo tick" \
  --timer "*/10 * * * * *"
```

**CRON 格式：**

支持 5 字段（分钟级）和 6 字段（秒级）两种格式：

| 格式 | 字段顺序 | 示例 | 含义 |
|------|----------|------|------|
| 5 字段 | `分 时 日 月 周` | `0 9 * * 1-5` | 工作日 9:00 |
| 6 字段 | `秒 分 时 日 月 周` | `*/10 * * * * *` | 每 10 秒 |

各字段支持：`*`、`*/n`（步进）、`a-b`（范围）、`a-b/n`（范围步进）、逗号分隔列表。

格式错误时报错退出（退出码 2）。

### timer list

```bash
notifier timer list [--json]
```

输出格式：`author  task_id  cron  timer_desc  command（截断）`

### timer remove

```bash
notifier timer remove --author <name> --task-id <id>
```

---

## Daemon 模式

### start

启动后台守护进程：

```bash
notifier start
```

前台运行（日志同时输出到 stdout 和日志文件，适合调试）：

```bash
notifier start --foreground
```

同一时间只允许一个实例运行。

### stop

停止守护进程：

```bash
notifier stop
```

**即时任务处理流程：**
1. 监听 `tasks/pending/` 目录，检测到新 `.txt` 文件时读取并执行。
2. 格式校验失败 → 移动到 `tasks/error/`。
3. 执行完成（无论退出码）→ 移动到 `tasks/done/`。

**定时任务调度：**
- 启动时扫描 `timers/` 构建 Job Table。
- `timers/` 目录变动时自动重载，无需重启。
- 支持 `on_miss=run-once`：daemon 重启后补跑错过的触发。

**信号处理：**
- `SIGTERM` / `SIGINT`：等待当前任务完成后优雅退出。

**日志：** 写入 `$NOTIFIER_HOME/logs/notifier.log`，超过 10000 行时自动轮换为 `notifier-<YYYYMMDD-HHmmss>.log`。

## 查看 Daemon 状态

```bash
notifier status [--json]
```

---

## 任务文件格式

所有任务文件使用 `KEY=VALUE` 格式（env 格式），每文件一个任务。

即时任务示例（`tasks/pending/agent-007-build-42.txt`）：

```
author=agent-007
task_id=build-42
command=cd /opt/app && make build 2>&1 | tee /tmp/build.log
description=Build the app and capture output
created_at=2026-03-18T10:30:00Z
```

定时任务示例（`timers/ops-cleanup-logs.txt`）：

```
author=ops
task_id=cleanup-logs
command=find /var/log/app -name '*.log' -mtime +7 -delete
timer=0 2 * * *
timer_desc=Runs at 00:02, every day
description=Clean up application logs older than 7 days
created_at=2026-03-18T10:30:00Z
```

秒级定时任务示例（`timers/ops-heartbeat.txt`）：

```
author=ops
task_id=heartbeat
command=echo tick
timer=*/10 * * * * *
timer_desc=Runs at every 10 seconds, every day
created_at=2026-03-18T10:30:00Z
```

---

## 退出码

| 退出码 | 含义 |
|--------|------|
| `0` | 成功 |
| `1` | 一般错误（文件不存在、重复添加等） |
| `2` | 参数/用法错误（参数缺失、CRON 格式错误） |

## JSON 模式错误格式

`--json` 模式下错误以 JSON 输出到 stderr：

```json
{"error": "task file already exists at ...", "suggestion": "Use a different --task-id or remove the existing task first."}
```

---

## 帮助

```bash
notifier --help
notifier --help --verbose    # 显示数据目录路径和退出码说明
notifier task --help
notifier timer --help
notifier --version
```
