# agent-stuff

Package for the LLM coding agent: extensions, subagents, skills, prompts, templates, and a theme.

## What is included

- **Extensions** in `extensions/`
  - `/review` and `/end-review` for code-review workflows.
  - `/session-breakdown` for interactive usage analytics from `~/.pi/agent/sessions`.
  - `/split-fork` for forking the current session into a new [Ghostty](https://ghostty.org/) split.
  - `/split-open` for opening files in `$VISUAL`/`$EDITOR` inside a [Ghostty](https://ghostty.org/) split.
  - `/bookmark` and `/unbookmark` for labelling useful assistant messages.
  - `/momap` and `ctrl+0` through `ctrl+9` for quick model switching.
  - `/plan`, `/todos`, and `ctrl+alt+p` for read-only planning mode.
  - `uv` guard that blocks direct Python tooling and requires uv-backed commands.
  - `subagent` tool plus `/subagents` for isolated specialist-agent delegation.
- **Subagents** in `agents/`
  - `scout` gathers compressed codebase context.
  - `planner` turns context into concrete implementation plans.
  - `worker` executes delegated implementation tasks.
  - `reviewer` reviews code quality and security.
- **Skills** in `skills/`
  - Productivity skills: `caveman`, `grill-me`, `pdf-reader`, `stop-slop`, `write-a-skill`.
  - Engineering skill: `zoom-out`.
- **Prompt templates** in `prompts/`
  - `implement`, `implement-and-review`, `scout-and-plan`.
- **Theme** in `themes/`
  - `habamax`.

<!-- ## Install -->
<!---->
<!-- Review the source before installing. Pi extensions run as local code with your user permissions. -->
<!---->
<!-- ```bash -->
<!-- pi install git:github.com/anoopkcn/agent-stuff -->
<!-- ``` -->
<!---->
<!-- For local development, install from a checkout: -->
<!---->
<!-- ```bash -->
<!-- git clone https://github.com/anoopkcn/agent-stuff.git -->
<!-- pi install ./agent-stuff -->
<!-- ``` -->
<!---->
<!-- To try the package for one run without adding it to settings: -->
<!---->
<!-- ```bash -->
<!-- pi -e ./agent-stuff -->
<!-- ``` -->

## Requirements

- `pi` with package support.
- Bun/Node tooling for development.
- macOS + Ghostty for `/split-open` and `/split-fork`.
- GitHub CLI (`gh`) for `/review pr ...` workflows.

## Extension quick reference

### Review

```text
/review
/review uncommitted
/review branch main
/review commit abc123
/review pr 123
/review pr https://github.com/owner/repo/pull/123
/review folder src docs
/review --extra "focus on security"
/end-review
```

`/review` supports uncommitted diffs, base-branch reviews, commits, GitHub PRs, and folder snapshots. It can start a fresh review branch in the session tree and return with `/end-review`. If `REVIEW_GUIDELINES.md` exists next to the nearest `.pi` directory, those guidelines are appended to the review prompt.

### Session breakdown

```text
/session-breakdown
```

Shows sessions, messages, tokens, and cost for the last 7/30/90 days. Use arrow keys to switch ranges and views, `tab` to switch metrics, and `q` to close.

### Ghostty helpers

```text
/split-open path/to/file
/split-fork optional prompt
```

Both commands require macOS and Ghostty. `/split-open` launches `$VISUAL`, `$EDITOR`, or `nvim`. `/split-fork` copies the current session branch into a new pi process in a right-hand Ghostty split.

### Model mapping

Configure model slots in `extensions/momap/momap.json`:

```json
{
  "mappings": {
    "1": { "provider": "anthropic", "model": "claude-sonnet-4-5" },
    "2": { "provider": "openai", "model": "gpt-5" }
  }
}
```

Use `/momap` to list mappings, `/momap 1` to switch, or `ctrl+1` to switch by shortcut.

### Plan mode

```text
/plan
/todos
pi --plan
```

Plan mode restricts the agent to read-only exploration tools, asks it to produce a numbered plan, then can execute the plan while tracking `[DONE:n]` markers.

### uv Python guard

The `uv` extension blocks direct Python tooling in pi bash execution. Use `uv run python ...`, `uv run pytest ...`, `uv add ...`, and `uv sync` instead of invoking `python`, `pip`, `pytest`, `poetry`, or virtualenv tooling directly.

Use `/uv` to show the active policy.

### Subagents

The `subagent` tool supports:

- single task: `{ agent, task }`
- parallel tasks: `{ tasks: [...] }`
- chained tasks: `{ chain: [...] }` with `{previous}` handoff

Use `/subagents` to list discovered agents.

## Prompt templates

- `implement` chains `scout` → `planner` → `worker`.
- `implement-and-review` chains `worker` → `reviewer` → `worker`.
- `scout-and-plan` chains `scout` → `planner` without implementation.

## Development

```bash
bun install
bunx tsc --noEmit
```

Pi loads `.ts` extension files directly from this package. There is no build step.

## Package layout

```text
agents/      subagent definitions
extensions/  pi extension entry points and extension-specific docs
prompts/     prompt templates
themes/      pi theme JSON
skills/      pi skills
```
