# answer

Extract questions from the last assistant response, answer them in an interactive TUI, then submit the compiled answers back to the agent.

## Usage

- `/answer` - extract questions from the latest complete assistant message.
- `Ctrl+.` - shortcut for `/answer`.

## Controls

- `Tab` or `Enter` - next question.
- `Shift+Tab` - previous question.
- `Shift+Enter` - insert a newline in the current answer.
- `Esc` or `Ctrl+C` - cancel.
- On the last question, `Enter` opens confirmation; press `Enter`/`y` to submit or `Esc`/`n` to keep editing.

## Extraction model

The extension prefers `openai-codex/gpt-5.3` when configured, then `anthropic/claude-haiku-4-5`, and otherwise falls back to the current model.

If the extraction model returns invalid JSON, the extension shows an error. Real cancellation is reported separately from extraction errors.

Requires interactive mode.
