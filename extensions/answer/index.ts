/**
 * Answer extension - extract questions from the last assistant response and answer them interactively.
 *
 * Provides:
 * - /answer
 * - Ctrl+. shortcut
 */

import { complete, type Api, type Model, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { BorderedLoader } from "@mariozechner/pi-coding-agent";
import {
	type Component,
	Editor,
	type EditorTheme,
	type Focusable,
	Key,
	matchesKey,
	truncateToWidth,
	type TUI,
	visibleWidth,
	wrapTextWithAnsi,
} from "@mariozechner/pi-tui";

interface ExtractedQuestion {
	question: string;
	context?: string;
}

interface ExtractionResult {
	questions: ExtractedQuestion[];
}

type ExtractionOutcome =
	| { kind: "ok"; result: ExtractionResult }
	| { kind: "cancelled" }
	| { kind: "error"; message: string };

const SYSTEM_PROMPT = `You are a question extractor. Given text from a conversation, extract any questions that need answering.

Output only a JSON object with this structure:
{
  "questions": [
    {
      "question": "The question text",
      "context": "Optional context that helps answer the question"
    }
  ]
}

Rules:
- Extract all questions that require user input
- Keep questions in the order they appeared
- Be concise with question text
- Include context only when it provides essential information for answering
- If no questions are found, return {"questions": []}
- Do not include markdown, prose, comments, or trailing commas

Example output:
{
  "questions": [
    {
      "question": "What is your preferred database?",
      "context": "We can only configure MySQL and PostgreSQL because of what is implemented."
    },
    {
      "question": "Should we use TypeScript or JavaScript?"
    }
  ]
}`;

const CODEX_MODEL_ID = "gpt-5.3";
const HAIKU_MODEL_ID = "claude-haiku-4-5";

async function selectExtractionModel(
	currentModel: Model<Api>,
	modelRegistry: ModelRegistry,
): Promise<Model<Api>> {
	const codexModel = modelRegistry.find("openai-codex", CODEX_MODEL_ID);
	if (codexModel) {
		const auth = await modelRegistry.getApiKeyAndHeaders(codexModel);
		if (auth.ok) return codexModel;
	}

	const haikuModel = modelRegistry.find("anthropic", HAIKU_MODEL_ID);
	if (haikuModel) {
		const auth = await modelRegistry.getApiKeyAndHeaders(haikuModel);
		if (auth.ok) return haikuModel;
	}

	return currentModel;
}

function parseExtractionResult(text: string): ExtractionResult | null {
	try {
		let jsonStr = text.trim();
		const fencedJson = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
		if (fencedJson?.[1]) {
			jsonStr = fencedJson[1].trim();
		} else {
			const firstBrace = jsonStr.indexOf("{");
			const lastBrace = jsonStr.lastIndexOf("}");
			if (firstBrace >= 0 && lastBrace > firstBrace) {
				jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
			}
		}

		const parsed = JSON.parse(jsonStr) as unknown;
		if (!parsed || typeof parsed !== "object" || !("questions" in parsed)) return null;

		const questions = (parsed as { questions: unknown }).questions;
		if (!Array.isArray(questions)) return null;

		return {
			questions: questions.flatMap((item): ExtractedQuestion[] => {
				if (!item || typeof item !== "object") return [];
				const question = (item as { question?: unknown }).question;
				const context = (item as { context?: unknown }).context;
				if (typeof question !== "string" || question.trim().length === 0) return [];
				return [
					{
						question: question.trim(),
						context: typeof context === "string" && context.trim().length > 0 ? context.trim() : undefined,
					},
				];
			}),
		};
	} catch {
		return null;
	}
}

class QnAComponent implements Component, Focusable {
	private readonly questions: ExtractedQuestion[];
	private readonly answers: string[];
	private currentIndex = 0;
	private readonly editor: Editor;
	private readonly tui: TUI;
	private readonly onDone: (result: string | null) => void;
	private showingConfirmation = false;
	private cachedWidth?: number;
	private cachedLines?: string[];
	private _focused = false;

	private readonly dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
	private readonly bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
	private readonly cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
	private readonly green = (s: string) => `\x1b[32m${s}\x1b[0m`;
	private readonly yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
	private readonly gray = (s: string) => `\x1b[90m${s}\x1b[0m`;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.editor.focused = value;
	}

	constructor(questions: ExtractedQuestion[], tui: TUI, onDone: (result: string | null) => void) {
		this.questions = questions;
		this.answers = questions.map(() => "");
		this.tui = tui;
		this.onDone = onDone;

		const editorTheme: EditorTheme = {
			borderColor: this.dim,
			selectList: {
				selectedPrefix: this.cyan,
				selectedText: this.cyan,
				description: this.gray,
				scrollInfo: this.dim,
				noMatch: this.yellow,
			},
		};

		this.editor = new Editor(tui, editorTheme);
		this.editor.disableSubmit = true;
		this.editor.onChange = () => {
			this.invalidate();
			this.tui.requestRender();
		};
	}

	private saveCurrentAnswer(): void {
		this.answers[this.currentIndex] = this.editor.getExpandedText?.() ?? this.editor.getText();
	}

	private navigateTo(index: number): void {
		if (index < 0 || index >= this.questions.length) return;
		this.saveCurrentAnswer();
		this.currentIndex = index;
		this.showingConfirmation = false;
		this.editor.setText(this.answers[index] || "");
		this.invalidate();
	}

	private submit(): void {
		this.saveCurrentAnswer();

		const parts: string[] = [];
		for (let i = 0; i < this.questions.length; i++) {
			const q = this.questions[i];
			const a = this.answers[i]?.trim() || "(no answer)";
			parts.push(`Q: ${q.question}`);
			if (q.context) parts.push(`> ${q.context}`);
			parts.push(`A: ${a}`);
			parts.push("");
		}

		this.onDone(parts.join("\n").trim());
	}

	private cancel(): void {
		this.onDone(null);
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
		this.editor.invalidate();
	}

	handleInput(data: string): void {
		if (this.showingConfirmation) {
			if (matchesKey(data, Key.enter) || data.toLowerCase() === "y") {
				this.submit();
				return;
			}
			if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || data.toLowerCase() === "n") {
				this.showingConfirmation = false;
				this.invalidate();
				this.tui.requestRender();
				return;
			}
			return;
		}

		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.cancel();
			return;
		}

		if (matchesKey(data, Key.tab)) {
			this.navigateTo(Math.min(this.currentIndex + 1, this.questions.length - 1));
			this.tui.requestRender();
			return;
		}

		if (matchesKey(data, Key.shift("tab"))) {
			this.navigateTo(Math.max(this.currentIndex - 1, 0));
			this.tui.requestRender();
			return;
		}

		if (matchesKey(data, Key.enter)) {
			this.saveCurrentAnswer();
			if (this.currentIndex < this.questions.length - 1) {
				this.navigateTo(this.currentIndex + 1);
			} else {
				this.showingConfirmation = true;
				this.invalidate();
			}
			this.tui.requestRender();
			return;
		}

		this.editor.handleInput(data);
		this.invalidate();
		this.tui.requestRender();
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

		const safeWidth = Math.max(1, width);
		const boxWidth = Math.max(10, Math.min(safeWidth, 120));
		const contentWidth = Math.max(1, boxWidth - 4);
		const horizontalLine = (count: number) => "─".repeat(Math.max(0, count));

		const padToWidth = (line: string): string => {
			const truncated = truncateToWidth(line, safeWidth, "");
			return truncated + " ".repeat(Math.max(0, safeWidth - visibleWidth(truncated)));
		};

		const boxLine = (content: string, leftPad = 2): string => {
			const paddedContent = " ".repeat(leftPad) + truncateToWidth(content, Math.max(1, contentWidth - leftPad), "");
			const contentLen = visibleWidth(paddedContent);
			const rightPad = Math.max(0, boxWidth - contentLen - 2);
			return this.dim("│") + paddedContent + " ".repeat(rightPad) + this.dim("│");
		};

		const emptyBoxLine = (): string => this.dim("│") + " ".repeat(Math.max(0, boxWidth - 2)) + this.dim("│");

		const lines: string[] = [];
		lines.push(padToWidth(this.dim("╭" + horizontalLine(boxWidth - 2) + "╮")));
		lines.push(
			padToWidth(
				boxLine(`${this.bold(this.cyan("Questions"))} ${this.dim(`(${this.currentIndex + 1}/${this.questions.length})`)}`),
			),
		);
		lines.push(padToWidth(this.dim("├" + horizontalLine(boxWidth - 2) + "┤")));

		const progressParts = this.questions.map((_, i) => {
			const answered = (this.answers[i]?.trim() || "").length > 0;
			if (i === this.currentIndex) return this.cyan("●");
			if (answered) return this.green("●");
			return this.dim("○");
		});
		lines.push(padToWidth(boxLine(progressParts.join(" "))));
		lines.push(padToWidth(emptyBoxLine()));

		const q = this.questions[this.currentIndex];
		for (const line of wrapTextWithAnsi(`${this.bold("Q:")} ${q.question}`, contentWidth)) {
			lines.push(padToWidth(boxLine(line)));
		}

		if (q.context) {
			lines.push(padToWidth(emptyBoxLine()));
			for (const line of wrapTextWithAnsi(this.gray(`> ${q.context}`), Math.max(1, contentWidth - 2))) {
				lines.push(padToWidth(boxLine(line)));
			}
		}

		lines.push(padToWidth(emptyBoxLine()));

		const answerPrefix = this.bold("A: ");
		const editorWidth = Math.max(10, contentWidth - 7);
		const editorLines = this.editor.render(editorWidth);
		const contentLines = editorLines.length > 2 ? editorLines.slice(1, -1) : editorLines;
		for (let i = 0; i < contentLines.length; i++) {
			lines.push(padToWidth(boxLine((i === 0 ? answerPrefix : "   ") + contentLines[i])));
		}

		lines.push(padToWidth(emptyBoxLine()));
		lines.push(padToWidth(this.dim("├" + horizontalLine(boxWidth - 2) + "┤")));

		if (this.showingConfirmation) {
			const confirmMsg = `${this.yellow("Submit all answers?")} ${this.dim("(Enter/y to confirm, Esc/n to keep editing)")}`;
			lines.push(padToWidth(boxLine(confirmMsg)));
		} else {
			const controls = `${this.dim("Tab/Enter")} next · ${this.dim("Shift+Tab")} prev · ${this.dim("Shift+Enter")} newline · ${this.dim("Esc")} cancel`;
			lines.push(padToWidth(boxLine(controls)));
		}

		lines.push(padToWidth(this.dim("╰" + horizontalLine(boxWidth - 2) + "╯")));

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}
}

