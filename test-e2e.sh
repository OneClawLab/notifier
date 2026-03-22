#!/usr/bin/env bash
#
# notifier CLI End-to-End Test Script — core functionality
#
# Prerequisites:
#   - notifier installed: npm run build && npm link
#   - No other notifier daemon running (the test starts/stops its own)
#
# Usage: bash test-e2e.sh
#
set -uo pipefail

source "$(dirname "$0")/scripts/e2e-lib.sh"

NOTIFIER="notifier"

on_cleanup() {
  $NOTIFIER stop >/dev/null 2>&1 || true
}

setup_e2e

export NOTIFIER_HOME="$TD/notifier-home"

# ── Pre-flight ────────────────────────────────────────────────
section "Pre-flight"

require_bin $NOTIFIER "run npm run build"
pass "NOTIFIER_HOME=$NOTIFIER_HOME"

# ══════════════════════════════════════════════════════════════
# 1. task add
# ══════════════════════════════════════════════════════════════
section "1. task add"
run_cmd $NOTIFIER task add --author e2e --task-id task-1 --command "echo TASK_OK"
assert_exit0
assert_file_exists "$NOTIFIER_HOME/tasks/pending/e2e-task-1.txt" "task file"

# ══════════════════════════════════════════════════════════════
# 2. task list
# ══════════════════════════════════════════════════════════════
section "2. task list"
run_cmd $NOTIFIER task list
assert_exit0
assert_contains "task-1"

# ══════════════════════════════════════════════════════════════
# 3. task list --json
# ══════════════════════════════════════════════════════════════
section "3. task list --json"
run_cmd $NOTIFIER task list --json
assert_exit0
assert_json_array

# ══════════════════════════════════════════════════════════════
# 4. task add — duplicate exits 1
# ══════════════════════════════════════════════════════════════
section "4. task add — duplicate"
run_cmd $NOTIFIER task add --author e2e --task-id task-1 --command "echo DUP"
assert_exit 1

# ══════════════════════════════════════════════════════════════
# 5. task remove
# ══════════════════════════════════════════════════════════════
section "5. task remove"
run_cmd $NOTIFIER task remove --author e2e --task-id task-1
assert_exit0
assert_file_missing "$NOTIFIER_HOME/tasks/pending/e2e-task-1.txt" "task file"

# ══════════════════════════════════════════════════════════════
# 6. timer add
# ══════════════════════════════════════════════════════════════
section "6. timer add"
run_cmd $NOTIFIER timer add --author e2e --task-id timer-1 \
  --command "echo TIMER_OK" --timer "0 * * * *"
assert_exit0
assert_file_exists "$NOTIFIER_HOME/timers/e2e-timer-1.txt" "timer file"

# ══════════════════════════════════════════════════════════════
# 7. timer list
# ══════════════════════════════════════════════════════════════
section "7. timer list"
run_cmd $NOTIFIER timer list
assert_exit0
assert_contains "timer-1"

# ══════════════════════════════════════════════════════════════
# 8. timer add — invalid cron exits 2
# ══════════════════════════════════════════════════════════════
section "8. timer add — invalid cron"
run_cmd $NOTIFIER timer add --author e2e --task-id bad-timer \
  --command "echo X" --timer "not-a-cron"
assert_exit 2

# ══════════════════════════════════════════════════════════════
# 9. timer remove
# ══════════════════════════════════════════════════════════════
section "9. timer remove"
run_cmd $NOTIFIER timer remove --author e2e --task-id timer-1
assert_exit0
assert_file_missing "$NOTIFIER_HOME/timers/e2e-timer-1.txt" "timer file"

# ══════════════════════════════════════════════════════════════
# 10. daemon start
# ══════════════════════════════════════════════════════════════
section "10. daemon start"
run_cmd $NOTIFIER start
assert_exit0
sleep 1

# ══════════════════════════════════════════════════════════════
# 11. daemon status
# ══════════════════════════════════════════════════════════════
section "11. daemon status"
run_cmd $NOTIFIER status
assert_exit0
assert_nonempty

# ══════════════════════════════════════════════════════════════
# 12. daemon stop
# ══════════════════════════════════════════════════════════════
section "12. daemon stop"
run_cmd $NOTIFIER stop
assert_exit0

# ══════════════════════════════════════════════════════════════
# 13. task add via stdin
# ══════════════════════════════════════════════════════════════
section "13. task add via stdin"
echo "echo STDIN_TASK_OK" | $NOTIFIER task add --author e2e --task-id stdin-task >"$TD/out_stdin.txt" 2>/dev/null
EC=$?; OUT="$TD/out_stdin.txt"
assert_exit0
assert_file_exists "$NOTIFIER_HOME/tasks/pending/e2e-stdin-task.txt" "stdin task file"

summary_and_exit
