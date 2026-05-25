# Configurable Todo Lists Design

## Background

The reminder area currently has three fixed lists: morning, noon, and evening. Those ids are embedded in the data model, storage normalization, app handlers, and `TodoPanel` rendering. The third small version turns those fixed periods into configurable reminder lists while preserving existing user data and current reminder behavior.

## Scope

This version includes:

- A persisted reminder list configuration array.
- Automatic migration from the old `morning`, `noon`, and `evening` fixed lists.
- Creating reminder lists.
- Deleting reminder lists, including a confirmation when the list still contains reminders.
- Renaming reminder lists from the list heading.
- Collapsing and expanding lists.
- Shrinking and restoring lists.
- Drag sorting reminder lists.
- Keeping existing reminder item behavior working across dynamic lists, including completion, starring, notifications, external text drops, completed cleanup, and cross-list reminder dragging.

This version does not include:

- Batch moving reminders between lists before deletion.
- Per-list color themes or icons.
- Nested lists.
- Server synchronization.
- Changing notification scheduling rules.

## Data Model

Add a persisted `todoLists` field to `BoardState`:

```ts
interface TodoListConfig {
  id: string;
  title: string;
  collapsed: boolean;
  compact: boolean;
}
```

The `todos` record and `showCompletedTodos` record become keyed by dynamic list id:

```ts
type TodoListId = string;
type TodoMap = Record<TodoListId, TodoItem[]>;
type TodoCompletedVisibility = Record<TodoListId, boolean>;
```

The default state still creates three lists with ids `morning`, `noon`, and `evening`. Their default titles match the current UI:

- `morning`: `☀️ 早上`
- `noon`: `🌤️ 中午`
- `evening`: `🌙 晚上`

Keeping the old ids as default ids reduces migration risk and preserves existing tests and DOM hooks where possible. Code should treat those ids as normal list ids, not as a closed enum.

## Migration and Persistence

`normalizeImportedState()` derives `todoLists` before normalizing `todos` and `showCompletedTodos`.

When `todoLists` is missing, old state is migrated into the three default lists. If old custom titles exist under `todo-morning-title`, `todo-noon-title`, or `todo-evening-title`, those values become the migrated list titles.

When `todoLists` is present:

- Only plain objects with non-empty string ids are accepted.
- Duplicate ids are de-duplicated by assigning a new generated id to later duplicates.
- Empty titles become `未命名列表`.
- Missing `collapsed` and `compact` values default to `false`.
- At least one list is always present.
- `todos` keeps arrays only for valid list ids.
- Missing todo arrays become empty arrays.
- Orphan todo arrays for deleted or unknown list ids are dropped during normalization.
- `showCompletedTodos` keeps booleans only for valid list ids.

`getSerializableState()` writes a cloned `todoLists` array and writes `todos` and `showCompletedTodos` only for the current valid list ids.

## Reminder List UI

The reminder panel renders sections from `state.todoLists` instead of a fixed list constant.

Each list heading contains:

- A drag handle for list sorting.
- An editable title.
- A completion count.
- A list action menu.

The reminder panel exposes an add-list button near the reminder list group. Creating a list appends it after the current lists, creates an empty todo array and hidden-completed visibility value for it, then immediately focuses the title editor for the new list.

Renaming a list updates `todoLists[].title` directly. The old `customTitles` ids for the three default reminder headings are no longer used for live list title editing, but migration reads them once for backward compatibility.

## List Actions

The list action menu includes:

- `折叠` / `展开`
- `收缩` / `恢复`
- `显示已完成` / `隐藏已完成`
- `清理已完成`
- `删除列表`
- `Tips`

Collapsed lists keep the heading visible and hide the reminder list body. Dropping external text or reminder items on a collapsed list heading still targets that list, then expands it.

Compact lists keep reminders visible but reduce vertical density and show fewer rows before scrolling. Compact mode is independent from collapsed mode. A list can be compact and expanded, or compact and collapsed.

Deleting the final remaining list is disabled. Deleting an empty list happens immediately. Deleting a non-empty list opens a confirmation bubble; confirming removes the list, its reminders, its completed visibility state, and any pending empty-reminder removal timers for that list.

## Drag and Drop

Reminder item dragging keeps its current behavior:

- Dragging a reminder onto another reminder inserts before or near that target according to existing behavior.
- Dragging a reminder onto a list body appends to that list.
- Dragging external text onto a list creates reminders in that list.

Reminder list dragging is separate from reminder item dragging. A list drag handle moves entire list sections and only changes `todoLists` order. It does not mutate any reminder arrays.

List and reminder item drag state should use distinct refs so a list drag cannot be interpreted as a reminder item drag.

## Today Focus and Notifications

Today focus is built by iterating `todoLists` in the configured order and reading `todos[list.id]`. Existing sorting still applies inside the resulting focus list:

- Incomplete reminders before completed reminders.
- Earlier notification times first when both reminders have valid notification times.
- Reminders with notification times before reminders without notification times.
- Stable order otherwise.

Notification scanning also iterates configured lists. Notification text fallback uses the list title when a reminder has no text.

## Error Handling

- Unknown list ids passed from stale DOM events are ignored.
- Deleting a list closes any menu or notification editor tied to that list.
- Moving a reminder from or to a missing list is a no-op.
- Creating a reminder for a missing list is a no-op.
- If normalization produces no valid lists, the default three lists are restored.
- If a current focus or menu target is removed, the component clears that local state.

## Testing Plan

State and storage tests:

- Default state includes three `todoLists` and matching `todos` / `showCompletedTodos` keys.
- Old fixed-list state migrates into `todoLists` with titles from old custom title keys.
- Dynamic lists are serialized and reloaded without losing order or flags.
- Duplicate list ids are normalized to unique ids.
- Todos and completed visibility are kept only for valid list ids.

Todo state tests:

- Adding, updating, splitting, completing, starring, notification editing, removing, clearing completed, and moving reminders work with arbitrary list ids.
- Removing a list removes its reminders and visibility state.
- Reordering lists changes only `todoLists` order.

Component tests:

- The panel renders lists from `todoLists`.
- Adding a list emits creation and focuses title editing.
- The list menu emits collapse, compact, completed visibility, clear-completed, and delete events.
- Non-empty list deletion requires confirmation before removal.
- Collapsed lists hide body content but remain valid drop targets.
- Compact lists use compact styling while keeping reminders visible.
- List drag sorting emits a reorder event without emitting reminder moves.

App tests:

- Creating a list persists it.
- Deleting a non-empty list after confirmation persists removal of both list config and reminders.
- Drag sorting lists persists the new order.
- Existing reminder flows still work after migrating old saved state.
