import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { formatTaskList, formatToolCall, formatToolContent, formatToolResult } from "./format.ts";
import { buildTaskContext, CONTEXT_TYPE } from "./model-context.ts";
import { sanitizeTerminalText } from "./sanitize.ts";
import { SessionStore } from "./session-store.ts";
import { TODO_PROMPT_GUIDELINES, type TodoParams, TodoParamsSchema, toTaskOperation } from "./tool-schema.ts";
import type { TaskOperationResult } from "./types.ts";
import { TaskWidget } from "./widget.ts";

const WIDGET_KEY = "pi-session-tasks";

type ToolDetails = Omit<TaskOperationResult, "tasks"> | TaskOperationResult;

function boundedDetails(result: TaskOperationResult): ToolDetails {
	const base = { action: result.action, changed: result.changed, counts: result.counts };
	switch (result.action) {
		case "list":
			return { ...base, tasks: result.tasks };
		case "create":
		case "update":
		case "move":
			return { ...base, task: result.task };
		case "delete":
			return { ...base, deletedTaskId: result.deletedTaskId };
		case "clear":
			return base;
	}
}

export default function sessionTasksExtension(pi: ExtensionAPI): void {
	const stores = new Map<string, SessionStore>();
	let foregroundSessionId = "";
	let foregroundUi: ExtensionContext["ui"] | undefined;
	let lifecycleGeneration = 0;
	let widget: TaskWidget | undefined;

	function storeFor(ctx: ExtensionContext): SessionStore {
		const id = ctx.sessionManager.getSessionId();
		let store = stores.get(id);
		if (!store) {
			store = new SessionStore((customType, data) => pi.appendEntry(customType, data));
			stores.set(id, store);
		}
		return store;
	}

	function renderForeground(id: string, generation: number): void {
		if (id !== foregroundSessionId || generation !== lifecycleGeneration) return;
		const store = stores.get(id);
		if (!store) throw new Error(`Session task store ${id} not found`);
		const ui = foregroundUi;
		if (!ui) throw new Error(`Foreground UI for session ${id} not found`);
		if (store.getTasks().length === 0) {
			ui.setWidget(WIDGET_KEY, undefined);
			widget = undefined;
			return;
		}
		ui.setWidget(WIDGET_KEY, (_tui, theme: Theme) => {
			widget = new TaskWidget(() => store.getTasks(), theme);
			return widget;
		});
	}

	pi.registerTool({
		name: "todo",
		label: "Session tasks",
		description: "List, create, update, move, delete, or clear tasks in the current Pi session.",
		promptSnippet: "Track concrete work in the current Pi session",
		promptGuidelines: [...TODO_PROMPT_GUIDELINES],
		parameters: TodoParamsSchema,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const id = ctx.sessionManager.getSessionId();
			const generation = lifecycleGeneration;
			const result = await storeFor(ctx).execute(toTaskOperation(params));
			renderForeground(id, generation);
			return {
				content: [{ type: "text", text: formatToolContent(result) }],
				details: boundedDetails(result),
			};
		},
		renderCall(args, theme) {
			return formatToolCall(args, theme);
		},
		renderResult(result, { expanded, isPartial }, theme, context) {
			if (context.isError) {
				const text = result.content
					.filter((item) => item.type === "text")
					.map((item) => sanitizeTerminalText(item.text))
					.join("\n");
				return new Text(theme.fg("error", text), 0, 0);
			}
			if (isPartial) return new Text(theme.fg("muted", "Session task operation in progress"), 0, 0);
			if (!result.details) throw new Error("Successful session task result requires details");
			return formatToolResult(result.details as TaskOperationResult, expanded, theme);
		},
	});

	pi.registerCommand("tasks", {
		description: "Show tasks on the current session branch.",
		handler: async (_args, ctx) => {
			ctx.ui.notify(formatTaskList(storeFor(ctx).getTasks()), "info");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		const id = ctx.sessionManager.getSessionId();
		const store = storeFor(ctx);
		store.reconstruct(ctx.sessionManager.getBranch());
		if (!ctx.hasUI) return;
		if (!foregroundSessionId) foregroundSessionId = id;
		if (foregroundSessionId !== id) return;
		lifecycleGeneration += 1;
		foregroundUi = ctx.ui;
		renderForeground(id, lifecycleGeneration);
	});

	function reconstructAndRender(ctx: ExtensionContext): void {
		const id = ctx.sessionManager.getSessionId();
		storeFor(ctx).reconstruct(ctx.sessionManager.getBranch());
		if (id === foregroundSessionId) renderForeground(id, lifecycleGeneration);
	}

	pi.on("session_tree", async (_event, ctx) => reconstructAndRender(ctx));
	pi.on("session_compact", async (_event, ctx) => reconstructAndRender(ctx));

	pi.on("context", async (event, ctx) => {
		const messages = event.messages.filter(
			(message) => !(message.role === "custom" && message.customType === CONTEXT_TYPE),
		);
		const content = buildTaskContext(storeFor(ctx).getTasks());
		if (content) {
			messages.push({
				role: "custom",
				customType: CONTEXT_TYPE,
				content,
				display: false,
				timestamp: Date.now(),
			});
		}
		return { messages };
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		const id = ctx.sessionManager.getSessionId();
		stores.delete(id);
		if (id !== foregroundSessionId) return;
		lifecycleGeneration += 1;
		try {
			foregroundUi?.setWidget(WIDGET_KEY, undefined);
		} catch (error) {
			if (!String(error).includes("stale after session replacement")) throw error;
		} finally {
			widget = undefined;
			foregroundUi = undefined;
			foregroundSessionId = "";
		}
	});
}

export type { TodoParams };
export { TODO_PROMPT_GUIDELINES, TodoParamsSchema };
