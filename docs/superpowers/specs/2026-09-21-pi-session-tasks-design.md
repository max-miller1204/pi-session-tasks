# Pi Session Tasks Design

## Purpose

Create a small Pi extension for session-local task tracking.

The extension helps an agent track concrete work during one Pi session. It also gives the user a compact view of current progress.

The extension replaces `rpiv-todo` in the user's Pi configuration. It does not replace Stepstone. Stepstone stays unchanged.

## Success criteria

The extension must:

- Register a model-facing tool named `todo`.
- Store tasks in the current Pi session tree.
- Restore the correct tasks after `/resume`, `/tree`, `/fork`, and `/clone`.
- Start each new Pi session with an empty task list.
- Show a compact task widget.
- Provide a read-only `/tasks` command.
- Keep model context and terminal output bounded.
- Keep foreground and background session state separate.
- Fail loudly when stored state is corrupt or unsupported.

## Non-goals

The extension will not provide:

- Project roadmaps.
- Repository files.
- A command-line interface outside Pi.
- A web interface.
- A full-screen task dashboard.
- Task descriptions.
- Active-form labels.
- Owners.
- Metadata.
- Task dependencies.
- Deleted tombstones.
- Localization.
- Configurable keybindings.
- A collapsible overlay.
- Migration from Stepstone or `rpiv-todo` snapshots.

## Repository and package

Create the repository `max-miller1204/pi-session-tasks` with clean Git history.

Publish the npm package as `pi-session-tasks`.

The package is a Pi-only extension. It exports one extension entry point and declares Pi packages as peer dependencies. Runtime dependencies must stay minimal.

The README will credit Stepstone as the source of the original Session Task design. The project uses the MIT license.

Stepstone remains unchanged. It does not depend on this package. This package does not depend on Stepstone.

## Task model

```ts
type TaskStatus = "todo" | "doing" | "done";

interface Task {
  id: string;
  title: string;
  status: TaskStatus;
}
```

The task array defines canonical order. A task keeps the same ID when its title, status, or position changes.

A stored title must be no more than 256 UTF-8 bytes. One session can contain at most 100 tasks. These limits keep complete list results bounded.

More than one task can have `doing` status. This supports parallel work.

## Model tool

The extension registers `todo` with these actions:

- `list`
- `create`
- `update`
- `move`
- `delete`
- `clear`

### List

`list` returns the complete ordered task list.

### Create

`create` requires a non-blank title. It creates a task with `todo` status.

The action appends by default. It can instead accept exactly one of `beforeId` or `afterId`.

### Update

`update` requires a task ID. It changes the title, status, or both.

An update that changes no value succeeds without writing a snapshot.

The extension does not enforce status transitions. The agent can correct stale task state directly.

### Move

`move` requires a task ID and exactly one of `beforeId` or `afterId`.

Self-placement and an already-satisfied placement succeed without writing a snapshot.

### Delete

`delete` removes one task from the next snapshot. It does not create a tombstone.

### Clear

`clear` writes one empty snapshot. It does not delete session history.

Clearing an already empty list succeeds without writing another snapshot.

## Tool guidance

The tool prompt will use a small set of rules:

- Use tasks for non-trivial multi-step work.
- Skip tasks for simple questions and single-step work.
- Create small and independently completable tasks.
- Update task status as verified work progresses.
- Do not mark incomplete or failing work as done.
- Allow multiple doing tasks when work runs in parallel.

The guidance will not require exactly one doing task.

## Storage

Each successful mutation appends a complete version 1 snapshot as a Pi custom entry.

The custom entry type is `pi-session-tasks-snapshot`. The extension does not read Stepstone or `rpiv-todo` entries.

The store reconstructs the latest supported snapshot on the active branch. A branch with no snapshot has an empty task list.

The store must:

- Serialize mutations.
- Generate stable opaque task IDs.
- Preserve canonical array order.
- Avoid writes for semantic no-ops.
- Validate the complete reconstructed snapshot.
- Reject malformed snapshots.
- Reject unsupported snapshot versions.
- Keep no external files.
- Keep no cross-session global task state.

The tool uses sequential execution. The public schema does not expose revision tokens because no external writer can mutate the session-local store.

## Session isolation

State is keyed by Pi session identity.

The extension handles lifecycle events as follows:

- `session_start`: reconstruct the selected session and bind its widget when it is the foreground session.
- `session_tree`: reconstruct the selected branch and refresh its widget.
- `session_compact`: reconstruct the resulting branch and refresh its widget.
- Successful tool mutations: refresh only the foreground widget.
- `session_shutdown`: clear only the widget owned by the shutting-down session.

