# notifier

A Linux CLI tool and daemon for scheduling and executing shell commands via file-based task queues and CRON timers.

## How it works

- Drop a task file into `tasks/pending/` → daemon picks it up, runs the command, moves it to `tasks/done/`.
- Add a timer file with a CRON expression → daemon fires the command on schedule.
- Both instant tasks and timers are plain `KEY=VALUE` text files, making them easy to create programmatically.

## Install

### From npm

```bash
npm install -g @theclawlab/notifier
```

### From source

```bash
npm run build && npm link
```

## Quick start

```bash
# Start the daemon
notifier --daemon

# Add an instant task
notifier task add --author me --task-id hello --command "echo hello world"

# Add a daily timer (runs at 9 AM every weekday)
notifier timer add --author me --task-id morning --timer "0 9 * * 1-5" --command "echo good morning"

# Check daemon status
notifier status

# List pending tasks
notifier task list

# List timers
notifier timer list
```

## Data directory

Default: `~/.local/share/notifier/` — override with `NOTIFIER_HOME`.

```
$NOTIFIER_HOME/
├── tasks/pending/   # queued instant tasks
├── tasks/done/      # completed tasks
├── tasks/error/     # malformed task files
├── timers/          # CRON timer definitions
├── logs/            # daemon logs (auto-rotated at 10k lines)
└── notifier.pid     # daemon lock file
```

## Documentation

- [USAGE.md](./USAGE.md) — full CLI reference and file format details
