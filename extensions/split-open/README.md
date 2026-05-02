# Split Open Extension

Opens a project file in your terminal editor inside a new right-hand Ghostty split.

## What it does

The `/split-open` command resolves a file relative to the current pi working directory, validates that it exists, and launches Ghostty via AppleScript. The new split starts in the same working directory and runs `$VISUAL`, `$EDITOR`, or `nvim` with the selected file.

## Requirements

- macOS
- Ghostty
- An editor set in `$VISUAL` or `$EDITOR` (falls back to `nvim`)

## Command

- `/split-open <file>` - Open a file in a right-hand Ghostty split.

## Examples

```text
/split-open src/index.ts
/split-open @README.md
/split-open "path/with spaces.md"
```
