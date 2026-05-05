/**
 * uv extension - enforce uv for Python tooling in pi bash execution.
 *
 * Blocks direct invocations of python/pip/test/lint/typecheck/venv tooling and
 * tells the agent to retry via uv (for example `uv run python ...`,
 * `uv run pytest ...`, `uv add ...`, or `uv sync`).
 */

import { isToolCallEventType, type ExtensionAPI } from "@mariozechner/pi-coding-agent";

const POLICY_TEXT = `Python tooling policy:
- Never invoke python, python3, pip, pip3, pytest, ruff, mypy, black, isort, flake8, pyright, pylint, tox, coverage, ipython, jupyter, poetry, pipenv, virtualenv, or venv directly.
- Use uv instead: uv run python ..., uv run pytest ..., uv run ruff ..., uv add <package>, uv sync, uv lock, uv pip ... only when explicitly appropriate.
- If a command fails because direct Python tooling is blocked, retry with the uv equivalent.`;

const PYTHON_TOOL_RE = /^(?:python(?:\d+(?:\.\d+)?)?|pip(?:\d+(?:\.\d+)?)?|pytest|ruff|mypy|black|isort|flake8|pyright|pylint|tox|coverage|ipython|jupyter|poetry|pipenv|virtualenv|venv)$/;
const SHELL_RE = /^(?:bash|sh|zsh|fish)$/;
const UV_ALLOWED_SUBCOMMANDS = new Set(["run", "pip", "add", "remove", "sync", "lock", "venv", "tool", "init", "python", "build", "publish", "tree"]);
const COMMAND_WRAPPERS = new Set(["command", "builtin", "exec", "noglob", "time", "nohup"]);
const PRIVILEGE_WRAPPERS = new Set(["sudo", "doas"]);
const ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=.*/;

interface Token {
	text: string;
	quoted: boolean;
}

interface SimpleCommand {
	tokens: Token[];
}

export interface UvPolicyViolation {
	commandName: string;
	message: string;
}

function basename(command: string): string {
	const withoutTrailingSlash = command.replace(/\/+$/, "");
	const slash = withoutTrailingSlash.lastIndexOf("/");
	return slash >= 0 ? withoutTrailingSlash.slice(slash + 1) : withoutTrailingSlash;
}

function stripShellComments(command: string): string {
	let output = "";
	let quote: "'" | '"' | "`" | undefined;
	let escaped = false;

	for (let i = 0; i < command.length; i++) {
		const char = command[i];
		const prev = i > 0 ? command[i - 1] : "\n";

		if (escaped) {
			output += char;
			escaped = false;
			continue;
		}

		if (char === "\\" && quote !== "'") {
			output += char;
			escaped = true;
			continue;
		}

		if (quote) {
			output += char;
			if (char === quote) quote = undefined;
			continue;
		}

		if (char === "'" || char === '"' || char === "`") {
			quote = char;
			output += char;
			continue;
		}

		if (char === "#" && /\s/.test(prev)) {
			while (i < command.length && command[i] !== "\n") i++;
			output += "\n";
			continue;
		}

		output += char;
	}

	return output;
}

function splitSimpleCommands(command: string): string[] {
	const commands: string[] = [];
	let current = "";
	let quote: "'" | '"' | "`" | undefined;
	let escaped = false;

	for (let i = 0; i < command.length; i++) {
		const char = command[i];

		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}

		if (char === "\\" && quote !== "'") {
			current += char;
			escaped = true;
			continue;
		}

		if (quote) {
			current += char;
			if (char === quote) quote = undefined;
			continue;
		}

		if (char === "'" || char === '"' || char === "`") {
			quote = char;
			current += char;
			continue;
		}

		if (char === ";" || char === "\n" || char === "|" || char === "&") {
			if (current.trim()) commands.push(current.trim());
			current = "";
			if ((char === "|" || char === "&") && command[i + 1] === char) i++;
			continue;
		}

		current += char;
	}

	if (current.trim()) commands.push(current.trim());
	return commands;
}

function tokenize(simpleCommand: string): Token[] {
	const tokens: Token[] = [];
	let current = "";
	let quote: "'" | '"' | "`" | undefined;
	let escaped = false;
	let quoted = false;

	function push(): void {
		if (!current) return;
		tokens.push({ text: current, quoted });
		current = "";
		quoted = false;
	}

	for (let i = 0; i < simpleCommand.length; i++) {
		const char = simpleCommand[i];

		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}

		if (char === "\\" && quote !== "'") {
			escaped = true;
			continue;
		}

		if (quote) {
			if (char === quote) {
				quote = undefined;
				continue;
			}
			current += char;
			continue;
		}

		if (char === "'" || char === '"' || char === "`") {
			quote = char;
			quoted = true;
			continue;
		}

		if (/\s/.test(char)) {
			push();
			continue;
		}

		current += char;
	}

	push();
	return tokens;
}

