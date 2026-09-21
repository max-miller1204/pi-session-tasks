import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import type { Task } from "../src/types.ts";
import { TaskWidget } from "../src/widget.ts";

const theme = {
	fg: (_color: string, value: string) => value,
	bold: (value: string) => value,
} as unknown as Theme;

describe("TaskWidget", () => {
	it("shows three unfinished tasks, counts, and overflow", () => {
		const widget = new TaskWidget(
			() => [
				{ id: "a", title: "Active", status: "doing" },
				{ id: "b", title: "Next", status: "todo" },
				{ id: "c", title: "Third", status: "todo" },
				{ id: "d", title: "Fourth", status: "todo" },
				{ id: "e", title: "Finished", status: "done" },
			],
			theme,
		);
		expect(widget.render(80)).toEqual(["Tasks (1/5)", "◐ Active", "○ Next", "○ Third", "+1 more"]);
	});

	it("sanitizes and truncates titles to the render width", () => {
		const widget = new TaskWidget(
			() => [{ id: "a", title: "\u001b[31mA very long 👨‍👩‍👧‍👦 task title", status: "todo" }],
			theme,
		);
		const lines = widget.render(16);
		expect(lines[1]).not.toContain("\u001b");
		expect(lines[1]).not.toContain("�");
		expect(lines[1]?.length).toBeGreaterThan(0);
		expect(lines.every((line) => visibleWidth(line) <= 16)).toBe(true);
	});

	it("shows a summary when all tasks are complete", () => {
		const widget = new TaskWidget(
			() => [
				{ id: "a", title: "First", status: "done" },
				{ id: "b", title: "Second", status: "done" },
			],
			theme,
		);
		expect(widget.render(80)).toEqual(["Tasks (2/2)"]);
	});

	it("returns no lines when there are no tasks", () => {
		const widget = new TaskWidget(() => [], theme);
		expect(widget.render(80)).toEqual([]);
	});

	it("keeps every line within widths from one through ten", () => {
		const widget = new TaskWidget(
			() => [
				{ id: "a", title: "A long title", status: "doing" },
				{ id: "b", title: "Another long title", status: "todo" },
				{ id: "c", title: "Third title", status: "todo" },
				{ id: "d", title: "Fourth title", status: "todo" },
			],
			theme,
		);
		for (let width = 1; width <= 10; width += 1) {
			expect(widget.render(width).every((line) => visibleWidth(line) <= width)).toBe(true);
		}
	});

	it("shows several doing tasks in canonical order", () => {
		const widget = new TaskWidget(
			() => [
				{ id: "a", title: "First", status: "doing" },
				{ id: "b", title: "Second", status: "doing" },
				{ id: "c", title: "Third", status: "doing" },
			],
			theme,
		);
		expect(widget.render(80)).toEqual(["Tasks (0/3)", "◐ First", "◐ Second", "◐ Third"]);
	});

	it("refreshes cached output after task changes and invalidate", () => {
		const tasks: Task[] = [{ id: "a", title: "Before", status: "todo" }];
		const widget = new TaskWidget(() => tasks, theme);
		expect(widget.render(80)[1]).toBe("○ Before");
		tasks[0] = { id: "a", title: "After", status: "doing" };
		widget.invalidate();
		expect(widget.render(80)[1]).toBe("◐ After");
	});
});
