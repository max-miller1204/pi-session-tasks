import { describe, expect, it } from "vitest";
import { applyTaskOperation } from "../src/task-service.ts";
import { MAX_TASKS, type Task, type TaskOperation } from "../src/types.ts";

const ids = ["st-a", "st-b", "st-c"];
const createId = () => {
	const id = ids.shift();
	if (!id) throw new Error("Test ID sequence exhausted.");
	return id;
};

describe("applyTaskOperation", () => {
	it("creates, updates, moves, deletes, and clears tasks without mutating input", () => {
		const original: Task[] = [
			{ id: "anchor", title: "Anchor", status: "todo" },
			{ id: "done", title: "Done", status: "done" },
		];
		const created = applyTaskOperation(
			original,
			{ action: "create", title: "Implement", beforeId: "anchor" },
			createId,
		);
		expect(original.map(({ id }) => id)).toEqual(["anchor", "done"]);
		expect(created.tasks.map(({ id }) => id)).toEqual(["st-a", "anchor", "done"]);

		const updated = applyTaskOperation(
			created.tasks,
			{ action: "update", id: "st-a", title: "Implement safely", status: "doing" },
			createId,
		);
		expect(updated.task).toEqual({ id: "st-a", title: "Implement safely", status: "doing" });

		const moved = applyTaskOperation(
			updated.tasks,
			{ action: "move", id: "st-a", afterId: "done" },
			createId,
		);
		expect(moved.tasks.map(({ id }) => id)).toEqual(["anchor", "done", "st-a"]);

		const deleted = applyTaskOperation(moved.tasks, { action: "delete", id: "anchor" }, createId);
		expect(deleted.deletedTaskId).toBe("anchor");

		const cleared = applyTaskOperation(deleted.tasks, { action: "clear" }, createId);
		expect(cleared.tasks).toEqual([]);
		expect(cleared.counts).toEqual({ todo: 0, doing: 0, done: 0, total: 0 });
	});

	it("allows several doing tasks", () => {
		const tasks: Task[] = [
			{ id: "a", title: "A", status: "doing" },
			{ id: "b", title: "B", status: "todo" },
		];
		const result = applyTaskOperation(tasks, { action: "update", id: "b", status: "doing" }, createId);
		expect(result.tasks.map(({ status }) => status)).toEqual(["doing", "doing"]);
	});

	it("rejects blank and oversized titles and the 101st task", () => {
		expect(() => applyTaskOperation([], { action: "create", title: "  " }, createId)).toThrow(
			"title must not be blank",
		);
		expect(() => applyTaskOperation([], { action: "create", title: "🙂".repeat(65) }, createId)).toThrow(
			"title must be at most 256 UTF-8 bytes",
		);
		const full = Array.from({ length: MAX_TASKS }, (_, index) => ({
			id: `st-${index}`,
			title: `Task ${index}`,
			status: "todo" as const,
		}));
		expect(() => applyTaskOperation(full, { action: "create", title: "Overflow" }, createId)).toThrow(
			"session task limit is 100",
		);
	});

	it("rejects unknown IDs and invalid placement anchors", () => {
		const tasks: Task[] = [{ id: "a", title: "A", status: "todo" }];
		expect(() =>
			applyTaskOperation(tasks, { action: "update", id: "missing", title: "B" }, createId),
		).toThrow("session task missing not found");
		expect(() => applyTaskOperation(tasks, { action: "delete", id: "missing" }, createId)).toThrow(
			"session task missing not found",
		);
		expect(() =>
			applyTaskOperation(tasks, { action: "create", title: "B", beforeId: "missing" }, createId),
		).toThrow("session task anchor missing not found");
		expect(() =>
			applyTaskOperation(
				tasks,
				{ action: "move", id: "a", beforeId: "a", afterId: "a" } as unknown as TaskOperation,
				createId,
			),
		).toThrow("beforeId and afterId are mutually exclusive");
	});

	it("requires move placement and handles self or already-satisfied moves as no-ops", () => {
		const tasks: Task[] = [
			{ id: "a", title: "A", status: "todo" },
			{ id: "b", title: "B", status: "todo" },
			{ id: "c", title: "C", status: "todo" },
		];
		expect(() => applyTaskOperation(tasks, { action: "move", id: "b" }, createId)).toThrow(
			"move requires exactly one of beforeId or afterId",
		);
		const self = applyTaskOperation(tasks, { action: "move", id: "b", beforeId: "b" }, createId);
		expect(self.changed).toBe(false);
		expect(self.tasks).toEqual(tasks);
		const satisfied = applyTaskOperation(tasks, { action: "move", id: "b", afterId: "a" }, createId);
		expect(satisfied.changed).toBe(false);
		expect(satisfied.tasks).toEqual(tasks);
	});

	it("requires update fields and reports unchanged updates", () => {
		const tasks: Task[] = [{ id: "a", title: "A", status: "todo" }];
		expect(() => applyTaskOperation(tasks, { action: "update", id: "a" }, createId)).toThrow(
			"update requires at least one mutable field",
		);
		const unchanged = applyTaskOperation(
			tasks,
			{ action: "update", id: "a", title: " A ", status: "todo" },
			createId,
		);
		expect(unchanged.changed).toBe(false);
		expect(unchanged.task).toEqual(tasks[0]);
		const changed = applyTaskOperation(
			tasks,
			{ action: "update", id: "a", title: "B", status: "done" },
			createId,
		);
		expect(changed.changed).toBe(true);
		expect(changed.task).toEqual({ id: "a", title: "B", status: "done" });
	});

	it("lists and clears without changing empty task lists", () => {
		const tasks: Task[] = [];
		const listed = applyTaskOperation(tasks, { action: "list" }, createId);
		expect(listed.changed).toBe(false);
		expect(listed.tasks).toEqual([]);
		const cleared = applyTaskOperation(tasks, { action: "clear" }, createId);
		expect(cleared.changed).toBe(false);
		expect(cleared.tasks).toEqual([]);
	});
});
