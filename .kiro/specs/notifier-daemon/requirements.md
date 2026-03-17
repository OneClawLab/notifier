# 需求文档：notifier-daemon

## 简介

notifier 是一个 Linux 命令行工具，既可作为普通 CLI 命令执行（执行完即退出），也可以 `--daemon` 模式作为常驻守护进程运行。CLI 模式下通过子命令管理即时任务（task）和定时任务（timer）；Daemon 模式下监听文件变动和时间信号，自动执行预设的 Shell 命令。

## 术语表

- **Task（即时任务）**：一次性 Shell 命令，写入文件后由 Daemon 立即执行。
- **Timer（定时任务）**：按 CRON 表达式周期性执行的 Shell 命令。
- **NOTIFIER_HOME**：数据目录根路径，默认为 `~/.local/share/notifier/`，可通过环境变量覆盖。
- **env 格式**：`KEY=VALUE` 每行一个的纯文本格式，文件后缀为 `.txt`。
- **Job Table**：Daemon 内存中维护的定时任务调度表。
- **CRON 表达式**：标准 5 字段格式（分 时 日 月 周）的定时规则。
- **timer_desc**：由 notifier 自动生成的 CRON 英文可读描述。
- **Daemon**：以 `notifier --daemon` 启动的常驻后台进程。
- **CLI**：以普通子命令方式运行的 notifier 进程。
- **Parser**：负责解析 env 格式任务文件的模块。
- **Executor**：负责执行 Shell 命令的模块。
- **Scheduler**：负责 CRON 定时调度的模块。
- **PID 文件**：`$NOTIFIER_HOME/notifier.pid`，记录当前运行中的 Daemon 进程 ID，用于单实例保证。

---

## 需求列表

### 需求 1：数据目录管理

**用户故事：** 作为用户，我希望 notifier 在统一的数据目录下管理所有任务文件和日志，以便于查找和维护。

#### 验收标准

1. THE System SHALL 使用 `~/.local/share/notifier/` 作为默认数据目录根路径（NOTIFIER_HOME）。
2. WHERE 环境变量 `NOTIFIER_HOME` 已设置，THE System SHALL 使用该变量指定的路径替代默认路径。
3. THE System SHALL 在 NOTIFIER_HOME 下维护以下目录结构：`tasks/pending/`、`tasks/done/`、`tasks/error/`、`timers/`、`logs/`。
4. WHEN 所需目录不存在时，THE System SHALL 自动创建所需目录。

---

### 需求 2：即时任务文件格式

**用户故事：** 作为调用者，我希望用标准化的 env 格式文件描述即时任务，以便 notifier 能正确解析和执行。

#### 验收标准

1. THE Parser SHALL 解析 env 格式（`KEY=VALUE` 每行一个）的 `.txt` 文件为结构化任务对象。
2. THE Parser SHALL 要求即时任务文件包含 `author`、`task_id`、`command`、`created_at` 四个必需字段。
3. IF 即时任务文件缺少任意必需字段，THEN THE Parser SHALL 返回包含缺失字段名称的描述性错误。
4. THE Parser SHALL 支持 `description` 作为可选字段。
5. THE Parser SHALL 将解析后的任务对象序列化回合法的 env 格式字符串（pretty-printer）。
6. FOR ALL 合法的即时任务对象，THE Parser SHALL 满足解析后序列化再解析得到等价对象（round-trip 属性）。

---

### 需求 3：定时任务文件格式

**用户故事：** 作为调用者，我希望用标准化的 env 格式文件描述定时任务，以便 notifier 能正确解析和调度。

#### 验收标准

1. THE Parser SHALL 解析 env 格式的 `.txt` 文件为结构化定时任务对象。
2. THE Parser SHALL 要求定时任务文件包含 `author`、`task_id`、`command`、`timer`、`timer_desc`、`created_at` 六个必需字段。
3. IF 定时任务文件缺少任意必需字段，THEN THE Parser SHALL 返回包含缺失字段名称的描述性错误。
4. THE Parser SHALL 支持 `description` 作为可选字段。
5. THE Parser SHALL 支持 `on_miss` 作为可选字段，合法值为 `skip`（默认）或 `run-once`。
6. IF `on_miss` 字段存在但值不合法，THEN THE Parser SHALL 返回包含字段名和合法值列表的描述性错误。
7. THE Parser SHALL 将解析后的定时任务对象序列化回合法的 env 格式字符串（pretty-printer）。
8. FOR ALL 合法的定时任务对象，THE Parser SHALL 满足解析后序列化再解析得到等价对象（round-trip 属性）。

---

### 需求 4：CRON 表达式解析

