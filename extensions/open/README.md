# Open Extension

Opens a project file in your terminal editor inside a new right-hand Ghostty split.

## What it does

The `/open` command resolves a file relative to the current pi working directory, validates that it exists, and launches Ghostty via AppleScript. The new split starts in the same working directory and runs `$VISUAL`, `$EDITOR`, or `nvim` with the selected file.

## Requirements

- macOS
- Ghostty
- An editor set in `$VISUAL` or `$EDITOR` (falls back to `nvim`)

## Command

- `/open <file>` - Open a file in a right-hand Ghostty split.

## Examples

```text
/open src/index.ts
/open @README.md
/open "path/with spaces.md"
```
