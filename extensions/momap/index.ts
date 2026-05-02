import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";

const slots = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
type Slot = (typeof slots)[number];

function isSlot(value: string): value is Slot {
	return (slots as readonly string[]).includes(value);
}

type ModelMapping = {
	provider: string;
	model: string;
};

type MomapConfig = {
	mappings?: Partial<Record<Slot, ModelMapping>>;
};

type MappingResult =
	| { kind: "none" }
	| { kind: "mapped"; mapping: ModelMapping }
	| { kind: "error"; message: string };

const configPath = join(dirname(fileURLToPath(import.meta.url)), "momap.json");

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseConfig(): MomapConfig {
	if (!existsSync(configPath)) return { mappings: {} };

	const content = readFileSync(configPath, "utf-8");
	if (content.trim() === "") return { mappings: {} };

	const parsed = JSON.parse(content) as unknown;
	if (!isRecord(parsed)) return { mappings: {} };
	if (parsed.mappings !== undefined && !isRecord(parsed.mappings)) return { mappings: {} };

	return parsed as MomapConfig;
}

function validateMapping(slot: Slot, rawMapping: unknown): MappingResult {
	if (rawMapping === undefined || rawMapping === null) return { kind: "none" };

	if (!isRecord(rawMapping)) {
		return { kind: "error", message: `momap slot ${slot} must be an object with provider and model` };
	}

	const provider = rawMapping.provider;
	const model = rawMapping.model;
	if (typeof provider !== "string" || provider.trim() === "") {
		return { kind: "error", message: `momap slot ${slot} is missing a provider` };
	}
	if (typeof model !== "string" || model.trim() === "") {
		return { kind: "error", message: `momap slot ${slot} is missing a model` };
	}

	return {
		kind: "mapped",
		mapping: {
			provider: provider.trim(),
			model: model.trim(),
		},
	};
}

function getMapping(slot: Slot): MappingResult {
	let config: MomapConfig;
	try {
		config = parseConfig();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { kind: "error", message: `Failed to read ${configPath}: ${message}` };
	}

	return validateMapping(slot, config.mappings?.[slot]);
}

function formatBoundKeymaps(): { kind: "message"; content: string } | { kind: "error"; message: string } {
	let config: MomapConfig;
	try {
		config = parseConfig();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { kind: "error", message: `Failed to read ${configPath}: ${message}` };
	}

	const lines: string[] = [];
	for (const slot of slots) {
		const result = validateMapping(slot, config.mappings?.[slot]);
		if (result.kind === "none") continue;
		if (result.kind === "error") {
			lines.push(`ctrl+${slot} -> invalid (${result.message})`);
			continue;
		}
		lines.push(`ctrl+${slot} -> ${result.mapping.provider}/${result.mapping.model}`);
	}

	if (lines.length === 0) return { kind: "message", content: "momap: no model mappings configured" };
	return { kind: "message", content: ["momap mappings:", ...lines.map((line) => `  ${line}`)].join("\n") };
}

async function switchMappedModel(pi: ExtensionAPI, ctx: ExtensionContext, slot: Slot) {
	const result = getMapping(slot);
	if (result.kind === "none") {
		ctx.ui.notify(`momap slot ${slot}: no model mapped`, "warning");
		return;
	}
	if (result.kind === "error") {
		ctx.ui.notify(result.message, "error");
		return;
	}

	const { provider, model: modelId } = result.mapping;
	const model = ctx.modelRegistry.find(provider, modelId);
	if (!model) {
		ctx.ui.notify(`momap slot ${slot}: unknown model ${provider}/${modelId}`, "error");
		return;
	}

	const success = await pi.setModel(model);
	if (!success) {
		ctx.ui.notify(`momap slot ${slot}: no API key for ${provider}/${modelId}`, "error");
		return;
	}

}

export default function momap(pi: ExtensionAPI) {
	pi.registerCommand("momap", {
		description: "List configured momap key mappings, or switch to a slot with /momap <0-9>",
		handler: async (args, ctx) => {
			const slotArg = args.trim();
			if (slotArg !== "") {
				if (!isSlot(slotArg)) {
					ctx.ui.notify(`momap: expected a slot number from 0 to 9, got "${slotArg}"`, "warning");
					return;
				}
				await switchMappedModel(pi, ctx, slotArg);
				return;
			}

			const result = formatBoundKeymaps();
			if (result.kind === "error") {
				pi.sendMessage({ customType: "momap", content: result.message, display: true });
				return;
			}
			pi.sendMessage({ customType: "momap", content: result.content, display: true });
		},
	});

	for (const slot of slots) {
		pi.registerShortcut(Key.ctrl(slot), {
			description: `momap: switch to model slot ${slot}`,
			handler: async (ctx) => {
				await switchMappedModel(pi, ctx, slot);
			},
		});
	}
}
