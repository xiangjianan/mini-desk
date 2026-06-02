# Shadcn Workbench UI Redesign Design

Date: 2026-06-02

## Decision

Use option 2: a gradual `shadcn-vue` and Tailwind migration.

The redesign will move the app toward a shadcn dashboard workbench: a compact icon rail, a command-style top bar, and four dense work zones. Naive UI will not be removed in one pass. Complex controls such as dropdowns, modals, date picker, upload, scrollbar, and popover can remain temporarily, but their visual treatment must be normalized through shared design tokens so the user sees one coherent system.

## Current Context

The app is a Vue 3, TypeScript, Vite single-page todo board. It currently uses Naive UI, `@vicons/ionicons5`, and custom CSS variables in `src/styles.css`. Running `npx shadcn@latest info --json` shows a Vite project with no Tailwind setup, no `components.json`, and no installed shadcn components.

The current layout is a horizontal work board with image, notes, todos, workspace, storage, quick actions, and tools. The product value is fast daily work, not marketing presentation. The redesign must preserve dense editing workflows, drag/drop behavior, local storage state, image handling, quick actions, todo reminders, theme toggling, and the companion notification.

## References

- shadcn/ui Blocks: dashboard examples use sidebar, header, cards, chart/table regions, and reusable component files.
- shadcn/ui Sidebar: sidebar is documented as composable, themeable, customizable, and able to collapse to icons.
- Google Material Design 3 navigation rail: used as a layout reference for persistent app-level navigation.
- Generated UI concept: `/Users/xiangjianan/.codex/generated_images/019e87f1-8344-7983-af98-01b61f0bc118/ig_00020a8c400b9d6a016a1ed4a602c481919fdb0476e2ea4a42.png`.

## Goals

1. Make the page feel like an industrial-grade productivity workbench: minimal, precise, dense, and easy to scan.
2. Adopt shadcn-style primitives and tokens without rewriting the application to React.
3. Establish one visual system for native HTML, shadcn-vue components, and retained Naive UI controls.
4. Improve information architecture by giving todos a dominant central region and moving global controls into stable shell chrome.
5. Keep the existing user workflows intact unless a component boundary needs a strictly visual rearrangement.

## Non-Goals

- No React rewrite.
- No full Naive UI removal in this change.
- No new backend, account system, analytics dashboard, or cloud sync.
- No marketing hero, landing page, decorative gradients, decorative blobs, or fake metrics.
- No schema migration unless required by an existing component contract.

## Visual System

The visual language is shadcn-style monochrome minimalism with Material-inspired layout clarity.

Tokens:

- Background: `background`, `card`, `popover`, and `muted` should map to near-white and neutral gray surfaces in light mode.
- Text: `foreground` for primary text, `muted-foreground` for counts, timestamps, helper labels, and secondary actions.
- Border: thin `border` lines should define panels and controls; avoid heavy dividers.
- Radius: default radius is 8px for panels and controls; compact rows may use 6px.
- Spacing: use 8pt rhythm with `2`, `3`, `4`, and `6` Tailwind spacing steps as the main scale.
- Typography: system sans-serif, 12px to 14px for dense app chrome, 16px to 20px only for top-level shell titles.
- Icons: switch new UI chrome to `lucide-vue-next`; retained Naive icon usage can be migrated gradually.
- Motion: subtle hover and focus transitions only; no ornamental motion.

The palette should remain black, white, and neutral gray. Status colors may appear only for reminders, destructive actions, update badges, and notifications.

## App Shell

Add a stable desktop shell around the existing board.

Left navigation rail:

- Width: 56px.
- Content: app mark, primary board view, assets, todos, workspace, tools, settings, help, theme, and collapse/expand affordance where useful.
- Behavior: icon-only buttons with tooltips. The active view uses `bg-primary text-primary-foreground`; inactive buttons use ghost styling.
- Implementation: start as a local Vue shell component using shadcn-style Button/Tooltip primitives or equivalent source components. It does not need to route to separate pages in the first pass.

Top command bar:

- Height: 48px to 56px.
- Left: `今日工作台` or localized equivalent, save status, version/update state when present.
- Center/right: command/search affordance, quick save/import/export access when appropriate, theme, help, settings.
- Command affordance can be presentational in the first implementation unless existing actions are simple to wire.
- Save status remains driven by existing `saveStatus` state.

Main workbench:

- Desktop layout is a four-zone CSS grid:
  - Assets: images and image actions.
  - Notes / Quick actions: notes, links, quick copy/link/API buttons.
  - Task flow: dominant todo column with today focus, sections, reminders, stars, and completed visibility.
  - Workspace / Tools: workspace editor plus tool tabs.
