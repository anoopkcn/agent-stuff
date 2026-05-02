# Subagent Extension

Adds a `subagent` tool for delegating work to specialized pi agents with isolated context windows.

## What it does

The extension discovers agent definitions from `~/.pi/agent/agents` and, when requested, project-local `.pi/agents`. Each delegated task runs in a separate `pi` process in JSON mode, so subagents can investigate independently without polluting the main conversation context.

## Tool modes

The `subagent` tool supports exactly one mode per call:

- **Single** - `{ agent, task }` runs one agent.
- **Parallel** - `{ tasks: [{ agent, task }, ...] }` runs multiple agents concurrently, up to the extension's concurrency limit.
- **Chain** - `{ chain: [{ agent, task }, ...] }` runs agents sequentially. Later tasks can include `{previous}` to receive the previous agent's final output.

Optional fields:

- `agentScope`: `user`, `project`, or `both` (defaults to `user` for safety).
- `confirmProjectAgents`: prompt before running repo-controlled project agents (defaults to `true`).
- `cwd`: working directory for a single task, or per-task `cwd` in `tasks` / `chain`.

## Command

- `/subagents [user|project|both]` - List discovered subagents and show the selected agent's file path.

## Agent files

Agent files are Markdown files with frontmatter containing at least `name` and `description`:

```markdown
---
name: researcher
description: Investigates a focused question and reports evidence
tools: read,bash,web_search
model: anthropic/claude-sonnet-4-5
---
You are a focused research subagent...
```

User agents live in `~/.pi/agent/agents`. Project agents live in the nearest `.pi/agents` directory above the current working directory.
