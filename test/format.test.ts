import type { Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { formatTaskList, formatToolCall, formatToolContent, formatToolResult } from "../src/format.ts";
import type { Task, TaskOperationResult } from "../src/types.ts";

const theme = {
	fg: (_color: string, value: string) => value,
	bold: (value: string) => value,
} as unknown as Theme;

function result(
	action: TaskOperationResult["action"],
	tasks: Task[],
	extra: Partial<TaskOperationResult> = {},
): TaskOperationResult {
	const counts = {
		todo: tasks.filter((task) => task.status === "todo").length,
		doing: tasks.filter((task) => task.status === "doing").length,
		done: tasks.filter((task) => task.status === "done").length,
		total: tasks.length,
	};
	return { action, changed: action !== "list", tasks, counts, ...extra };
}

function renderText(component: { render(width: number): string[] }): string {
	return component
		.render(200)
		.map((line) => line.trimEnd())
		.join("\n");
}

describe("formatTaskList", () => {
	it("groups statuses and preserves canonical order inside each group", () => {
		const tasks: Task[] = [
			{ id: "st-1", title: "First todo", status: "todo" },
			{ id: "st-2", title: "First done", status: "done" },
			{ id: "st-3", title: "First doing", status: "doing" },
			{ id: "st-4", title: "Second todo", status: "todo" },
			{ id: "st-5", title: "Second doing", status: "doing" },
		];
		expect(formatTaskList(tasks)).toBe(
			"Doing\n  ◐ st-3: First doing\n  ◐ st-5: Second doing\nTodo\n  ○ st-1: First todo\n  ○ st-4: Second todo\nDone\n  ✓ st-2: First done",
		);
	});

	it("reports an empty list", () => {
		expect(formatTaskList([])).toBe("No session tasks.");
	});

	it("sanitizes every title", () => {
		const tasks: Task[] = [
			{ id: "a", title: "\u001b[31mDoing\nunsafe", status: "doing" },
			{ id: "b", title: "\u001b]8;;bad\u0007Todo", status: "todo" },
			{ id: "c", title: "Done\u202etest", status: "done" },
		];
		const text = formatTaskList(tasks);
		expect(text).not.toContain("\u001b");
		expect(text).not.toContain("\nunsafe");
		expect(text).not.toContain("\u202e");
	});
});

describe("tool formatting", () => {
	const tasks = Array.from(
		{ length: 7 },
		(_, index): Task => ({
			id: `st-${index + 1}`,
			title: `Task ${index + 1}`,
			status: index % 3 === 0 ? "doing" : index % 3 === 1 ? "todo" : "done",
		}),
	);

	it("collapses list results to five task rows and an overflow count", () => {
		const text = renderText(formatToolResult(result("list", tasks), false, theme));
		expect(text).toContain("st-1: Task 1");
		expect(text).toContain("st-5: Task 5");
		expect(text).not.toContain("st-6: Task 6");
		expect(text).toContain("+2 more");
	});

	it("shows every list task when expanded", () => {
		const text = renderText(formatToolResult(result("list", tasks), true, theme));
		for (const task of tasks) expect(text).toContain(`${task.id}: ${task.title}`);
		expect(text).not.toContain("more");
	});

	it("returns concise mutation content for the model", () => {
		const task = { id: "st-1", title: "Write tests", status: "todo" } as const;
		expect(formatToolContent(result("create", [task], { task }))).toBe(
			"Created session task st-1: Write tests",
		);
		expect(formatToolContent(result("update", [task], { task }))).toBe("Updated session task st-1");
		expect(formatToolContent(result("move", [task], { task }))).toBe("Moved session task st-1");
		expect(formatToolContent(result("delete", [], { deletedTaskId: "st-1" }))).toBe(
			"Deleted session task st-1",
		);
		expect(formatToolContent(result("clear", []))).toBe("Cleared all session tasks");
		expect(formatToolContent(result("clear", [], { changed: false }))).toBe("Session tasks already empty");
	});

	it("uses the same concise text in mutation result components", () => {
		const task = { id: "st-1", title: "Write tests", status: "todo" } as const;
		expect(renderText(formatToolResult(result("create", [task], { task }), false, theme))).toBe(
			"Created session task st-1: Write tests",
		);
	});

	it("sanitizes titles at tool display boundaries", () => {
		const task = { id: "st-1", title: "\u001b[31mWrite\ntests", status: "todo" } as const;
		expect(formatToolContent(result("create", [task], { task }))).not.toContain("\u001b");
		expect(renderText(formatToolResult(result("list", [task]), true, theme))).not.toContain("\u001b");
		expect(renderText(formatToolCall({ action: "create", title: task.title }, theme))).not.toContain(
			"\u001b",
		);
	});
});
