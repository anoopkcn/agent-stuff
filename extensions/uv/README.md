# uv

Enforces a uv-first Python tooling policy for pi bash execution.

## What it does

- Adds system-prompt guidance telling the agent to use `uv` for Python work.
- Blocks direct agent bash tool calls such as `python`, `python3`, `pip`, `pytest`, `ruff`, `mypy`, `black`, `poetry`, `virtualenv`, etc.
- Blocks direct user `!` / `!!` bash commands through pi's `user_bash` event too.
- Allows uv equivalents such as:
  - `uv run python ...`
  - `uv run pytest ...`
  - `uv run ruff ...`
  - `uv add <package>`
  - `uv sync`
  - `uv pip ...` when explicitly appropriate

## Command

```text
/uv
```

Shows the enforced policy.

## Examples

Blocked:

```bash
python -m pytest
python3 script.py
pip install requests
pytest
poetry install
```

Allowed:

```bash
uv run python -m pytest
uv run python script.py
uv add requests
uv run pytest
uv sync
```
