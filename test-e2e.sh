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

# Output files written by tasks during execution (POSIX paths for bash assertions)
TASK_OUT="$TD/task-out.txt"
TIMER_LOG="$TD/timer-log.txt"

# Windows-native paths for embedding in commands executed by the daemon via sh -c
# On MSYS2/Git Bash, cygpath -w converts /c/... → C:\...
# On Linux/macOS, cygpath is absent so we use the path as-is
# cygpath -m: mixed mode — C:/TheClaw/... (forward slashes, works in both sh and Windows APIs)
_winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
TASK_OUT_CMD="$(_winpath "$TASK_OUT")"
TASK2_OUT_CMD=""   # set later when TASK2_OUT is defined
TIMER_LOG_CMD="$(_winpath "$TIMER_LOG")"

# ── Pre-flight ────────────────────────────────────────────────
section "Pre-flight"

require_bin $NOTIFIER "run npm run build"
pass "NOTIFIER_HOME=$NOTIFIER_HOME"

# ══════════════════════════════════════════════════════════════
# 1. task add
# ══════════════════════════════════════════════════════════════
section "1. task add"
run_cmd $NOTIFIER task add --author e2e --task-id task-1 \
  --command "echo task-executed > $TASK_OUT_CMD"
assert_exit0

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
# 5. timer add
# ══════════════════════════════════════════════════════════════
section "5. timer add"
run_cmd $NOTIFIER timer add --author e2e --task-id timer-1 \
  --command "date +%s >> $TIMER_LOG_CMD" --timer "* * * * *"
assert_exit0
assert_file_exists "$NOTIFIER_HOME/timers/e2e-timer-1.txt" "timer file"

# ══════════════════════════════════════════════════════════════
# 6. timer list
# ══════════════════════════════════════════════════════════════
section "6. timer list"
run_cmd $NOTIFIER timer list
assert_exit0
assert_contains "timer-1"

# ══════════════════════════════════════════════════════════════
# 7. timer add — invalid cron exits 2
# ══════════════════════════════════════════════════════════════
section "7. timer add — invalid cron"
run_cmd $NOTIFIER timer add --author e2e --task-id bad-timer \
  --command "echo X" --timer "not-a-cron"
assert_exit 2

# ══════════════════════════════════════════════════════════════
# 8. timer remove
# ══════════════════════════════════════════════════════════════
section "8. timer remove"
run_cmd $NOTIFIER timer remove --author e2e --task-id timer-1
assert_exit0
assert_file_missing "$NOTIFIER_HOME/timers/e2e-timer-1.txt" "timer file"

# ══════════════════════════════════════════════════════════════
# 9. task add via stdin
# ══════════════════════════════════════════════════════════════
section "9. task add via stdin"
echo "echo stdin-executed >> $TASK_OUT_CMD" \
  | $NOTIFIER task add --author e2e --task-id stdin-task >"$TD/out_stdin.txt" 2>/dev/null
EC=$?; OUT="$TD/out_stdin.txt"
assert_exit0

# ══════════════════════════════════════════════════════════════
# 10. task remove
# ══════════════════════════════════════════════════════════════
section "10. task remove"
run_cmd $NOTIFIER task remove --author e2e --task-id stdin-task
assert_exit0
assert_file_missing "$NOTIFIER_HOME/tasks/pending/e2e-stdin-task.txt" "stdin task file"

# ══════════════════════════════════════════════════════════════
# 11. daemon start
# ══════════════════════════════════════════════════════════════
section "11. daemon start"
run_cmd $NOTIFIER start
assert_exit0
sleep 1

# ══════════════════════════════════════════════════════════════
# 12. daemon status
# ══════════════════════════════════════════════════════════════
section "12. daemon status"
run_cmd $NOTIFIER status
assert_exit0
assert_nonempty

# ══════════════════════════════════════════════════════════════
# 13. instant task — verify execution
#     task-1 was added before daemon start; daemon processes it on startup.
#     Wait up to 5s for the output file to appear.
# ══════════════════════════════════════════════════════════════
section "13. instant task — verify execution"
for i in $(seq 1 5); do
  [[ -f "$TASK_OUT" ]] && break
  sleep 1
done
assert_file_exists "$TASK_OUT" "task output file"
assert_contains "task-executed" "$TASK_OUT"
# task-1 should now be in done/
assert_file_exists "$NOTIFIER_HOME/tasks/done/e2e-task-1.txt" "task-1 in done/"
assert_file_missing "$NOTIFIER_HOME/tasks/pending/e2e-task-1.txt" "task-1 not in pending/"

# ══════════════════════════════════════════════════════════════
# 14. instant task — add while daemon running, verify execution
# ══════════════════════════════════════════════════════════════
section "14. instant task — add while daemon running"
TASK2_OUT="$TD/task2-out.txt"
TASK2_OUT_CMD="$(_winpath "$TASK2_OUT")"
run_cmd $NOTIFIER task add --author e2e --task-id task-2 \
  --command "echo task2-executed > $TASK2_OUT_CMD"
assert_exit0
for i in $(seq 1 5); do
  [[ -f "$TASK2_OUT" ]] && break
  sleep 1
done
assert_file_exists "$TASK2_OUT" "task2 output file"
assert_contains "task2-executed" "$TASK2_OUT"
assert_file_exists "$NOTIFIER_HOME/tasks/done/e2e-task-2.txt" "task-2 in done/"

# ══════════════════════════════════════════════════════════════
# 15. timer — re-add and verify multiple triggers
#     Uses "*/3 * * * * *" (every 3 seconds). Wait up to 15s for 3 lines.
# ══════════════════════════════════════════════════════════════
section "15. timer — verify multiple triggers"
run_cmd $NOTIFIER timer add --author e2e --task-id timer-1 \
  --command "date +%s >> $TIMER_LOG_CMD" --timer "*/3 * * * * *"
assert_exit0
echo "  Waiting up to 15s for 3 timer triggers..."
for i in $(seq 1 15); do
  count=0
  [[ -f "$TIMER_LOG" ]] && count=$(wc -l < "$TIMER_LOG" | tr -d ' ')
  [[ "$count" -ge 3 ]] && break
  sleep 1
done
assert_file_exists "$TIMER_LOG" "timer log file"
assert_line_count_gte 3 "$TIMER_LOG"

# ══════════════════════════════════════════════════════════════
# 16. daemon stop
# ══════════════════════════════════════════════════════════════
section "16. daemon stop"
run_cmd $NOTIFIER stop
assert_exit0

summary_and_exit
