import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import type { TaskOperation } from "./types.ts";

export const TodoParamsSchema = Type.Object({
	action: StringEnum(["list", "create", "update", "move", "delete", "clear"] as const),
	id: Type.Optional(Type.String({ description: "Task ID for update, move, or delete" })),
	title: Type.Optional(Type.String({ description: "Task title for create or update" })),
	status: Type.Optional(
		StringEnum(["todo", "doing", "done"] as const, {
			description:
				"New status for update only. Do not send status for create; new tasks always start as todo.",
		}),
	),
	beforeId: Type.Optional(Type.String({ description: "Place the task before this task ID" })),
	afterId: Type.Optional(Type.String({ description: "Place the task after this task ID" })),
});

export type TodoParams = Static<typeof TodoParamsSchema>;

const FIELDS = ["id", "title", "status", "beforeId", "afterId"] as const;
type Field = (typeof FIELDS)[number];

function requireField(params: TodoParams, field: Field): string {
	const value = params[field];
	if (typeof value !== "string") throw new Error(`${params.action} requires ${field}`);
	return value;
}

function rejectUnsupported(params: TodoParams, supported: readonly Field[]): void {
	const supportedKeys = new Set<string>(["action", ...supported]);
	for (const key of Object.keys(params)) {
		if (!supportedKeys.has(key)) throw new Error(`${params.action} does not support ${key}`);
	}
}

function placement(params: TodoParams): { beforeId: string } | { afterId: string } | undefined {
	if (params.beforeId !== undefined && params.afterId !== undefined) {
		throw new Error("beforeId and afterId are mutually exclusive");
	}
	if (params.beforeId !== undefined) return { beforeId: params.beforeId };
	if (params.afterId !== undefined) return { afterId: params.afterId };
	return undefined;
}

export function toTaskOperation(params: TodoParams): TaskOperation {
	switch (params.action) {
		case "list":
			rejectUnsupported(params, []);
			return { action: "list" };
		case "create": {
			rejectUnsupported(params, ["title", "beforeId", "afterId"]);
			const title = requireField(params, "title");
			const position = placement(params);
			return position ? { action: "create", title, ...position } : { action: "create", title };
		}
		case "update": {
			rejectUnsupported(params, ["id", "title", "status"]);
			const id = requireField(params, "id");
			if (params.title === undefined && params.status === undefined) {
				throw new Error("update requires at least one mutable field");
			}
			return { action: "update", id, title: params.title, status: params.status };
		}
		case "move": {
			rejectUnsupported(params, ["id", "beforeId", "afterId"]);
			const id = requireField(params, "id");
			const position = placement(params);
			if (!position) throw new Error("move requires exactly one of beforeId or afterId");
			return { action: "move", id, ...position };
		}
		case "delete":
			rejectUnsupported(params, ["id"]);
			return { action: "delete", id: requireField(params, "id") };
		case "clear":
			rejectUnsupported(params, []);
			return { action: "clear" };
	}
	const exhaustive: never = params.action;
	return exhaustive;
}

export const TODO_PROMPT_GUIDELINES = [
	"Use `todo` for non-trivial work with several concrete steps. Skip it for simple questions and single-step work.",
	"Create calls use action and title, with optional beforeId or afterId. Do not send status; new tasks start as todo.",
	"Create small, independently completable tasks before implementation, then update status as verified work progresses.",
	"Do not mark incomplete work or work with failing checks as done.",
	"More than one task may be doing when independent work runs in parallel.",
] as const;
