import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { sanitizeTerminalText } from "./sanitize.ts";
import type { Task } from "./types.ts";

function truncateText(value: string, width: number): string {
	return sanitizeTerminalText(truncateToWidth(value, width));
}

export class TaskWidget {
	private cachedWidth: number | undefined;
	private cachedTaskState: string | undefined;
	private cachedLines: string[] | undefined;

	constructor(
		private readonly getTasks: () => readonly Task[],
		private readonly theme: Theme,
	) {}

	render(width: number): string[] {
		const tasks = this.getTasks();
		const taskState = JSON.stringify(tasks.map(({ id, status, title }) => [id, status, title]));
		if (this.cachedWidth === width && this.cachedTaskState === taskState && this.cachedLines) {
			return this.cachedLines;
		}

		const lines = this.renderTasks(tasks, width);
		this.cachedWidth = width;
		this.cachedTaskState = taskState;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedTaskState = undefined;
		this.cachedLines = undefined;
	}

	private renderTasks(tasks: readonly Task[], width: number): string[] {
		if (tasks.length === 0) return [];

		const visible = tasks.filter((task) => task.status !== "done");
		const shown = visible.slice(0, 3);
		const done = tasks.filter((task) => task.status === "done").length;
		const heading = truncateText(`Tasks (${done}/${tasks.length})`, width);
		const lines = [this.theme.bold(this.theme.fg("accent", heading))];

		for (const task of shown) {
			const marker = task.status === "doing" ? "◐" : "○";
			const color = task.status === "doing" ? "warning" : "muted";
			const title = sanitizeTerminalText(task.title);
			lines.push(this.theme.fg(color, truncateText(`${marker} ${title}`, width)));
		}
		if (visible.length > 3) {
			lines.push(this.theme.fg("dim", truncateText(`+${visible.length - 3} more`, width)));
		}
		return lines;
	}
}
