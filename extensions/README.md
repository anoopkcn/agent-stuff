# Pi Extensions

This directory contains local pi agent extensions. Each subdirectory is an auto-discoverable extension directory with an `index.ts` entry point and its own README.

## Extensions

- `bookmark` - Adds `/bookmark` and `/unbookmark` for labeling important session entries.
- `momap` - Switches models via `/momap` and `Ctrl+0` through `Ctrl+9` mappings.
- `open` - Opens a file in `$VISUAL`/`$EDITOR` inside a right-hand Ghostty split.
- `plan` - Provides read-only plan mode, plan extraction, and execution progress tracking.
- `review` - Adds a code review workflow for PRs, branches, commits, uncommitted changes, and folders.
- `session-stats` - Shows an interactive usage dashboard for recent pi sessions.
- `split-fork` - Forks the current session into a new pi process in a Ghostty split.
- `subagent` - Adds a tool for delegating tasks to isolated specialized pi agents.