**用户故事：** 作为用户，我希望 notifier 能解析标准 CRON 表达式并生成可读描述，以便我确认定时规则是否正确。

#### 验收标准

1. THE CronParser SHALL 解析标准 5 字段 CRON 表达式（分 时 日 月 周）。
2. IF CRON 表达式字段数量不等于 5，THEN THE CronParser SHALL 返回格式错误。
3. IF CRON 表达式包含非法字段值，THEN THE CronParser SHALL 返回包含具体字段名称的描述性错误。
4. WHEN CRON 表达式合法时，THE CronParser SHALL 生成对应的英文可读描述（timer_desc）。
5. WHEN 给定当前时间，THE CronParser SHALL 计算下一次 CRON 触发时间。
6. FOR ALL 合法的 CRON 表达式，THE CronParser SHALL 计算的下一次触发时间不早于当前时间。

---

### 需求 5：`task add` 子命令

**用户故事：** 作为调用者，我希望通过 `notifier task add` 命令添加即时任务，以便 Daemon 能自动执行。

#### 验收标准

1. WHEN 执行 `notifier task add --author <name> --task-id <id> --command <cmd>` 时，THE CLI SHALL 在 `tasks/pending/` 目录下创建名为 `<author>-<task_id>.txt` 的任务文件。
2. THE CLI SHALL 自动写入 `created_at` 字段（当前时间，ISO 8601 格式）。
3. IF 未提供 `--command` 参数，THEN THE CLI SHALL 从 stdin 读取单行命令作为 command 字段值。
4. IF 目标文件已存在，THEN THE CLI SHALL 输出包含文件路径和修复建议的错误信息到 stderr，并以退出码 1 退出。
5. IF 缺少必需参数（`--author` 或 `--task-id`），THEN THE CLI SHALL 显示用法帮助并以退出码 2 退出。
6. WHEN 任务文件创建成功时，THE CLI SHALL 以退出码 0 退出。

---

### 需求 6：`task list` 子命令

**用户故事：** 作为用户，我希望通过 `notifier task list` 查看任务列表，以便了解任务状态。

#### 验收标准

1. WHEN 执行 `notifier task list` 时，THE CLI SHALL 列出 `tasks/pending/` 目录下所有任务的摘要信息（author、task_id、command 截断显示）。
2. WHERE `--status <pending|done|error>` 参数已提供，THE CLI SHALL 列出对应子目录下的任务。
3. WHERE `--json` 参数已提供，THE CLI SHALL 输出 JSON 数组格式的任务列表。
4. WHEN 指定目录为空时，THE CLI SHALL 输出空列表（JSON 模式为 `[]`，文本模式为提示信息）并以退出码 0 退出。

---

### 需求 7：`task remove` 子命令

**用户故事：** 作为用户，我希望通过 `notifier task remove` 删除任务文件，以便清理不需要的任务。

#### 验收标准

1. WHEN 执行 `notifier task remove --author <name> --task-id <id>` 时，THE CLI SHALL 删除 `tasks/pending/<author>-<task_id>.txt` 文件。
2. WHERE `--status <pending|done|error>` 参数已提供，THE CLI SHALL 从对应子目录删除文件。
3. IF 目标文件不存在，THEN THE CLI SHALL 输出包含文件路径和修复建议的错误信息到 stderr，并以退出码 1 退出。
4. IF 缺少必需参数（`--author` 或 `--task-id`），THEN THE CLI SHALL 显示用法帮助并以退出码 2 退出。

---

### 需求 8：`timer add` 子命令

**用户故事：** 作为调用者，我希望通过 `notifier timer add` 命令添加定时任务，以便 Daemon 能按计划执行。

#### 验收标准

1. WHEN 执行 `notifier timer add --author <name> --task-id <id> --command <cmd> --timer <cron>` 时，THE CLI SHALL 在 `timers/` 目录下创建名为 `<author>-<task_id>.txt` 的定时任务文件。
2. THE CLI SHALL 自动生成 `timer_desc` 字段（CRON 的英文可读描述）。
3. THE CLI SHALL 自动写入 `created_at` 字段（当前时间，ISO 8601 格式）。
4. IF CRON 表达式格式非法，THEN THE CLI SHALL 输出包含具体错误原因的信息到 stderr，并以退出码 2 退出。
5. IF 目标文件已存在，THEN THE CLI SHALL 输出包含文件路径和修复建议的错误信息到 stderr，并以退出码 1 退出。
6. IF 缺少必需参数，THEN THE CLI SHALL 显示用法帮助并以退出码 2 退出。
7. WHEN 定时任务文件创建成功时，THE CLI SHALL 以退出码 0 退出。

---