function getLastAssistantText(ctx: ExtensionContext): string | undefined {
	const branch = ctx.sessionManager.getBranch();

	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (entry.type !== "message") continue;

		const msg = entry.message;
		if (!("role" in msg) || msg.role !== "assistant") continue;

		if (msg.stopReason !== "stop") {
			ctx.ui.notify(`Last assistant message incomplete (${msg.stopReason})`, "error");
			return undefined;
		}

		const textParts = msg.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text);
		if (textParts.length > 0) return textParts.join("\n");
	}

	ctx.ui.notify("No assistant messages found", "error");
	return undefined;
}

export default function (pi: ExtensionAPI) {
	const answerHandler = async (ctx: ExtensionContext) => {
		if (!ctx.hasUI) {
			ctx.ui.notify("answer requires interactive mode", "error");
			return;
		}

		if (!ctx.model) {
			ctx.ui.notify("No model selected", "error");
			return;
		}

		const lastAssistantText = getLastAssistantText(ctx);
		if (!lastAssistantText) return;

		const extractionModel = await selectExtractionModel(ctx.model, ctx.modelRegistry);

		const extractionOutcome = await ctx.ui.custom<ExtractionOutcome>((tui, theme, _kb, done) => {
			const loader = new BorderedLoader(tui, theme, `Extracting questions using ${extractionModel.id}...`);
			loader.onAbort = () => done({ kind: "cancelled" });

			const doExtract = async (): Promise<ExtractionOutcome> => {
				const auth = await ctx.modelRegistry.getApiKeyAndHeaders(extractionModel);
				if (!auth.ok) throw new Error(auth.error);

				const userMessage: UserMessage = {
					role: "user",
					content: [{ type: "text", text: lastAssistantText }],
					timestamp: Date.now(),
				};

				const response = await complete(
					extractionModel,
					{ systemPrompt: SYSTEM_PROMPT, messages: [userMessage] },
					{ apiKey: auth.apiKey, headers: auth.headers, signal: loader.signal },
				);

				if (response.stopReason === "aborted") return { kind: "cancelled" };

				const responseText = response.content
					.filter((c): c is { type: "text"; text: string } => c.type === "text")
					.map((c) => c.text)
					.join("\n");

				const parsed = parseExtractionResult(responseText);
				if (parsed) return { kind: "ok", result: parsed };

				return { kind: "error", message: "Question extraction returned invalid JSON." };
			};

			doExtract()
				.then(done)
				.catch((error) => {
					done({
						kind: "error",
						message: error instanceof Error ? error.message : String(error),
					});
				});

			return loader;
		});

		if (extractionOutcome.kind === "cancelled") {
			ctx.ui.notify("Cancelled", "info");
			return;
		}

		if (extractionOutcome.kind === "error") {
			ctx.ui.notify(`Question extraction failed: ${extractionOutcome.message}`, "error");
			return;
		}

		const extractionResult = extractionOutcome.result;
		if (extractionResult.questions.length === 0) {
			ctx.ui.notify("No questions found in the last message", "info");
			return;
		}

		const answersResult = await ctx.ui.custom<string | null>((tui, _theme, _kb, done) => {
			return new QnAComponent(extractionResult.questions, tui, done);
		});

		if (answersResult === null) {
			ctx.ui.notify("Cancelled", "info");
			return;
		}

		pi.sendMessage(
			{
				customType: "answers",
				content: "I answered your questions in the following way:\n\n" + answersResult,
				display: true,
			},
			{ triggerTurn: true },
		);
	};

	pi.registerCommand("answer", {
		description: "Extract questions from last assistant message into interactive Q&A",
		handler: async (_args, ctx) => answerHandler(ctx),
	});

	pi.registerShortcut("ctrl+.", {
		description: "Extract and answer questions",
		handler: answerHandler,
	});
}
