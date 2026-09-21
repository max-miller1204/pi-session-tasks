# pi-session-tasks

`pi-session-tasks` adds branch-aware task tracking to Pi. It gives the model a `todo` tool, shows current work in a widget, and stores task state in the session.

## Installation

Install the package after it is published:

```sh
pi install npm:pi-session-tasks
```

To test the extension from this repository without installing it, run:

```sh
pi -e ./src/extension.ts
```

## `todo` tool

The model uses the `todo` tool to manage tasks in the current session.

| Action | Fields | Behavior |
| --- | --- | --- |
| `list` | `action` | List all tasks in order. |
| `create` | `action`, `title`, optional `beforeId` or `afterId` | Create a `todo` task. Add it at the end unless an anchor is given. |
| `update` | `action`, `id`, optional `title`, optional `status` | Change a title, a status, or both. At least one change field is required. |
| `move` | `action`, `id`, exactly one of `beforeId` or `afterId` | Move a task relative to another task. |
| `delete` | `action`, `id` | Delete one task. |
| `clear` | `action` | Delete all tasks. |

`beforeId` and `afterId` cannot be used together.

Each task has these fields:

| Field | Meaning |
| --- | --- |
| `id` | A stable task ID. |
| `title` | A short description of the work. |
| `status` | The current task status. |

Statuses have these meanings:

- `todo`: Work has not started.
- `doing`: Work is in progress.
- `done`: Work is complete and verified.

## `/tasks` command

Run `/tasks` to show all tasks on the current session branch. The command does not change task state.

## Widget

The widget appears when the session has tasks. Its heading shows completed tasks and total tasks. It shows up to three incomplete tasks in task order. A `doing` task uses a half-circle marker. A `todo` task uses an open-circle marker. The widget shows the number of additional incomplete tasks. Completed tasks do not appear as rows. The widget disappears when all tasks are removed.

## Session behavior

Task state belongs to a Pi session branch.

- A new session starts with no tasks.
- A resumed session restores the latest task state on its branch.
- Tree navigation restores the latest task state on the selected branch.
- A forked session inherits the task state in its branch history. Later changes are independent.
- A cloned session inherits the task state in its branch history. Later changes are independent.
- A compacted session restores task state from the compacted branch.

The extension gives the model up to eight incomplete tasks as hidden context. It refreshes this context from the current branch.

The extension does not import Stepstone state or `rpiv-todo` state.

## Limits

- A session can have at most 100 tasks.
- A title can have at most 256 UTF-8 bytes.
- Model context can contain at most eight incomplete tasks.
- The widget can show at most three incomplete tasks.

## Removal

Remove the package with:

```sh
pi remove npm:pi-session-tasks
```

Existing session entries remain in session history. The extension does not load them after removal.

## Development

Install dependencies:

```sh
npm ci
```

Run the tests:

```sh
npm test
```

Run the type check:

```sh
npm run typecheck
```

Run all checks, including the packed-extension smoke test:

```sh
npm run check
```

Test the packed extension directly:

```sh
npm run package:smoke
```

Inspect the npm package contents:

```sh
npm run pack:check
```

## Acknowledgment

The task model was extracted from the Session Tasks design in Stepstone.

## License

MIT
