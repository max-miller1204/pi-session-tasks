import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import { describe, expect, it, vi } from "vitest";
import extension from "../src/extension.ts";
import { CONTEXT_TYPE } from "../src/model-context.ts";
import { SNAPSHOT_TYPE, type SnapshotEntry } from "../src/session-store.ts";
import { type TodoParams, TodoParamsSchema, toTaskOperation } from "../src/tool-schema.ts";

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;

function snapshot(id: string, tasks: Array<{ id: string; title: string; status: string }>): SnapshotEntry {
	return { type: "custom", id, customType: SNAPSHOT_TYPE, data: { version: 1, tasks } };
}

function harness() {
	let tool: ToolDefinition<typeof TodoParamsSchema, unknown> | undefined;
	let commandName = "";
	let command: { handler: (args: string, ctx: ExtensionContext) => Promise<void> } | undefined;
	const handlers = new Map<string, Handler>();
	const appended: Array<{ customType: string; data: unknown }> = [];
	const pi = {
		registerTool: (value: ToolDefinition<typeof TodoParamsSchema, unknown>) => {
			tool = value;
		},
		registerCommand: (name: string, value: typeof command) => {
			commandName = name;
			command = value;
		},
		on: (name: string, handler: Handler) => {
			handlers.set(name, handler);
			return () => undefined;
		},
		appendEntry: (customType: string, data: unknown) => appended.push({ customType, data }),
	} as unknown as ExtensionAPI;
	extension(pi);
	return {
		get tool() {
			if (!tool) throw new Error("Tool was not registered.");
			return tool;
		},
		get command() {
			if (!command) throw new Error("Command was not registered.");
			return command;
		},
		get commandName() {
			return commandName;
		},
		handlers,
		appended,
	};
}

function context(id: string, branch: SnapshotEntry[] = [], hasUI = true) {
	const widgets: unknown[] = [];
	const notifications: Array<[string, string | undefined]> = [];
	const ui = {
		setWidget: vi.fn((_key: string, value: unknown) => {
			widgets.push(value);
		}),
		notify: vi.fn((message: string, level?: string) => {
			notifications.push([message, level]);
		}),
	};
	const ctx = {
		hasUI,
		mode: hasUI ? "tui" : "print",
		ui,
		sessionManager: {
			getSessionId: () => id,
			getBranch: () => branch,
		},
	} as unknown as ExtensionContext;
	return { ctx, ui, widgets, notifications, branch };
}

async function start(h: ReturnType<typeof harness>, ctx: ExtensionContext, reason = "startup") {
	await h.handlers.get("session_start")?.({ type: "session_start", reason }, ctx);
}

async function execute(
	h: ReturnType<typeof harness>,
	ctx: ExtensionContext,
	params: Record<string, unknown>,
) {
	return h.tool.execute("call", params as TodoParams, undefined, undefined, ctx);
}

