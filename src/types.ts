export const MAX_TASKS = 100;
export const MAX_TITLE_BYTES = 256;

export type TaskStatus = "todo" | "doing" | "done";

export interface Task {
	id: string;
	title: string;
	status: TaskStatus;
}

export interface TaskCounts {
	todo: number;
	doing: number;
	done: number;
	total: number;
}

export type TaskPlacement = { beforeId: string; afterId?: never } | { beforeId?: never; afterId: string };

export type TaskOperation =
	| { action: "list" }
	| ({ action: "create"; title: string } & Partial<TaskPlacement>)
	| { action: "update"; id: string; title?: string; status?: TaskStatus }
	| ({ action: "move"; id: string } & Partial<TaskPlacement>)
	| { action: "delete"; id: string }
	| { action: "clear" };

export interface TaskOperationResult {
	action: TaskOperation["action"];
	changed: boolean;
	tasks: Task[];
	counts: TaskCounts;
	task?: Task;
	deletedTaskId?: string;
}
