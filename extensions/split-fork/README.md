# Split Fork Extension

Forks the current pi session into a new pi process running in a right-hand Ghostty split.

## What it does

`/split-fork` copies the current session branch to a new session file, then opens a Ghostty split and starts `pi --session <new-session>`. This lets you explore an alternate path while the original session stays open.

If the current session is not persisted, the extension still opens a new Ghostty split but cannot create a forked session file.

## Requirements

- macOS
- Ghostty
- `pi` available from the spawned shell, or the current pi runtime executable still available on disk

## Command

- `/split-fork [optional prompt]` - Open a forked session in a right-hand Ghostty split. If a prompt is provided, it is passed to the new pi process.

## Examples

```text
/split-fork
/split-fork Try a minimal implementation of the parser change
```
