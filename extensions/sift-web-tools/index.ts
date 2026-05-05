import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "typebox";

const SEARCH_HARD_CEILING = 30000;
const SEARCH_PER_RESULT_BUDGET = 1600;
const SIFT_TIMEOUT_SEC = 30;

const WebSearchParams = Type.Object({
	query: Type.String({ description: "Search query" }),
	max_results: Type.Optional(
		Type.Integer({
			minimum: 1,
			maximum: 10,
			default: 5,
			description: "Hint for how many results to surface (1-10, default 5).",
		}),
	),
});

const WebFetchParams = Type.Object({
	url: Type.String({ description: "Absolute http(s) URL to fetch" }),
	max_chars: Type.Optional(
		Type.Integer({
			minimum: 500,
			maximum: 100000,
			default: 20000,
			description: "Truncate returned markdown to this many chars (default 20000).",
		}),
	),
});

interface SearchDetails {
	query: string;
	length: number;
	truncated: boolean;
	source: "sift";
}

interface FetchDetails {
	url: string;
	length: number;
	truncated: boolean;
	source: "sift";
	final_url?: string;
	title?: string;
	status?: number;
	kind?: string;
}

interface SiftSearchJson {
	query: string;
	results: Array<{ title: string; url: string; snippet: string }>;
}

interface SiftFetchJson {
	url: string;
	final_url?: string;
	status?: number;
	kind?: string;
	title?: string;
	markdown: string;
	fetched_at?: number;
}

async function siftRun(args: string[], signal: AbortSignal | undefined): Promise<string> {
	const bin = process.env.SIFT_BIN || "sift";
	const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });

	let stdout = "";
	let stderr = "";
	proc.stdout.on("data", (chunk: Buffer) => {
		stdout += chunk.toString("utf8");
	});
	proc.stderr.on("data", (chunk: Buffer) => {
		stderr += chunk.toString("utf8");
	});

	const onAbort = () => {
		proc.kill("SIGTERM");
		setTimeout(() => {
			if (!proc.killed) proc.kill("SIGKILL");
		}, 2000);
	};
	if (signal) {
		if (signal.aborted) onAbort();
		else signal.addEventListener("abort", onAbort, { once: true });
	}

	let exitCode: number;
	try {
		exitCode = await new Promise<number>((resolve, reject) => {
			proc.on("error", reject);
			proc.on("close", (code) => resolve(code ?? -1));
		});
	} catch (err) {
		if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
			throw new Error(
				`sift binary not found (tried "${bin}"). Install from https://github.com/akc/sift or set SIFT_BIN to its full path.`,
			);
		}
		throw err;
	} finally {
		signal?.removeEventListener("abort", onAbort);
	}

	if (signal?.aborted) throw new Error("aborted");
	if (exitCode === 0) return stdout;

	const tail = stderr.trim() ? `: ${stderr.trim().slice(0, 300)}` : "";
	switch (exitCode) {
		case 2:
			throw new Error(`sift bad arguments${tail}`);
		case 3:
			throw new Error(`transport error${tail}`);
		case 4:
			throw new Error("page requires JavaScript (SPA) — sift cannot render it");
		case 6:
			throw new Error(`unsupported content type${tail}`);
		default:
			throw new Error(`sift exited with code ${exitCode}${tail}`);
	}
}

function parseSiftJson<T>(stdout: string): T {
	try {
		return JSON.parse(stdout) as T;
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		const sample = stdout.trim().slice(0, 200);
		throw new Error(`sift returned invalid JSON (${reason}); output: ${sample}`);
	}
}

function truncate(text: string, max: number): { text: string; truncated: boolean } {
	if (text.length <= max) return { text, truncated: false };
	return {
		text: `${text.slice(0, max).trimEnd()}\n\n[truncated, full length=${text.length}]`,
		truncated: true,
	};
}

function isLikelyHttpUrl(u: string): boolean {
	return /^https?:\/\//i.test(u);
}

type ThemeLike = { fg(name: string, text: string): string };

function renderCollapsed(text: string, isError: boolean, theme: ThemeLike): Text {
	const lines = text.split("\n");
	const collapsed = lines.slice(0, 8).join("\n");
	const more = lines.length > 8 ? `\n${theme.fg("muted", "(Ctrl+O to expand)")}` : "";
	const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
	return new Text(`${icon} ${theme.fg("toolOutput", collapsed)}${more}`, 0, 0);
}

