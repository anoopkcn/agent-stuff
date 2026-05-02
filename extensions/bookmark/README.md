# Bookmark Extension

Adds lightweight bookmark commands for pi session entries.

## What it does

This extension labels important conversation entries so they are easier to find later in `/tree`. It uses pi's persisted session labels, so bookmarks survive reloads and session resumes.

## Commands

- `/bookmark [label]` - Label the most recent assistant message. If no label is provided, a timestamped label such as `bookmark-1712345678901` is used.
- `/unbookmark` - Remove the nearest label from the end of the current session history.

## Usage

```text
/bookmark before-refactor
```

Then open `/tree` and look for the label when navigating the session history.
