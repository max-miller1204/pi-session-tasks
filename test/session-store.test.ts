import { describe, expect, it } from "vitest";
import { SessionStore, SNAPSHOT_TYPE, type SnapshotEntry } from "../src/session-store.ts";

function snapshot(id: string, data: unknown): SnapshotEntry {
	return { type: "custom", id, customType: SNAPSHOT_TYPE, data };
}

describe("SessionStore", () => {
	it("reconstructs the latest snapshot on the active branch", () => {
		const store = new SessionStore(
			() => undefined,
			() => "unused",
		);
		store.reconstruct([
			snapshot("first", { version: 1, tasks: [{ id: "a", title: "A", status: "todo" }] }),
			{ type: "custom", id: "other", customType: "other-extension", data: {} },
			snapshot("latest", { version: 1, tasks: [{ id: "b", title: "B", status: "doing" }] }),
		]);
		expect(store.getTasks()).toEqual([{ id: "b", title: "B", status: "doing" }]);
	});

	it("fails on a corrupt latest snapshot instead of restoring an earlier valid snapshot", () => {
		const store = new SessionStore(
			() => undefined,
			() => "unused",
		);
		expect(() =>
			store.reconstruct([
				snapshot("valid", { version: 1, tasks: [{ id: "a", title: "A", status: "todo" }] }),
				snapshot("corrupt", {
					version: 1,
					tasks: [{ id: 7, title: "Broken", status: "todo" }],
				}),
			]),
		).toThrow("Invalid pi-session-tasks snapshot at entry corrupt");
	});

	it("fails on an unsupported latest snapshot version", () => {
		const store = new SessionStore(
			() => undefined,
			() => "unused",
		);
		expect(() => store.reconstruct([snapshot("future", { version: 2, tasks: [] })])).toThrow(
			"Unsupported pi-session-tasks snapshot version 2 at entry future",
		);
	});

	it("uses an empty task list when no snapshot exists", () => {
		const store = new SessionStore(
			() => undefined,
			() => "unused",
		);
		store.reconstruct([{ type: "custom", customType: "other-extension", data: {} }]);
		expect(store.getTasks()).toEqual([]);
	});

	it("rejects duplicate task IDs", () => {
		const store = new SessionStore(
			() => undefined,
			() => "unused",
		);
		expect(() =>
			store.reconstruct([
				snapshot("duplicates", {
					version: 1,
					tasks: [
						{ id: "same", title: "First", status: "todo" },
						{ id: "same", title: "Second", status: "done" },
					],
				}),
			]),
		).toThrow("Invalid pi-session-tasks snapshot at entry duplicates:");
	});

	it("rejects titles over 256 UTF-8 bytes", () => {
		const store = new SessionStore(
			() => undefined,
			() => "unused",
		);
		expect(() =>
			store.reconstruct([
				snapshot("large-title", {
					version: 1,
					tasks: [{ id: "a", title: "é".repeat(129), status: "todo" }],
				}),
			]),
		).toThrow("Invalid pi-session-tasks snapshot at entry large-title:");
	});

	it("rejects snapshots with over 100 tasks", () => {
		const store = new SessionStore(
			() => undefined,
			() => "unused",
		);
		const tasks = Array.from({ length: 101 }, (_, index) => ({
			id: `task-${index}`,
			title: "Task",
			status: "todo",
		}));
		expect(() => store.reconstruct([snapshot("too-many", { version: 1, tasks })])).toThrow(
			"Invalid pi-session-tasks snapshot at entry too-many:",
		);
	});

	it("rejects an invalid task status", () => {
		const store = new SessionStore(
			() => undefined,
			() => "unused",
		);
		expect(() =>
			store.reconstruct([
				snapshot("bad-status", {
					version: 1,
					tasks: [{ id: "a", title: "A", status: "blocked" }],
				}),
			]),
		).toThrow("Invalid pi-session-tasks snapshot at entry bad-status:");
	});

	it("ignores unknown snapshot and task fields", () => {
		const store = new SessionStore(
			() => undefined,
			() => "unused",
		);
		store.reconstruct([
			snapshot("extra-fields", {
				version: 1,
				metadata: "ignored",
				tasks: [{ id: "a", title: "A", status: "done", transient: true }],
			}),
		]);
		expect(store.getTasks()).toEqual([{ id: "a", title: "A", status: "done" }]);
	});

	it("returns defensive task copies", () => {
		const store = new SessionStore(
			() => undefined,
			() => "unused",
		);
		store.reconstruct([snapshot("valid", { version: 1, tasks: [{ id: "a", title: "A", status: "todo" }] })]);
		const tasks = store.getTasks();
		tasks[0].title = "Changed";
		tasks.push({ id: "b", title: "B", status: "done" });
		expect(store.getTasks()).toEqual([{ id: "a", title: "A", status: "todo" }]);
	});

	it("appends one complete snapshot for a change and none for a no-op", async () => {
		const entries: Array<{ customType: string; data: unknown }> = [];
		const store = new SessionStore(
			(customType, data) => entries.push({ customType, data }),
			() => "st-1",
		);

		await store.execute({ action: "create", title: "Test" });
		await store.execute({ action: "update", id: "st-1", status: "todo" });

		expect(entries).toEqual([
			{
				customType: SNAPSHOT_TYPE,
				data: { version: 1, tasks: [{ id: "st-1", title: "Test", status: "todo" }] },
			},
		]);
	});

	it("serializes concurrent mutations in call order", async () => {
		const snapshots: unknown[] = [];
		const ids = ["st-1", "st-2"];
		const store = new SessionStore(
			(_type, data) => snapshots.push(data),
			() => {
				const id = ids.shift();
				if (!id) throw new Error("Test ID sequence exhausted.");
				return id;
			},
		);

		const first = store.execute({ action: "create", title: "First" });
		const noOpAfterFirst = store.execute({ action: "update", id: "st-1", status: "todo" });
		const second = store.execute({ action: "create", title: "Second" });
		await Promise.all([first, noOpAfterFirst, second]);

		expect(store.getTasks().map(({ id }) => id)).toEqual(["st-1", "st-2"]);
		expect(snapshots).toHaveLength(2);
	});

	it("keeps state after append failure and continues queued mutations", async () => {
		let appendCount = 0;
		const store = new SessionStore(
			() => {
				appendCount += 1;
				if (appendCount === 1) throw new Error("Append failed.");
			},
			() => `st-${appendCount + 1}`,
		);

		const failed = store.execute({ action: "create", title: "Not saved" });
		const next = store.execute({ action: "create", title: "Saved" });

		await expect(failed).rejects.toThrow("Append failed.");
		await expect(next).resolves.toMatchObject({ changed: true });
		expect(store.getTasks()).toEqual([{ id: "st-2", title: "Saved", status: "todo" }]);
	});
});