- Grid should fit one desktop viewport without accidental overflow; each zone owns its internal scroll.
- Avoid nested cards. A zone is a panel; repeated rows, images, and task groups can be framed inside it only where needed.

## Component Migration

Introduce the minimum shadcn-vue/Tailwind foundation first:

- Tailwind config and global CSS token mapping.
- `components.json` configured for Vue conventions.
- Shared `cn()` utility and component aliases.
- Initial source components: Button, Card or panel equivalent, Separator, Tooltip, Badge, Tabs, Input, Textarea, Checkbox where feasible.
- `lucide-vue-next` for new shell and command icons.

Keep these Naive UI controls temporarily if replacing them would expand the change too much:

- `NDropdown`
- `NModal`
- `NPopover`
- `NDatePicker`
- `NUpload`
- `NScrollbar`
- `NSlider`

For retained Naive UI, add compatibility styling so border radius, typography, focus rings, dropdown surfaces, modal cards, popovers, and buttons match the new tokens.

## Existing Component Mapping

- `App.vue`: owns shell composition, top command bar, theme provider bridge, save status, and global overlays.
- `ImagePanel.vue`: becomes the Assets zone content. Keep drag/drop, paste, preview, copy, delete.
- `TextPanel.vue`: remains the editor primitive for notes, workspace, and storage lines.
- `QuickButtons.vue`: moves visually into Notes / Quick actions and uses shadcn-like rows/buttons.
- `TodoPanel.vue`: becomes the dominant Task flow zone. The todo list structure should become denser and more table-like, but keep editing, split, drag, reminders, stars, and completion behavior.
- `SpacePanel.vue`: becomes the Workspace portion of Workspace / Tools or remains as the multi-space editor inside that zone.
- `ToolPanel.vue`: becomes a tabbed Tools region under Workspace / Tools.
- `SettingsMenu.vue`, `ShortcutHelp.vue`, `ImagePreview.vue`, `CompanionBubble.vue`: keep behavior, update visual treatment to match the new shell and tokens.

## Data Flow

No state architecture changes are required.

The existing reactive `state` object, localStorage persistence, IndexedDB image payloads, save timers, undo snapshots, notification timers, and i18n helpers remain the source of truth. The redesign should change composition and styling first. New shell selected states should be local UI state unless they need persistence.

## Accessibility

- Icon-only rail and top-bar buttons need accessible labels and tooltips.
- Focus rings should be visible and token-based.
- Dropdowns, modals, and popovers must retain titles or accessible names.
- Command/search affordance must not trap focus if it is presentational.
- Keyboard shortcuts such as Ctrl+S must continue working.

## Responsive Behavior

The existing app blocks mobile below the current breakpoint. This redesign does not need to create a complete mobile board. It should keep the mobile handoff behavior intact, while ensuring the shell does not create visual overlap before the breakpoint is reached.

For medium widths, the workbench can reduce to two grid columns before the mobile-blocked state. The todo region should remain visually prioritized.

## Testing And Verification

Run the existing test suite and build:

- `npm test`
- `npm run build`

Add or update focused tests where behavior could regress:

- App renders with the new shell.
- Theme toggle still updates `data-theme`.
- Settings and shortcut help still open.
- Todo creation, completion, reminder, and drag/drop behavior still passes existing tests.
- Quick actions and image preview behavior remain covered by current tests.

Use browser verification after implementation:

- Desktop default viewport.
- A medium viewport near the responsive threshold.
- The mobile-blocked state.
- Light and dark theme.
- Core workflow: add/edit todo, edit text, open settings, open shortcut help, paste/copy quick action, preview image when data exists.

## Risks

- Tailwind and existing global CSS can fight over base styles. Mitigation: keep token definitions centralized in `src/styles.css` or the Tailwind CSS entry and migrate selectors intentionally.
- Naive UI component internals may not fully honor custom tokens. Mitigation: define a compatibility layer with targeted `.n-*` variable overrides and defer full replacement.
- The current app has many dense interactions. Mitigation: preserve component APIs and move visuals through wrappers before deep refactors.
- shadcn React examples cannot be copied into Vue. Mitigation: use the examples for layout and component anatomy only, and install Vue-compatible primitives.

## Acceptance Criteria

- The first viewport clearly reads as a shadcn-style productivity dashboard, not the old five-column board.
- Left rail, top command bar, and four-zone workbench are present on desktop.
- Visual tokens are coherent across native controls, new shadcn-vue components, and retained Naive UI components.
- Existing tests pass.
- Build passes.
- Browser screenshots show no overlapping text, clipped primary controls, or accidental horizontal overflow.
- No unrelated feature or data model changes are introduced.