### 需求 9：`timer list` 子命令

**用户故事：** 作为用户，我希望通过 `notifier timer list` 查看所有定时任务，以便了解调度计划。

#### 验收标准

1. WHEN 执行 `notifier timer list` 时，THE CLI SHALL 列出 `timers/` 目录下所有定时任务的摘要信息（author、task_id、timer、timer_desc、command 截断显示）。
2. WHERE `--json` 参数已提供，THE CLI SHALL 输出 JSON 数组格式的定时任务列表。
3. WHEN `timers/` 目录为空时，THE CLI SHALL 输出空列表并以退出码 0 退出。

---

### 需求 10：`timer remove` 子命令

**用户故事：** 作为用户，我希望通过 `notifier timer remove` 删除定时任务文件，以便取消不需要的定时计划。

#### 验收标准

1. WHEN 执行 `notifier timer remove --author <name> --task-id <id>` 时，THE CLI SHALL 删除 `timers/<author>-<task_id>.txt` 文件。
2. IF 目标文件不存在，THEN THE CLI SHALL 输出包含文件路径和修复建议的错误信息到 stderr，并以退出码 1 退出。
3. IF 缺少必需参数，THEN THE CLI SHALL 显示用法帮助并以退出码 2 退出。

---

### 需求 11：帮助与版本输出

**用户故事：** 作为用户，我希望通过 `--help` 和 `--version` 获取使用说明，以便快速了解命令用法。

#### 验收标准

1. WHEN 执行 `notifier --help` 时，THE CLI SHALL 输出主命令帮助信息（列出所有子命令及简要说明，50 行以内）并以退出码 0 退出。
2. WHEN 执行 `notifier --help --verbose` 时，THE CLI SHALL 输出完整的详细帮助信息并以退出码 0 退出。
3. WHEN 执行 `notifier --version` 时，THE CLI SHALL 输出版本号并以退出码 0 退出。
4. WHEN 执行任意子命令时不带参数或参数错误，THE CLI SHALL 自动显示该子命令的帮助信息并以退出码 2 退出。
5. THE CLI SHALL 对所有子命令支持 `--help` 和 `--help --verbose` 参数。

---

### 需求 12：Daemon 即时任务监听与执行

**用户故事：** 作为用户，我希望 Daemon 能自动检测并执行 `tasks/pending/` 中的任务文件，以便实现异步任务调度。

#### 验收标准

1. WHEN Daemon 启动时，THE Daemon SHALL 扫描 `tasks/pending/` 目录并处理所有残留任务文件。
2. WHEN `tasks/pending/` 目录中出现新文件时，THE Daemon SHALL 检测到该文件变动事件。
3. WHEN 检测到新任务文件时，THE Daemon SHALL 读取并解析该文件内容。
4. IF 任务文件格式校验失败，THEN THE Daemon SHALL 向 stderr 输出警告日志，并将文件移动到 `tasks/error/`。
5. WHEN 任务文件格式校验成功时，THE Daemon SHALL 执行 `command` 字段中的 Shell 命令。
6. WHEN 命令执行完成后（无论退出码），THE Daemon SHALL 将任务文件移动到 `tasks/done/`。
7. IF 命令返回非零退出码，THEN THE Daemon SHALL 记录错误日志到 stderr，但 Daemon 进程不退出。
8. THE Daemon SHALL 串行处理 `tasks/pending/` 中的任务文件，保证同一文件只被处理一次。

---

### 需求 13：Daemon 定时任务调度

**用户故事：** 作为用户，我希望 Daemon 能按 CRON 表达式自动执行定时任务，以便实现周期性自动化操作。

#### 验收标准

1. WHEN Daemon 启动时，THE Scheduler SHALL 扫描 `timers/` 目录，解析所有定时任务文件，构建内存中的 Job Table。
2. WHEN `timers/` 目录中的文件发生增删改时，THE Scheduler SHALL 重新解析并更新 Job Table，无需重启 Daemon。
3. IF 定时任务文件格式校验失败，THEN THE Scheduler SHALL 向 stderr 输出错误日志，不移动源文件，不影响其他定时任务。
4. WHEN CRON 触发时间到达时，THE Scheduler SHALL 执行对应定时任务的 Shell 命令。
5. WHEN 定时任务命令执行完成后，THE Scheduler SHALL 计算并记录下一次触发时间。
6. IF 定时任务命令返回非零退出码，THEN THE Scheduler SHALL 记录错误日志，但 Daemon 进程不退出。
7. WHEN Daemon 启动时，对于 `on_miss=run-once` 的定时任务，IF 上次执行时间（基于 Job Table 初始化时间）早于最近一次应触发时间，THEN THE Scheduler SHALL 立即补跑一次该任务。
8. WHEN Daemon 启动时，对于 `on_miss=skip`（默认）的定时任务，THE Scheduler SHALL 忽略所有错过的触发，直接等待下一次正常触发时间。