describe("extension registration and todo tool", () => {
	it("registers the public integration surface", () => {
		const h = harness();
		expect(h.tool.name).toBe("todo");
		expect(h.tool.executionMode).toBe("sequential");
		expect(h.commandName).toBe("tasks");
		expect([...h.handlers.keys()].sort()).toEqual([
			"context",
			"session_compact",
			"session_shutdown",
			"session_start",
			"session_tree",
		]);
	});

	it("uses string enums and validates every valid action shape", () => {
		expect((TodoParamsSchema.properties.action as unknown as { enum: string[] }).enum).toEqual([
			"list",
			"create",
			"update",
			"move",
			"delete",
			"clear",
		]);
		expect((TodoParamsSchema.properties.status as unknown as { enum: string[] }).enum).toEqual([
			"todo",
			"doing",
			"done",
		]);
		for (const value of [
			{ action: "list" },
			{ action: "create", title: "Write tests", beforeId: "a" },
			{ action: "update", id: "a", title: "New", status: "doing" },
			{ action: "move", id: "a", afterId: "b" },
			{ action: "delete", id: "a" },
			{ action: "clear" },
		]) {
			expect(Value.Check(TodoParamsSchema, value)).toBe(true);
		}
	});

	it("rejects missing and unsupported cross-field arguments", () => {
		for (const value of [
			{ action: "list", id: "a" },
			{ action: "create" },
			{ action: "create", title: "A", status: "doing" },
			{ action: "update", id: "a" },
			{ action: "update", id: "a", beforeId: "b", title: "A" },
			{ action: "move", id: "a" },
			{ action: "move", id: "a", beforeId: "b", afterId: "c" },
			{ action: "delete", id: "a", title: "A" },
			{ action: "clear", status: "done" },
			{ action: "clear", unexpected: "value" },
		]) {
			expect(() => toTaskOperation(value as TodoParams)).toThrow();
		}
	});

	it("executes all actions and bounds result details", async () => {
		const h = harness();
		const a = context("a", [], false);
		await start(h, a.ctx);
		const created = await execute(h, a.ctx, { action: "create", title: "First" });
		const id = (created.details as { task: { id: string } }).task.id;
		const second = await execute(h, a.ctx, { action: "create", title: "Second" });
		const secondId = (second.details as { task: { id: string } }).task.id;
		for (const [params, keys] of [
			[{ action: "update", id, status: "doing" }, ["action", "changed", "counts", "task"]],
			[{ action: "move", id, afterId: secondId }, ["action", "changed", "counts", "task"]],
			[{ action: "list" }, ["action", "changed", "counts", "tasks"]],
			[{ action: "delete", id }, ["action", "changed", "counts", "deletedTaskId"]],
			[{ action: "clear" }, ["action", "changed", "counts"]],
		] as const) {
			const result = await execute(h, a.ctx, params);
			expect(Object.keys(result.details as object).sort()).toEqual([...keys].sort());
		}
		expect(Object.keys(created.details as object).sort()).toEqual(["action", "changed", "counts", "task"]);
	});
});

