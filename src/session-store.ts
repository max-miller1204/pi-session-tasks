import { randomUUID } from "node:crypto";
import { applyTaskOperation } from "./task-service.ts";
import {
	MAX_TASKS,
	MAX_TITLE_BYTES,
	type Task,
	type TaskOperation,
	type TaskOperationResult,
	type TaskStatus,
} from "./types.ts";

export const SNAPSHOT_TYPE = "pi-session-tasks-snapshot";
export const SNAPSHOT_VERSION = 1;

export interface SessionSnapshot {
	version: 1;
	tasks: Task[];
}

export interface SnapshotEntry {
	type: string;
	id?: string;
	customType?: string;
	data?: unknown;
}

export type AppendSnapshot = (customType: string, data: SessionSnapshot) => void;

function invalidSnapshot(entryId: string, reason: string): never {
	throw new Error(`Invalid pi-session-tasks snapshot at entry ${entryId}: ${reason}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTaskStatus(value: unknown): value is TaskStatus {
	return value === "todo" || value === "doing" || value === "done";
}

function parseSnapshot(data: unknown, entryId: string): Task[] {
	if (!isObject(data)) invalidSnapshot(entryId, "snapshot must be an object");
	if (typeof data.version === "number" && data.version > SNAPSHOT_VERSION) {
		throw new Error(`Unsupported pi-session-tasks snapshot version ${data.version} at entry ${entryId}`);
	}
	if (data.version !== SNAPSHOT_VERSION) invalidSnapshot(entryId, "version must be 1");
	if (!Array.isArray(data.tasks)) invalidSnapshot(entryId, "tasks must be an array");
	if (data.tasks.length > MAX_TASKS) invalidSnapshot(entryId, "tasks must contain at most 100 items");

	const ids = new Set<string>();
	const tasks = data.tasks.map((value, index): Task => {
		if (!isObject(value)) invalidSnapshot(entryId, `task ${index} must be an object`);
		const { id, title, status } = value;
		if (typeof id !== "string" || id.length === 0) {
			invalidSnapshot(entryId, `task ${index} id must be a non-empty string`);
		}
		if (ids.has(id)) invalidSnapshot(entryId, `task ${index} id must be unique`);
		ids.add(id);
		if (
			typeof title !== "string" ||
			Buffer.byteLength(title, "utf8") < 1 ||
			Buffer.byteLength(title, "utf8") > MAX_TITLE_BYTES
		) {
			invalidSnapshot(entryId, `task ${index} title must be from 1 through 256 UTF-8 bytes`);
		}
		if (!isTaskStatus(status)) invalidSnapshot(entryId, `task ${index} status is not supported`);
		return { id, title, status };
	});

	return tasks;
}

export class SessionStore {
	private tasks: Task[] = [];
	private queue: Promise<unknown> = Promise.resolve();

	constructor(
		private readonly appendSnapshot: AppendSnapshot,
		private readonly createId: () => string = () => `st-${randomUUID()}`,
	) {}

	reconstruct(entries: readonly SnapshotEntry[]): void {
		const latest = [...entries]
			.reverse()
			.find((entry) => entry.type === "custom" && entry.customType === SNAPSHOT_TYPE);
		this.tasks = latest ? parseSnapshot(latest.data, latest.id ?? "unknown") : [];
	}

	getTasks(): Task[] {
		return this.tasks.map((task) => ({ ...task }));
	}

	execute(operation: TaskOperation): Promise<TaskOperationResult> {
		const next = this.queue.then(() => {
			const result = applyTaskOperation(this.tasks, operation, this.createId);
			if (result.changed) {
				this.appendSnapshot(SNAPSHOT_TYPE, { version: SNAPSHOT_VERSION, tasks: result.tasks });
				this.tasks = result.tasks;
			}
			return { ...result, tasks: result.tasks.map((task) => ({ ...task })) };
		});
		this.queue = next.catch(() => undefined);
		return next;
	}
}
