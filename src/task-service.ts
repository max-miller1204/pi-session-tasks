import {
	MAX_TASKS,
	MAX_TITLE_BYTES,
	type Task,
	type TaskCounts,
	type TaskOperation,
	type TaskOperationResult,
	type TaskPlacement,
} from "./types.ts";

export function countTasks(tasks: readonly Task[]): TaskCounts {
	const counts = { todo: 0, doing: 0, done: 0, total: tasks.length };
	for (const task of tasks) counts[task.status] += 1;
	return counts;
}

function validatedTitle(value: string): string {
	const title = value.trim();
	if (!title) throw new Error("title must not be blank");
	if (Buffer.byteLength(title, "utf8") > MAX_TITLE_BYTES) {
		throw new Error("title must be at most 256 UTF-8 bytes");
	}
	return title;
}

function placementIndex(
	tasks: readonly Task[],
	placement: Partial<TaskPlacement>,
	required: boolean,
): number {
	if (placement.beforeId !== undefined && placement.afterId !== undefined) {
		throw new Error("beforeId and afterId are mutually exclusive");
	}
	const anchorId = placement.beforeId ?? placement.afterId;
	if (anchorId === undefined) {
		if (required) throw new Error("move requires exactly one of beforeId or afterId");
		return tasks.length;
	}
	const anchorIndex = tasks.findIndex((task) => task.id === anchorId);
	if (anchorIndex < 0) throw new Error(`session task anchor ${anchorId} not found`);
	return placement.beforeId !== undefined ? anchorIndex : anchorIndex + 1;
}

function cloneTasks(tasks: readonly Task[]): Task[] {
	return tasks.map((task) => ({ ...task }));
}

export function applyTaskOperation(
	tasks: readonly Task[],
	operation: TaskOperation,
	createId: () => string,
): TaskOperationResult {
	switch (operation.action) {
		case "list": {
			const nextTasks = cloneTasks(tasks);
			return { action: operation.action, changed: false, tasks: nextTasks, counts: countTasks(nextTasks) };
		}
		case "create": {
			if (tasks.length >= MAX_TASKS) throw new Error("session task limit is 100");
			const title = validatedTitle(operation.title);
			const nextTasks = cloneTasks(tasks);
			const task = { id: createId(), title, status: "todo" as const };
			nextTasks.splice(placementIndex(nextTasks, operation, false), 0, task);
			return {
				action: operation.action,
				changed: true,
				tasks: nextTasks,
				counts: countTasks(nextTasks),
				task: { ...task },
			};
		}
		case "update": {
			if (operation.title === undefined && operation.status === undefined) {
				throw new Error("update requires at least one mutable field");
			}
			const taskIndex = tasks.findIndex((task) => task.id === operation.id);
			if (taskIndex < 0) throw new Error(`session task ${operation.id} not found`);
			const current = tasks[taskIndex];
			const title = operation.title === undefined ? current.title : validatedTitle(operation.title);
			const status = operation.status ?? current.status;
			const changed = title !== current.title || status !== current.status;
			const nextTasks = cloneTasks(tasks);
			const task = { id: current.id, title, status };
			nextTasks[taskIndex] = task;
			return {
				action: operation.action,
				changed,
				tasks: nextTasks,
				counts: countTasks(nextTasks),
				task: { ...task },
			};
		}
		case "move": {
			const sourceIndex = tasks.findIndex((task) => task.id === operation.id);
			if (sourceIndex < 0) throw new Error(`session task ${operation.id} not found`);
			if (operation.beforeId !== undefined && operation.afterId !== undefined) {
				throw new Error("beforeId and afterId are mutually exclusive");
			}
			const anchorId = operation.beforeId ?? operation.afterId;
			if (anchorId === operation.id) {
				const nextTasks = cloneTasks(tasks);
				return {
					action: operation.action,
					changed: false,
					tasks: nextTasks,
					counts: countTasks(nextTasks),
					task: { ...nextTasks[sourceIndex] },
				};
			}
			const nextTasks = cloneTasks(tasks);
			const [source] = nextTasks.splice(sourceIndex, 1);
			const index = placementIndex(nextTasks, operation, true);
			nextTasks.splice(index, 0, source);
			const changed = nextTasks.some((task, index) => task.id !== tasks[index]?.id);
			return {
				action: operation.action,
				changed,
				tasks: nextTasks,
				counts: countTasks(nextTasks),
				task: { ...source },
			};
		}
		case "delete": {
			const taskIndex = tasks.findIndex((task) => task.id === operation.id);
			if (taskIndex < 0) throw new Error(`session task ${operation.id} not found`);
			const nextTasks = cloneTasks(tasks);
			nextTasks.splice(taskIndex, 1);
			return {
				action: operation.action,
				changed: true,
				tasks: nextTasks,
				counts: countTasks(nextTasks),
				deletedTaskId: operation.id,
			};
		}
		case "clear": {
			const nextTasks: Task[] = [];
			return {
				action: operation.action,
				changed: tasks.length > 0,
				tasks: nextTasks,
				counts: countTasks(nextTasks),
			};
		}
	}
	const exhaustive: never = operation;
	return exhaustive;
}
