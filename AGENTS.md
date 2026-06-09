# AGENTS.md

This file gives coding agents the project-specific context needed to work safely in this repository.

## Project Overview

Mini Desk is a local-first personal desktop workbench built as a Vue 3 single-page app. It collects image snippets, notes, quick actions, todo/reminder lists, tools, workspaces, settings, and companion GIF behavior in one browser UI.

The app is intentionally backend-free by default:

- Board state is persisted in browser `localStorage` under `mini-desk-state-v1`.
- Image payloads and custom GIF payloads are persisted in same-origin IndexedDB.
- Legacy state keys such as `todo-board-state-v1` and `todo-board-images-v1` are still handled for compatibility.

## Tech Stack

- Vue 3 with `<script setup lang="ts">`
- TypeScript
- Vite
- Vitest with jsdom
- Naive UI, `@vicons/ionicons5`, `lucide-vue-next`
- Tailwind CSS 4 via `@tailwindcss/vite`
- Lightweight shadcn-style local components under `src/components/ui/`

## Common Commands

```bash
npm install
npm run dev
npm run dev -- --host 0.0.0.0
npm test
npm run build
npm run deploy:cloudflare
```

Use `npm test` for normal verification. Use `npm run build` before changes that can affect TypeScript contracts, bundling, deployment config, or production behavior.

## Repository Structure

- `src/main.ts` mounts the Vue app.
- `src/App.vue` coordinates top-level state, persistence, import/export, preview flow, settings, shortcuts, companion bubble behavior, notifications, and mobile blocking.
- `src/components/` contains feature components such as image panel, image preview, quick buttons, todo panel, tool panel, workspace panel, settings menu, shell, and companion bubble.
- `src/components/ui/` contains local shadcn-style primitives.
- `src/state/` contains typed domain/state helpers for defaults, storage, images, todos, messages, i18n, versioning, and companion GIF themes.
- `src/utils/` contains reusable utility logic such as text editing and context menu helpers.
- `src/__tests__/` contains focused Vitest coverage for rendering, state compatibility, UI contracts, interactions, messages, deployment config, and component behavior.
- `docs/superpowers/` contains historical specs and plans. Treat these as background context, not automatically current product truth.

## Development Conventions

- Keep UI copy in the existing i18n/state patterns instead of hard-coding new text in components.
- Preserve both Chinese and English behavior when touching user-facing copy or settings.
- Prefer typed helpers in `src/state/` for domain logic instead of spreading behavior across components.
- Keep large image/GIF payloads out of `localStorage`; use the existing IndexedDB helpers in `src/state/images.ts`.
- Maintain backward compatibility in `src/state/storage.ts` when changing persisted state shape.
- Use client-generated IDs consistent with existing storage helpers.
- Respect destructive-action confirmation patterns. Deletes, imports, clearing completed items, and similar actions should require confirmation through the existing UX.
- Keep mobile behavior in mind: the full board is desktop-oriented, and small viewports show a mobile blocking/guide experience.
- Avoid broad visual rewrites unless requested. The current design goal is compact, low-distraction, Apple HIG-inspired desktop utility UI.
- For frontend UI changes, verify that text fits at desktop and mobile breakpoints and that controls do not shift layout unexpectedly.

## Testing Guidance

For new features or behavior changes, keep the final TDD verification incremental by default. Run the smallest relevant test files or focused Vitest filters that cover the touched behavior. Run the full suite only when the change affects shared state, persistence, app-wide contracts, global UI behavior, or other cross-cutting surfaces.

When changing state helpers, migrations, import/export, or persistence:

```bash
npm test -- src/__tests__/state.test.ts src/__tests__/storage-key-migration.test.ts
```

When changing UI components or interactions, run the closest component tests first, then broaden only if the change touches shared behavior:

```bash
npm test -- src/__tests__/<closest-test-file>.test.ts
```

When changing build config, deployment behavior, TypeScript types, or app-wide imports:

```bash
npm run build
```

## Git and Generated Files

- Do not commit `dist/` unless the user explicitly asks for release artifacts.
- Do not rewrite unrelated worktree changes.
- Keep dependency changes intentional. If `package-lock.json` changes, explain why.
- Prefer small, scoped patches that match existing file organization.

## Notes for Agents

- `CLAUDE.md` exists but appears to describe an older version of the app in some places. Prefer `README.md`, current source, and this file when they disagree.
- The Cloudflare Pages project name is `todolist`; production serves from the built `dist` directory.
- Vite `base` is controlled by `VITE_BASE` and defaults to `/`.