function parseSimpleCommands(command: string): SimpleCommand[] {
	return splitSimpleCommands(stripShellComments(command))
		.map((part) => ({ tokens: tokenize(part) }))
		.filter((cmd) => cmd.tokens.length > 0);
}

function isOption(token: Token): boolean {
	return token.text.startsWith("-") && token.text !== "-";
}

function firstExecutableToken(tokens: Token[]): Token | undefined {
	let index = 0;

	while (index < tokens.length && ENV_ASSIGNMENT_RE.test(tokens[index].text)) index++;

	while (index < tokens.length) {
		const name = basename(tokens[index].text);

		if (name === "env") {
			index++;
			while (index < tokens.length) {
				const text = tokens[index].text;
				if (ENV_ASSIGNMENT_RE.test(text)) {
					index++;
					continue;
				}
				if (text === "-i" || text === "--ignore-environment") {
					index++;
					continue;
				}
				if (text === "-u" || text === "--unset") {
					index += 2;
					continue;
				}
				if (isOption(tokens[index])) {
					index++;
					continue;
				}
				break;
			}
			continue;
		}

		if (PRIVILEGE_WRAPPERS.has(name)) {
			index++;
			while (index < tokens.length && isOption(tokens[index])) {
				const opt = tokens[index].text;
				index++;
				if (["-u", "--user", "-g", "--group", "-h", "--host", "-p", "--prompt", "-C", "--close-from"].includes(opt)) index++;
			}
			continue;
		}

		if (COMMAND_WRAPPERS.has(name)) {
			index++;
			continue;
		}

		return tokens[index];
	}

	return undefined;
}

function directToolName(token: Token | undefined): string | undefined {
	if (!token) return undefined;
	const name = basename(token.text);
	return PYTHON_TOOL_RE.test(name) ? name : undefined;
}

function uvCommandIsAllowed(tokens: Token[]): boolean {
	const executable = firstExecutableToken(tokens);
	if (!executable || basename(executable.text) !== "uv") return false;
	const executableIndex = tokens.indexOf(executable);
	const subcommand = tokens.slice(executableIndex + 1).find((token) => !isOption(token));
	return !!subcommand && UV_ALLOWED_SUBCOMMANDS.has(subcommand.text);
}

function nestedShellCommand(tokens: Token[]): string | undefined {
	const executable = firstExecutableToken(tokens);
	if (!executable || !SHELL_RE.test(basename(executable.text))) return undefined;

	const start = tokens.indexOf(executable) + 1;
	for (let i = start; i < tokens.length; i++) {
		const text = tokens[i].text;
		if (text === "-c" || text === "--command") return tokens[i + 1]?.text;
		if (text.startsWith("-c") && text.length > 2) return text.slice(2);
		if (/^-[A-Za-z]*c[A-Za-z]*$/.test(text)) return tokens[i + 1]?.text;
		if (text.startsWith("--command=")) return text.slice("--command=".length);
	}

	return undefined;
}

function violationMessage(commandName: string): string {
	return `Direct Python tooling is blocked: ${commandName}\n\nUse uv instead. Examples:\n- uv run python ...\n- uv run pytest ...\n- uv run ruff ...\n- uv add <package>\n- uv sync\n- uv pip ... (only when explicitly appropriate)`;
}

export function inspectCommandForUvPolicy(command: string, depth = 0): UvPolicyViolation | undefined {
	if (depth > 3) return undefined;

	for (const simpleCommand of parseSimpleCommands(command)) {
		if (uvCommandIsAllowed(simpleCommand.tokens)) continue;

		const direct = directToolName(firstExecutableToken(simpleCommand.tokens));
		if (direct) return { commandName: direct, message: violationMessage(direct) };

		const nested = nestedShellCommand(simpleCommand.tokens);
		if (nested) {
			const nestedViolation = inspectCommandForUvPolicy(nested, depth + 1);
			if (nestedViolation) return nestedViolation;
		}
	}

	return undefined;
}

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event) => {
		return { systemPrompt: `${event.systemPrompt}\n\n${POLICY_TEXT}` };
	});

	pi.on("tool_call", async (event) => {
		if (!isToolCallEventType("bash", event)) return;

		const violation = inspectCommandForUvPolicy(event.input.command);
		if (!violation) return;

		return { block: true, reason: violation.message };
	});

	pi.on("user_bash", async (event) => {
		const violation = inspectCommandForUvPolicy(event.command);
		if (!violation) return;

		return {
			result: {
				output: violation.message,
				exitCode: 2,
				cancelled: false,
				truncated: false,
			},
		};
	});

	pi.registerCommand("uv", {
		description: "Show the uv Python-tooling policy enforced for bash commands",
		handler: async (_args, ctx) => {
			ctx.ui.notify(POLICY_TEXT, "info");
		},
	});
}