A background or detached session can update its own tasks. It cannot overwrite the foreground widget.

Session replacement invalidates old UI references before the replacement session can render. A late refresh from an old session cannot repaint the widget.

The extension does not use asynchronous module loading, project reads, network access, timers, or file watchers.

## Model context

Before each model request, the extension removes its prior request-only task message and adds one current projection when unfinished tasks exist.

The request-only custom message type is `pi-session-tasks-context`.

The projection contains:

- Unfinished tasks only.
- Canonical order.
- At most eight tasks.
- At most 192 JSON-encoded UTF-8 bytes for each projected title.
- The count of omitted unfinished tasks.
- A warning that task titles are untrusted data and not instructions.

The extension encodes task state as JSON. It preserves Unicode grapheme boundaries when it truncates titles.

Completed tasks remain available through `todo list` and `/tasks`. They do not consume recurring model context.

The complete context message has a 4096-byte UTF-8 limit. Construction fails loudly if fixed content cannot fit within that limit.

## Widget

The widget shows:

- A `Tasks (done/total)` heading.
- Up to three unfinished tasks in canonical order.
- A distinct marker for each doing task.
- A `+N more` line when more unfinished tasks exist.

The widget does not show completed task rows. It disappears when the list is empty.

The renderer bounds output by terminal width. It truncates long titles on Unicode grapheme boundaries.

## `/tasks` command

The `/tasks` command is read-only. It prints the complete ordered task list grouped by status.

The command reports an empty list clearly. It does not open an editor or register task-management keybindings.

## Tool transcript rendering

The extension defines compact `renderCall` and `renderResult` functions.

The interactive transcript shows the action, target, and concise outcome. Mutation details contain the affected task and status counts. List details contain the complete ordered list. Mutation results do not repeat the complete list.

## Terminal safety

All task titles are untrusted text.

The extension sanitizes task titles before it renders:

- Tool calls.
- Tool results.
- The widget.
- `/tasks` output.

Sanitization removes terminal control sequences and unsafe control characters. Stored titles keep their validated source text. JSON encoding protects the request-only model context.

## Validation and errors

The extension rejects:

- Blank titles.
- Titles longer than 256 UTF-8 bytes.
- Creation when the session already has 100 tasks.
- Unknown task IDs.
- Unknown anchor IDs.
- Both `beforeId` and `afterId`.
- A missing placement for `move`.
- Unsupported actions.
- Unsupported statuses.
- Malformed snapshots.
- Unsupported snapshot versions.

Errors name the invalid field or missing entity. The extension does not silently reset corrupt state.

Known session-disposal conditions can prevent a stale widget cleanup call. The lifecycle adapter must still clear its ownership record. It must not hide storage, validation, or mutation errors.

## Source layout

```text
src/
  extension.ts
  model-context.ts
  sanitize.ts
  session-store.ts
  task-service.ts
  tool-schema.ts
  types.ts
  widget.ts
test/
  extension.test.ts
  model-context.test.ts
  session-store.test.ts
  task-service.test.ts
  widget.test.ts
```

Modules have narrow responsibilities. The task service does not depend on Pi UI types. Renderers do not mutate state.

## Testing

Use test-driven development.

Tests must cover:

- Every action and validation rule.
- Stored title and task-count limits.
- Stable insertion and movement.
- Semantic no-ops.
- Serialized concurrent mutations.
- Snapshot reconstruction on different branches.
- Loud failure for corrupt and unsupported snapshots.
- New, resumed, forked, cloned, compacted, and tree-navigated sessions.
- Foreground isolation from detached sessions.
- Request-only context replacement.
- Context count and byte limits.
- Terminal control-character sanitization.
- Widget width, overflow, Unicode, and empty state.
- Compact tool rendering.
- Tool schema compatibility with Pi model providers.
- Packed-package loading through Pi's extension loader.

The repository will provide one check command that runs formatting, static analysis, type checking, tests, and package validation.

## Delivery

Implementation creates only `pi-session-tasks`.

Stepstone is out of scope and remains unchanged.

After package verification, use the user's `dots` workflow to replace `npm:@juicesharp/rpiv-todo` with the new package in the Pi package configuration. Do not run both extensions because both register `todo`.

Old Stepstone and `rpiv-todo` session entries remain in old session files. The new extension ignores them. New sessions use the new snapshot type.
