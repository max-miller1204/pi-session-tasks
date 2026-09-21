import { describe, expect, it } from "vitest";
import { buildTaskContext, CONTEXT_LIMITS, CONTEXT_PREAMBLE } from "../src/model-context.ts";
import type { Task } from "../src/types.ts";

function parseContext(content: string) {
	return JSON.parse(content.slice(content.indexOf("\n") + 1));
}

describe("buildTaskContext", () => {
	it("projects only the first eight unfinished tasks and reports omissions", () => {
		const tasks: Task[] = [
			{ id: "done", title: "Finished", status: "done" },
			...Array.from({ length: 10 }, (_, index) => ({
				id: `st-${index}`,
				title: `Task ${index}`,
				status: index === 0 ? ("doing" as const) : ("todo" as const),
			})),
		];
		const content = buildTaskContext(tasks);
		expect(content).toContain(CONTEXT_PREAMBLE);
		const payload = parseContext(content);
		expect(payload.incompleteTasks).toHaveLength(8);
		expect(payload.omittedIncompleteTaskCount).toBe(2);
		expect(JSON.stringify(payload)).not.toContain("Finished");
	});

	it("preserves grapheme boundaries at the projected-title byte limit", () => {
		const title = `${"a".repeat(184)}👨‍👩‍👧‍👦 trailing`;
		const content = buildTaskContext([{ id: "st-1", title, status: "todo" }]);
		const payload = parseContext(content);
		const projected = payload.incompleteTasks[0].title as string;
		expect(projected).not.toContain("�");
		expect(Buffer.byteLength(JSON.stringify(projected), "utf8") - 2).toBeLessThanOrEqual(
			CONTEXT_LIMITS.taskTitleJsonBytes,
		);
		expect(Buffer.byteLength(content, "utf8")).toBeLessThanOrEqual(CONTEXT_LIMITS.totalBytes);
	});

	it("returns an empty string when all tasks are done", () => {
		expect(buildTaskContext([{ id: "done", title: "Finished", status: "done" }])).toBe("");
	});

	it("counts JSON escapes in the title byte limit", () => {
		const title = `${'"\\\u0001'.repeat(40)} suffix`;
		const payload = parseContext(buildTaskContext([{ id: "st-1", title, status: "todo" }]));
		const projected = payload.incompleteTasks[0].title as string;
		expect(Buffer.byteLength(JSON.stringify(projected), "utf8") - 2).toBeLessThanOrEqual(
			CONTEXT_LIMITS.taskTitleJsonBytes,
		);
		expect(projected).toContain("… [truncated]");
	});

	it("keeps combining sequences as complete graphemes", () => {
		const grapheme = "e\u0301";
		const payload = parseContext(
			buildTaskContext([{ id: "st-1", title: grapheme.repeat(100), status: "todo" }]),
		);
		const projected = payload.incompleteTasks[0].title as string;
		const beforeMarker = projected.slice(0, -"… [truncated]".length);
		expect(beforeMarker.endsWith(grapheme)).toBe(true);
		expect(beforeMarker.endsWith("e")).toBe(false);
	});

	it("reports title truncation with JSON-style field paths", () => {
		const payload = parseContext(buildTaskContext([{ id: "st-1", title: "x".repeat(300), status: "todo" }]));
		expect(payload.truncatedFields).toEqual(["incompleteTasks[0].title"]);
	});

	it("does not report omissions for exactly eight unfinished tasks", () => {
		const tasks: Task[] = Array.from({ length: 8 }, (_, index) => ({
			id: `st-${index}`,
			title: `Task ${index}`,
			status: "todo",
		}));
		const payload = parseContext(buildTaskContext(tasks));
		expect(payload.incompleteTasks).toHaveLength(8);
		expect(payload).not.toHaveProperty("omittedIncompleteTaskCount");
	});

	it("drops one projected task when the complete payload exceeds 4096 bytes", () => {
		const oversizedStatus = "x".repeat(500);
		const tasks = Array.from({ length: 8 }, (_, index) => ({
			id: `st-${index}`,
			title: `Task ${index}`,
			status: oversizedStatus,
		})) as unknown as Task[];
		const content = buildTaskContext(tasks);
		const payload = parseContext(content);
		expect(payload.incompleteTasks).toHaveLength(7);
		expect(payload.omittedIncompleteTaskCount).toBe(1);
		expect(Buffer.byteLength(content, "utf8")).toBeLessThanOrEqual(CONTEXT_LIMITS.totalBytes);
	});
});