function formatSearchResults(payload: SiftSearchJson): string {
	if (!payload.results?.length) return "(no results)";
	return payload.results
		.map((r, i) => {
			const title = (r.title || "(untitled)").trim();
			const url = (r.url || "").trim();
			const snippet = (r.snippet || "").trim();
			const head = `${i + 1}. [${title}](${url})`;
			return snippet ? `${head}\n   ${snippet}` : head;
		})
		.join("\n\n");
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "Web search",
		description:
			"Search the web for fresh information using the local `sift` CLI (DuckDuckGo by default). Returns top results as markdown with titles, URLs, and snippets. Cite returned URLs verbatim.",
		promptSnippet:
			"web_search(query) — local web search via sift; returns top results as markdown with titles and URLs.",
		promptGuidelines: [
			"Use web_search for fresh, factual lookups; cite returned URLs verbatim.",
			"On transient failure, retry once with a different phrasing or fall back to a narrower query.",
		],
		parameters: WebSearchParams,
		executionMode: "parallel",

		async execute(_toolCallId, params: Static<typeof WebSearchParams>, signal, _onUpdate, _ctx) {
			const query = params.query.trim();
			const maxResults = params.max_results ?? 5;
			if (!query) {
				return {
					content: [{ type: "text", text: "Empty query." }],
					details: { query, length: 0, truncated: false, source: "sift" } satisfies SearchDetails,
					isError: true,
				};
			}

			try {
				const stdout = await siftRun(
					[
						"search",
						query,
						"--json",
						"--limit",
						String(maxResults),
						"--timeout",
						String(SIFT_TIMEOUT_SEC),
					],
					signal,
				);
				const payload = parseSiftJson<SiftSearchJson>(stdout);
				const markdown = formatSearchResults(payload);
				const cap = Math.min(SEARCH_HARD_CEILING, maxResults * SEARCH_PER_RESULT_BUDGET);
				const { text, truncated } = truncate(markdown, cap);
				return {
					content: [{ type: "text", text: text || "(empty response)" }],
					details: {
						query,
						length: markdown.length,
						truncated,
						source: "sift",
					} satisfies SearchDetails,
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `web_search failed: ${msg}` }],
					details: { query, length: 0, truncated: false, source: "sift" } satisfies SearchDetails,
					isError: true,
				};
			}
		},

		renderCall(args, theme, _context) {
			const q = args.query ?? "...";
			const preview = q.length > 70 ? `${q.slice(0, 70)}...` : q;
			const max = args.max_results ?? 5;
			return new Text(
				theme.fg("toolTitle", theme.bold("web_search ")) +
					theme.fg("accent", `"${preview}"`) +
					theme.fg("muted", ` [max=${max}]`),
				0,
				0,
			);
		},

		renderResult(result, { expanded }, theme, context) {
			const block = result.content[0];
			const text = block?.type === "text" ? block.text : "(no output)";
			const details = result.details as SearchDetails | undefined;
			const isError = context.isError;

			if (expanded) {
				const container = new Container();
				const header = isError
					? theme.fg("error", "✗ web_search")
					: theme.fg("success", "✓ web_search");
				container.addChild(new Text(header, 0, 0));
				container.addChild(new Text(text, 0, 0));
				if (details && !isError) {
					container.addChild(
						new Text(theme.fg("dim", `${details.length} chars${details.truncated ? " (truncated)" : ""}`), 0, 0),
					);
				}
				return container;
			}

			return renderCollapsed(text, isError, theme);
		},
	});

	pi.registerTool({
		name: "web_fetch",
		label: "Web fetch",
		description:
			"Fetch a single http(s) URL and return its primary content as markdown via the local `sift` CLI. Use after web_search to read a specific result in full.",
		promptSnippet: "web_fetch(url) — local page fetch via sift; returns primary content as markdown.",
		promptGuidelines: [
			"Use web_fetch to read a specific URL in full after web_search surfaces it.",
			"When you have several URLs to read, emit multiple web_fetch calls in the SAME assistant turn — the runtime fans them out in parallel. Do not chain them across turns.",
			"Only http(s) URLs are accepted; file:// and other schemes are rejected.",
			"sift cannot render JavaScript-only SPAs — those return an error you should report rather than retry.",
		],
		parameters: WebFetchParams,
		executionMode: "parallel",

		async execute(_toolCallId, params: Static<typeof WebFetchParams>, signal, _onUpdate, _ctx) {
			const url = params.url.trim();
			const maxChars = params.max_chars ?? 20000;

			if (!isLikelyHttpUrl(url)) {
				return {
					content: [{ type: "text", text: `web_fetch rejected non-http(s) URL: ${url}` }],
					details: { url, length: 0, truncated: false, source: "sift" } satisfies FetchDetails,
					isError: true,
				};
			}

			try {
				const stdout = await siftRun(
					["fetch", url, "--json", "--timeout", String(SIFT_TIMEOUT_SEC)],
					signal,
				);
				const payload = parseSiftJson<SiftFetchJson>(stdout);
				const markdown = payload.markdown ?? "";
				const { text, truncated } = truncate(markdown, maxChars);
				return {
					content: [{ type: "text", text: text || "(empty response)" }],
					details: {
						url,
						length: markdown.length,
						truncated,
						source: "sift",
						final_url: payload.final_url,
						title: payload.title,
						status: payload.status,
						kind: payload.kind,
					} satisfies FetchDetails,
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `web_fetch failed: ${msg}` }],
					details: { url, length: 0, truncated: false, source: "sift" } satisfies FetchDetails,
					isError: true,
				};
			}
		},

		renderCall(args, theme, _context) {
			const u = args.url ?? "...";
			const preview = u.length > 80 ? `${u.slice(0, 80)}...` : u;
			return new Text(
				theme.fg("toolTitle", theme.bold("web_fetch ")) + theme.fg("accent", preview),
				0,
				0,
			);
		},

		renderResult(result, { expanded }, theme, context) {
			const block = result.content[0];
			const text = block?.type === "text" ? block.text : "(no output)";
			const details = result.details as FetchDetails | undefined;
			const isError = context.isError;

			if (expanded) {
				const container = new Container();
				const header = isError ? theme.fg("error", "✗ web_fetch") : theme.fg("success", "✓ web_fetch");
				container.addChild(new Text(header, 0, 0));
				if (details) {
					const target = details.final_url && details.final_url !== details.url
						? `${details.url} → ${details.final_url}`
						: details.url;
					container.addChild(new Text(theme.fg("muted", target), 0, 0));
					if (details.title) {
						container.addChild(new Text(theme.fg("muted", details.title), 0, 0));
					}
				}
				container.addChild(new Text(text, 0, 0));
				if (details && !isError) {
					const meta: string[] = [`${details.length} chars`];
					if (details.truncated) meta.push("truncated");
					if (details.kind) meta.push(details.kind);
					if (typeof details.status === "number") meta.push(`HTTP ${details.status}`);
					container.addChild(new Text(theme.fg("dim", meta.join(" · ")), 0, 0));
				}
				return container;
			}

			return renderCollapsed(text, isError, theme);
		},
	});
}
