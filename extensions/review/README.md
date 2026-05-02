# Review Extension

Code review workflow for pi, inspired by Codex-style review commands.

## What it does

The `/review` command asks pi to review code changes and produce actionable findings. It supports reviewing uncommitted work, branch diffs, commits, GitHub pull requests, or folder snapshots. Reviews can run in the current session or in an empty review branch that can later be summarized back into the original branch with `/end-review`.

## Commands

- `/review` - Open an interactive selector for review mode and settings.
- `/review uncommitted` - Review uncommitted changes.
- `/review branch <base>` - Review changes against a base branch.
- `/review commit <sha>` - Review a specific commit.
- `/review pr <number-or-url>` - Check out and review a GitHub pull request.
- `/review folder <path...>` - Review one or more folders/files as a snapshot rather than a diff.
- `/review --extra "instruction" ...` - Add one-off review guidance to any mode.
- `/end-review` - Finish a review branch and choose whether to return only, return and summarize, or return and queue fixes.

## Interactive options

The `/review` selector also lets you:

- Add or remove custom review instructions that apply to all review modes.
- Enable or disable loop fixing, where pi repeatedly reviews and fixes supported targets until no actionable findings remain or the safety limit is reached.

## Project guidelines

If `REVIEW_GUIDELINES.md` exists next to the project `.pi` directory, its contents are appended to the review prompt.

## Notes

- Review mode requires interactive pi UI.
- PR review requires a git repository and a clean tracked working tree before checkout.
- `/end-review` is only meaningful for reviews started in an empty review branch.
