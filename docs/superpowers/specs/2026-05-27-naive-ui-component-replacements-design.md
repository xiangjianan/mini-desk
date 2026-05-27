# Naive UI Component Replacement Design

Date: 2026-05-27

## Goal

Replace the remaining custom UI surfaces requested by the user with Naive UI components while preserving the current todo board behavior, event contracts, and compact visual style.

## Scope

The change covers four areas:

- Notification time editing in `TodoPanel.vue`.
- Scrollable board regions across panels and popup content.
- Overflow display for reminder text.
- Custom companion GIF upload in `SettingsMenu.vue`.

The change does not alter persisted state shape, todo ordering, notification display labels, custom GIF storage, or the existing menu and companion bubble workflows.

## Architecture

`TodoPanel.vue` remains the owner of reminder row interaction. It will replace the hand-built notification calendar and clock with Naive UI `NDatePicker` in `datetime` mode. The editor state will store one timestamp value for the picker instead of separate date, month, and quarter-hour time fields. Existing `notify` emits continue to send `number | undefined` timestamps to `App.vue`.

`SettingsMenu.vue` remains the owner of custom GIF selection. It will replace native file inputs with `NUpload`, keep separate light and dark file selections, and emit the same `customGif` payload shape.

Scrollable surfaces will use `NScrollbar` at the component boundary where scrolling currently happens. CSS will keep dimensions, compact row height, and one-pixel visual language consistent with the existing app.

Reminder text will use `NEllipsis` for read-only overflow display. Editing continues through the current input flow so keyboard, selection, context menu copy/paste, split-on-enter, and persistence behavior remain unchanged.

## Component Changes

### Notification Date Picker

- Import `NDatePicker` and `NButton` where needed in `TodoPanel.vue`.
- Opening the notification editor sets its value to:
  - the todo's existing `notifyAt` when valid;
  - otherwise today at 09:00 local time.
- Use `NDatePicker` with `type="datetime"`, Chinese formatted display, and Chinese action labels.
- Clicking the notification time affordance opens the editor with the picker immediately visible.
- The editor keeps explicit actions:
  - `不设通知时间` clears `notifyAt`;
  - `取消` closes without emitting;
  - `确定` emits the selected timestamp.

### Scrollbar

- Import and use `NScrollbar` in panels with scrollable content.
- Replace main `overflow-y: auto` or `overflow-x: auto` regions with Naive UI scroll containers where feasible.
- Keep existing fixed heights and flex behavior so panel layout does not shift.

### Ellipsis

- Import and use `NEllipsis` around reminder text display surfaces.
- The editable input remains available when a row is actively edited or empty.
- Long reminder text should truncate inside the row without expanding or overlapping neighboring controls.

### Upload

- Import and use `NUpload` in `SettingsMenu.vue`.
- Keep two upload slots: `浅色 GIF` and `深色 GIF`.
- Restrict accepted files to GIFs.
- Keep selected files in component refs and emit `{ light?: File; dark?: File }`.
- Keep confirm disabled by behavior when no file has been chosen.

## Data Flow

No storage migration is required. Existing state properties stay unchanged:

- `TodoItem.notifyAt?: number`
- `BoardState.companionGifTheme`
- Custom GIF payload handling in `App.vue`

The date picker produces local timestamps. Existing notification sorting and display helpers continue to receive numbers.

## Error Handling

- If the date picker has no value, `确定` does nothing and leaves the editor open.
- If neither GIF upload has a selected file, confirm does nothing.
- Native GIF validation remains client-side through accepted MIME/file extensions; existing downstream handling remains responsible for reading payloads.

## Testing

Tests will be updated before production code changes:

- `state/deadlines` tests will assert the default notification picker value is today at 09:00.
- `TodoPanel` tests will assert `NDatePicker` usage, default value, confirm emit, clear emit, and existing value hydration.
- `SettingsMenu` tests will assert `NUpload`-based custom GIF selection and unchanged `customGif` payload.
- Naive UI source-level tests will assert `NDatePicker`, `NScrollbar`, `NEllipsis`, and `NUpload` are used for the requested surfaces.
- Full verification will run `npm test` and `npm run build`.

## Risks

`NDatePicker` and `NUpload` can render nested DOM that differs from the hand-built controls, so tests should focus on public behavior and component usage instead of brittle internal markup. `NScrollbar` changes can affect scroll sizing; browser verification should check that todo lists, tabs, panels, and previews still scroll without layout shifts.
