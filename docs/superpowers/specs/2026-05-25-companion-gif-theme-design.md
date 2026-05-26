# Companion GIF Theme Design

## Background

This small version reserves GIF theme support for the companion feedback surface. The app currently always shows the Hermes GIF when a companion bubble appears, with a light and dark asset variant selected by UI theme. The new behavior keeps the current default for compatibility, while giving users a setting to disable the GIF and see only the bubble content.

## Scope

This version includes:

- A persisted companion GIF theme preference.
- A settings menu entry for GIF theme selection.
- Built-in GIF choices for ikun, 云霞, custom GIFs, and no GIF.
- Companion bubble behavior that still shows messages, links, and confirmation actions when GIF is disabled.
- A theme registry shape that can accept future GIF themes without rewriting `App.vue`.

This version does not include:

- Per-message GIF selection.
- Changing reminder list structure or list configuration.

## Data Model

Add a persisted field to `BoardState`:

```ts
companionGifTheme: "ikun" | "hermes" | "custom" | "none"
```

The default is `"ikun"`. Existing `"hermes"` values are still accepted and map to the 云霞 assets. Imported or stored unknown values are normalized back to `"ikun"`.

The value `"none"` means the companion GIF image surface is disabled. It does not disable the message bubble, confirmation prompts, links, timing behavior, or positioning.

## Theme Registry

Create a small registry for GIF themes near the companion bubble boundary. The registry should expose:

- theme id
- menu label
- optional light GIF asset
- optional dark GIF asset

Initial entries:

- `ikun`: uses `static/video/kun.gif` and `static/video/kun-dark.gif`
- `hermes`: uses `static/video/yunxia.gif` and `static/video/yunxia-dark.gif`
- `none`: has no GIF assets and renders only bubble content

Future GIF themes should be added by appending registry entries and importing their assets. The rest of the app should only pass the selected theme id.

## Settings Interaction

The settings menu gets a `GIF 主题` dropdown submenu. It contains:

- `ikun`
- `云霞`
- `自定义`
- `不显示`

Selecting an option updates `state.companionGifTheme`, persists immediately, and keeps the settings menu behavior consistent with the existing Naive UI dropdown pattern. The current option should be visibly selected through the dropdown option state.

The setting lives in the existing settings menu rather than a new modal because this version has only two choices and no asset preview. A flat grouped section should not be used in this version; the submenu keeps the main settings menu compact and leaves room for future GIF themes.

## Companion Behavior

`CompanionBubble` receives a `gifTheme` prop. It resolves the prop through the registry:

- For `ikun`, show the default GIF immediately, then delay the bubble by 200ms.
- For `hermes`, behavior remains the same as today: show the GIF immediately, then delay the bubble by 200ms.
- For `custom`, use the uploaded GIF source for the current theme, falling back to the other uploaded variant when needed.
- For `none`, do not render the `<img>` surface. When a message, link, or confirmation is visible, show the popover content directly from the companion container, using the same positioning and timers.
- For `none` with no message content, do not show any companion surface. This preserves the existing behavior where some non-empty area clicks intentionally show only the GIF; with GIF disabled those clicks show nothing.

Existing pause/resume behavior should still apply when the visible bubble content is hovered. GIF-specific timers should be inert when no GIF is rendered.

## Persistence and Import

`defaultState()` sets `companionGifTheme` to `"ikun"`.

`normalizeImportedState()` accepts `"ikun"`, `"hermes"`, `"custom"`, and `"none"`. Missing or invalid values become `"ikun"`.

`getSerializableState()` writes the normalized value as part of the board state.

## Error Handling

- Missing GIF assets for a future registry entry should be treated as a theme configuration issue during development, not a runtime user error.
- Unknown imported theme ids normalize to `"ikun"`.
- If GIF is disabled, confirmation and action bubbles must still render and remain clickable.
- Mobile handoff can continue using the same selected GIF setting; with `"none"`, mobile handoff still shows the text bubble without GIF.

## Testing Plan

State tests:

- Default state uses `"ikun"`.
- Import preserves `"none"`.
- Import normalizes unknown GIF theme ids to `"ikun"`.
- Serializable state includes the selected GIF theme.

Component tests:

- Settings menu renders the GIF theme choices and emits selection changes.
- Current GIF theme is marked selected.
- Companion bubble uses ikun assets for the default theme.
- Companion bubble renders bubble content without an image when `gifTheme` is `"none"`.
- Companion bubble renders nothing for GIF-only visibility when `gifTheme` is `"none"` and there is no message.

App tests:

- Selecting a GIF theme from settings persists the value.
- With `"none"`, guide or confirmation bubbles still show content, but no GIF image is rendered.