describe("session lifecycle", () => {
	it("reconstructs independent start branches, including a new empty branch", async () => {
		const h = harness();
		const a = context("a", [snapshot("a1", [{ id: "a", title: "A", status: "todo" }])], false);
		const b = context("b", [snapshot("b1", [{ id: "b", title: "B", status: "doing" }])], false);
		const fresh = context("fresh", [], false);
		await start(h, a.ctx);
		await start(h, b.ctx, "resume");
		await start(h, fresh.ctx, "new");
		expect((await execute(h, a.ctx, { action: "list" })).content[0]).toMatchObject({
			text: expect.stringContaining("A"),
		});
		expect((await execute(h, b.ctx, { action: "list" })).content[0]).toMatchObject({
			text: expect.stringContaining("B"),
		});
		expect((await execute(h, fresh.ctx, { action: "list" })).content[0]).toMatchObject({
			text: "No session tasks.",
		});
	});

	it.each(["resume", "fork", "clone"])("reconstructs inherited snapshots for %s", async (reason) => {
		const h = harness();
		const inherited = context(
			"child",
			[snapshot("parent", [{ id: "p", title: "Parent", status: "todo" }])],
			false,
		);
		await start(h, inherited.ctx, reason);
		expect((await execute(h, inherited.ctx, { action: "list" })).content[0]).toMatchObject({
			text: expect.stringContaining("Parent"),
		});
	});

	it("reconstructs after tree navigation and compaction", async () => {
		const h = harness();
		const branch = [snapshot("one", [{ id: "one", title: "One", status: "todo" }])];
		const a = context("a", branch, false);
		await start(h, a.ctx);
		branch.push(snapshot("two", [{ id: "two", title: "Two", status: "doing" }]));
		await h.handlers.get("session_tree")?.({}, a.ctx);
		expect((await execute(h, a.ctx, { action: "list" })).content[0]).toMatchObject({
			text: expect.stringContaining("Two"),
		});
		branch.push(snapshot("three", [{ id: "three", title: "Three", status: "done" }]));
		await h.handlers.get("session_compact")?.({}, a.ctx);
		expect((await execute(h, a.ctx, { action: "list" })).content[0]).toMatchObject({
			text: expect.stringContaining("Three"),
		});
	});

	it("replaces stale model context with one current hidden message", async () => {
		const h = harness();
		const a = context("a", [snapshot("a1", [{ id: "a", title: "A", status: "todo" }])], false);
		await start(h, a.ctx);
		const stale = { role: "custom", customType: CONTEXT_TYPE, content: "old", display: false, timestamp: 1 };
		const keep = { role: "user", content: "hello", timestamp: 1 };
		const result = (await h.handlers.get("context")?.({ messages: [stale, keep] }, a.ctx)) as {
			messages: Array<Record<string, unknown>>;
		};
		expect(result.messages).toHaveLength(2);
		expect(result.messages[0]).toBe(keep);
		expect(result.messages[1]).toMatchObject({ role: "custom", customType: CONTEXT_TYPE, display: false });
		expect(result.messages[1].content).not.toBe("old");
	});

	it("removes stale context and adds none when all tasks are done", async () => {
		const h = harness();
		const a = context("a", [snapshot("a1", [{ id: "a", title: "A", status: "done" }])], false);
		await start(h, a.ctx);
		const result = (await h.handlers.get("context")?.(
			{ messages: [{ role: "custom", customType: CONTEXT_TYPE }] },
			a.ctx,
		)) as { messages: unknown[] };
		expect(result.messages).toEqual([]);
	});

	it("keeps foreground widget ownership across background mutation and shutdown", async () => {
		const h = harness();
		const front = context("front");
		const back = context("back");
		await start(h, front.ctx);
		await start(h, back.ctx);
		const frontCalls = front.ui.setWidget.mock.calls.length;
		await execute(h, back.ctx, { action: "create", title: "Background" });
		expect(front.ui.setWidget).toHaveBeenCalledTimes(frontCalls);
		expect(back.ui.setWidget).not.toHaveBeenCalled();
		await h.handlers.get("session_shutdown")?.({}, back.ctx);
		expect(front.ui.setWidget).toHaveBeenCalledTimes(frontCalls);
	});

	it("suppresses only stale-context shutdown cleanup errors", async () => {
		const h = harness();
		const stale = context("stale");
		await start(h, stale.ctx);
		stale.ui.setWidget.mockImplementation(() => {
			throw new Error("Extension context is stale after session replacement");
		});
		await expect(h.handlers.get("session_shutdown")?.({}, stale.ctx)).resolves.toBeUndefined();

		const bad = context("bad");
		bad.ui.setWidget
			.mockImplementationOnce(() => undefined)
			.mockImplementationOnce(() => {
				throw new Error("Widget failed");
			});
		await start(h, bad.ctx);
		await expect(h.handlers.get("session_shutdown")?.({}, bad.ctx)).rejects.toThrow("Widget failed");
	});

	it("prevents a delayed old-generation refresh from repainting a replacement", async () => {
		const h = harness();
		const a = context("a");
		await start(h, a.ctx);
		const delayedA = execute(h, a.ctx, { action: "create", title: "A" });
		await h.handlers.get("session_shutdown")?.({}, a.ctx);
		const b = context("b", [snapshot("b1", [{ id: "b", title: "B", status: "doing" }])]);
		await start(h, b.ctx);
		const bCalls = b.ui.setWidget.mock.calls.length;
		await delayedA;
		expect(b.ui.setWidget).toHaveBeenCalledTimes(bCalls);
		expect(b.widgets.at(-1)).toEqual(expect.any(Function));
	});

	it("shows the current branch through the read-only command", async () => {
		const h = harness();
		const a = context("a", [snapshot("a1", [{ id: "a", title: "A", status: "todo" }])]);
		await start(h, a.ctx);
		await h.command.handler("", a.ctx);
		expect(a.notifications).toEqual([[expect.stringContaining("A"), "info"]]);
		expect(h.appended).toEqual([]);
	});
});
