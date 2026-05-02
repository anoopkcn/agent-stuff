# Session Stats Extension

Interactive usage dashboard for local pi sessions.

## What it does

The `/session-breakdown` command scans `~/.pi/agent/sessions` for recent session JSONL files and summarizes activity over the last 7, 30, and 90 days. It shows a calendar-style graph plus breakdown tables for models, working directories, weekdays, and time-of-day buckets.

Tracked metrics include:

- Sessions
- Messages
- Tokens, when usage data is present
- Cost, when usage data is present
- Per-model, per-directory, weekday, and time-of-day distributions

## Command

- `/session-breakdown` - Open the interactive session usage dashboard.

## Controls

- `←` / `→` or `h` / `l` - Switch date range: 7d, 30d, 90d
- `↑` / `↓` or `k` / `j` - Switch view: model, cwd, weekday, time of day
- `Tab` / `Shift+Tab` or `t` - Switch metric: sessions, messages, tokens
- `1`, `2`, `3` - Jump to 7d, 30d, or 90d
- `q`, `Esc`, or `Ctrl+C` - Close

In non-interactive mode, the extension emits a compact 30-day summary message instead of opening the TUI.