---

### 需求 14：Daemon 主循环与信号处理

**用户故事：** 作为系统管理员，我希望 Daemon 能稳定运行并响应系统信号，以便安全地启停服务。

#### 验收标准

1. THE Daemon SHALL 使用非阻塞 IO 驱动主循环，同时监听文件变动事件和 CRON 超时事件。
2. WHEN 收到 SIGTERM 或 SIGINT 信号时，THE Daemon SHALL 等待当前正在执行的任务完成后优雅退出。
3. WHEN 优雅退出时，THE Daemon SHALL 记录停止事件到日志。
4. THE Daemon SHALL 在主循环中计算最近的 CRON 触发时间作为等待超时时长。

---

### 需求 17：Daemon 单实例保证

**用户故事：** 作为系统管理员，我希望同一时间只能运行一个 Daemon 实例，以避免任务被重复执行或文件被并发修改。

#### 验收标准

1. WHEN Daemon 启动时，THE Daemon SHALL 在 `$NOTIFIER_HOME/notifier.pid` 写入当前进程的 PID。
2. WHEN Daemon 启动时，IF `notifier.pid` 文件已存在且其中记录的进程仍在运行，THEN THE Daemon SHALL 输出包含已运行 PID 的错误信息到 stderr，并以退出码 1 退出（拒绝启动）。
3. WHEN Daemon 启动时，IF `notifier.pid` 文件已存在但其中记录的进程已不存在（stale lock），THEN THE Daemon SHALL 覆盖写入新的 PID 并正常启动，同时记录一条 WARN 日志说明检测到 stale lock。
4. WHEN Daemon 正常退出或收到 SIGTERM/SIGINT 时，THE Daemon SHALL 删除 `notifier.pid` 文件。
5. CLI 子命令（task/timer/status）SHALL NOT 写入或删除 `notifier.pid` 文件，不受单实例限制。

---

### 需求 18：`notifier status` 子命令

**用户故事：** 作为用户，我希望通过 `notifier status` 快速查看 Daemon 是否正在运行，以便了解系统状态。

#### 验收标准

1. WHEN 执行 `notifier status` 时，THE CLI SHALL 读取 `$NOTIFIER_HOME/notifier.pid` 文件。
2. IF `notifier.pid` 不存在或其中记录的进程已不存在，THEN THE CLI SHALL 输出 Daemon 未运行的状态信息，并以退出码 0 退出。
3. IF `notifier.pid` 存在且其中记录的进程仍在运行，THEN THE CLI SHALL 输出 Daemon 正在运行的状态信息（包含 PID），并以退出码 0 退出。
4. WHERE `--json` 参数已提供，THE CLI SHALL 以 JSON 格式输出状态信息，包含 `running`（boolean）和 `pid`（number | null）字段。

---

### 需求 15：Daemon 日志

**用户故事：** 作为运维人员，我希望 Daemon 将运行日志写入文件，以便追查调度历史和故障排查。

#### 验收标准

1. THE Daemon SHALL 将日志写入 `$NOTIFIER_HOME/logs/notifier.log` 文件。
2. THE Daemon SHALL 使用 `[<ISO8601>] [<LEVEL>] <message>` 格式记录每条日志。
3. THE Daemon SHALL 记录以下事件：daemon 启动/停止、文件变动检测、任务文件解析结果、命令执行开始/结束/退出码/耗时、文件移动操作、Job Table 重建、CRON 触发、信号处理。
4. WHEN Daemon 启动时，THE Daemon SHALL 检查当前日志文件行数，若超过 10000 行则触发日志轮换。
5. WHEN 日志轮换触发时，THE Daemon SHALL 将 `notifier.log` 重命名为 `notifier-<YYYYMMDD-HHmmss>.log`，并创建新的 `notifier.log`。

---

### 需求 16：错误输出格式

**用户故事：** 作为用户，我希望错误信息清晰且包含修复建议，以便快速定位和解决问题。

#### 验收标准

1. THE CLI SHALL 将所有错误信息输出到 stderr。
2. THE CLI SHALL 在错误信息中包含两部分：问题描述和可操作的修复建议。
3. WHERE `--json` 参数已提供，THE CLI SHALL 以 `{"error": "...", "suggestion": "..."}` 格式输出错误信息。
4. THE CLI SHALL 遵循退出码约定：0 表示成功，1 表示一般错误，2 表示参数/用法错误。
