import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { sanitizeTerminalText } from "./sanitize.ts";
import type { Task, TaskOperationResult, TaskStatus } from "./types.ts";

const STATUS_FORMAT: ReadonlyArray<{
	status: TaskStatus;
	heading: string;
	marker: string;
}> = [
	{ status: "doing", heading: "Doing", marker: "◐" },
	{ status: "todo", heading: "Todo", marker: "○" },
	{ status: "done", heading: "Done", marker: "✓" },
];

export function formatTaskList(tasks: readonly Task[]): string {
	if (tasks.length === 0) return "No session tasks.";

	const lines: string[] = [];
	for (const { status, heading, marker } of STATUS_FORMAT) {
		const matching = tasks.filter((task) => task.status === status);
		if (matching.length === 0) continue;
		lines.push(heading);
		for (const task of matching) {
			lines.push(`  ${marker} ${sanitizeTerminalText(task.id)}: ${sanitizeTerminalText(task.title)}`);
		}
	}
	return lines.join("\n");
}

function formatModelTaskList(tasks: readonly Task[]): string {
	if (tasks.length === 0) return "No session tasks.";
	return tasks
		.map(
			(task) =>
				`${sanitizeTerminalText(task.id)}: ${sanitizeTerminalText(task.title)} [${sanitizeTerminalText(task.status)}]`,
		)
		.join("\n");
}

function taskFromResult(result: TaskOperationResult): Task {
	if (!result.task) throw new Error(`${result.action} result requires a task`);
	return result.task;
}

function deletedIdFromResult(result: TaskOperationResult): string {
	if (!result.deletedTaskId) throw new Error("delete result requires deletedTaskId");
	return result.deletedTaskId;
}

export function formatToolContent(result: TaskOperationResult): string {
	switch (result.action) {
		case "list":
			return formatModelTaskList(result.tasks);
		case "create": {
			const task = taskFromResult(result);
			return `Created session task ${sanitizeTerminalText(task.id)}: ${sanitizeTerminalText(task.title)}`;
		}
		case "update":
			return `Updated session task ${sanitizeTerminalText(taskFromResult(result).id)}`;
		case "move":
			return `Moved session task ${sanitizeTerminalText(taskFromResult(result).id)}`;
		case "delete":
			return `Deleted session task ${sanitizeTerminalText(deletedIdFromResult(result))}`;
		case "clear":
			return result.changed ? "Cleared all session tasks" : "Session tasks already empty";
	}
}

interface DisplayCall {
	action?: string;
	title?: string;
	id?: string;
}

function formatCallText(args: DisplayCall): string {
	switch (args.action) {
		case "list":
			return "List session tasks";
		case "create":
			return args.title === undefined
				? "Create session task"
				: `Create session task: ${sanitizeTerminalText(args.title)}`;
		case "update":
			return args.id === undefined
				? "Update session task"
				: `Update session task ${sanitizeTerminalText(args.id)}`;
		case "move":
			return args.id === undefined
				? "Move session task"
				: `Move session task ${sanitizeTerminalText(args.id)}`;
		case "delete":
			return args.id === undefined
				? "Delete session task"
				: `Delete session task ${sanitizeTerminalText(args.id)}`;
		case "clear":
			return "Clear session tasks";
		case undefined:
			return "Session task arguments pending";
		default:
			return `Session task action: ${sanitizeTerminalText(args.action)}`;
	}
}

export function formatToolCall(args: DisplayCall, theme: Theme): Text {
	return new Text(theme.fg("toolTitle", theme.bold(formatCallText(args))), 0, 0);
}

export function formatToolResult(result: TaskOperationResult, expanded: boolean, theme: Theme): Text {
	let content: string;
	if (result.action === "list") {
		const shown = expanded ? result.tasks : result.tasks.slice(0, 5);
		content = formatTaskList(shown);
		if (!expanded && result.tasks.length > shown.length) {
			content += `\n+${result.tasks.length - shown.length} more`;
		}
	} else {
		content = formatToolContent(result);
	}
	return new Text(theme.fg("toolOutput", content), 0, 0);
}
