# momap

Local pi extension for switching the current session model with number shortcuts.

## Config

Edit `momap.json` next to `index.ts`:

```json
{
	"mappings": {
		"1": { "provider": "anthropic", "model": "claude-sonnet-4-5" },
		"2": { "provider": "openai", "model": "gpt-5" }
	}
}
```

Slots `0` through `9` are supported. Unmapped slots show a warning when pressed.

## Shortcuts

- All OSes: `ctrl+0` through `ctrl+9`

## Command

Run `/momap` to list all configured key mappings.

Run `/momap <0-9>` to switch to a configured slot, for example `/momap 1`.

Run `/reload` after changing the extension code. Config is read when a shortcut is pressed or `/momap` runs, so mapping edits do not require reload.
