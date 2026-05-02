import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync } from "node:fs";
import * as path from "node:path";

const GHOSTTY_OPEN_SCRIPT = `on run argv
	set targetCwd to item 1 of argv
	set startupInput to item 2 of argv
	tell application "Ghostty"
		set cfg to new surface configuration
		set initial working directory of cfg to targetCwd
		set initial input of cfg to startupInput
		if (count of windows) > 0 then
			try
				set frontWindow to front window
				set targetTerminal to focused terminal of selected tab of frontWindow
				split targetTerminal direction right with configuration cfg
			on error
				new window with configuration cfg
			end try
		else
			new window with configuration cfg
		end if
		activate
	end tell
end run`;

function shellQuote(value: string): string {
	if (value.length === 0) return "''";
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function stripMatchingQuotes(value: string): string {
	if (value.length >= 2) {
		const first = value[0];
		const last = value[value.length - 1];
		if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
			return value.slice(1, -1);
		}
	}
	return value;
}

export default function (pi: ExtensionAPI): void {
	pi.registerCommand("split-open", {
		description: "Open a file in $VISUAL/$EDITOR inside a right-hand Ghostty split. Usage: /split-open <file>",
		handler: async (args, ctx) => {
			if (process.platform !== "darwin") {
				ctx.ui.notify("/split-open currently requires macOS (Ghostty AppleScript).", "warning");
				return;
			}

			const rawFile = stripMatchingQuotes(args.trim()).replace(/^@/, "");
			if (!rawFile) {
				ctx.ui.notify("Usage: /split-open <file>", "warning");
				return;
			}

			const absoluteFile = path.resolve(ctx.cwd, rawFile);
			if (!existsSync(absoluteFile)) {
				ctx.ui.notify(`File does not exist: ${rawFile}`, "warning");
				return;
			}

			const editor = process.env.VISUAL || process.env.EDITOR || "nvim";
			const startupInput = `${editor} ${shellQuote(absoluteFile)}\n`;

			const result = await pi.exec("osascript", ["-e", GHOSTTY_OPEN_SCRIPT, "--", ctx.cwd, startupInput]);
			if (result.code !== 0) {
				const reason = result.stderr?.trim() || result.stdout?.trim() || "unknown osascript error";
				ctx.ui.notify(`Failed to launch Ghostty split: ${reason}`, "error");
				return;
			}

			ctx.ui.notify(`Opened ${path.basename(absoluteFile)} in a new Ghostty split.`, "info");
		},
	});
}
