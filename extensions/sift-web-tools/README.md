# sift-web-tools

Adds two LLM-callable tools (`web_search`, `web_fetch`) that give pi local-first web access via the [`sift`](https://github.com/akc/sift) CLI.

## Tools

- `web_search(query, max_results?)` — Runs `sift search <query> --json` (DuckDuckGo by default; SearXNG if configured) and renders the top results as a markdown list with titles, URLs, and snippets.
- `web_fetch(url, max_chars?)` — Runs `sift fetch <url> --json` and returns the page's primary content as clean markdown, plus `title` / `final_url` / `status` / `kind` in the result details.

To fetch multiple URLs, the agent issues parallel `web_fetch` tool calls in a single turn — sift instances run concurrently (one child process per URL).

Both tools are local: queries and URLs are not forwarded to any third-party API. The agent talks to a child `sift` process on your machine, which in turn uses `curl` for the actual HTTP request.

## Prerequisites

- `sift` CLI installed and available in the system's `$PATH`.
- `curl` used by sift for transport.
- `pdftotext`(optional) only required if you want `web_fetch` to handle PDFs.

### Get pre-built binaries
- [Get the latest release](https://github.com/anoopkcn/sift/releases)
- Put the `sift` binary somewhere in your `$PATH` (e.g. `~/.local/bin/` or `/usr/local/bin/`).

### Install from source
- `git clone https://github.com/anoopkcn/sift` 
- `zig build -Doptimize=ReleaseSafe`
- and copy `zig-out/bin/sift` to `~/.local/bin/` or `/usr/local/bin/`.

### Configuration
To override the binary location, set `SIFT_BIN` to a full path:

```sh
export SIFT_BIN="$HOME/.local/bin/sift" # or wherever you put it
```

(Optional) To use SearXNG instead of DuckDuckGo for search, set `sift`'s native env var:

```sh
export SIFT_SEARXNG_URL="https://your-searxng.example/search" # Replace the URL with your SearXNG instance's search endpoint
```
(no extension change needed — sift reads it directly).

## Limits

- `web_search` truncates the rendered list to roughly `max_results × 1600` chars (hard ceiling 30k) to keep the agent's context tidy.
- `web_fetch` truncates to `max_chars` (default 20000, max 100000) and appends `[truncated, full length=N]` when cut.
- `web_fetch` rejects non-`http(s)` schemes (`file://`, `data:`, etc.) before spawning sift.
- A 30-second timeout is passed to sift via `--timeout`.
- Cancellation via the agent's abort signal sends `SIGTERM` to sift, escalating to `SIGKILL` after a 2s grace window — Esc cleans up promptly.

## Failure modes

Errors are surfaced via `isError: true` and include sift's exit code context:

- `transport error: ...` — exit 3 from sift (curl failed, HTTP 4xx/5xx, response > 50 MB).
- `page requires JavaScript (SPA) — sift cannot render it` — exit 4. sift has no JS engine; report and move on rather than retrying.
- `unsupported content type: ...` — exit 6 (e.g. PDF without `pdftotext` installed).
- `sift returned invalid JSON ...` — sift emitted non-JSON in `--json` mode; the message includes a sample of the actual output for debugging.
- `sift binary not found ...` — install sift or set `SIFT_BIN`.
