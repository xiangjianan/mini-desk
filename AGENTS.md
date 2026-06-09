# AGENTS.md

本文件为编码代理提供在该仓库中安全工作的项目上下文。

## 项目概览

Mini Desk 是一个本地优先的个人桌面工作台，基于 Vue 3 单页应用构建。它在一个浏览器界面中集中管理图片片段、便签、快捷动作、待办/提醒列表、工具、工作空间、设置和动态头像 GIF 行为。

该应用默认刻意不依赖后端：

- 看板状态持久化在浏览器 `localStorage` 的 `mini-desk-state-v1` 键下。
- 图片原文和自定义 GIF 原文持久化在同源 IndexedDB 中。
- 为兼容历史版本，仍会处理 `todo-board-state-v1` 和 `todo-board-images-v1` 等旧状态键。

## 技术栈

- Vue 3 with `<script setup lang="ts">`
- TypeScript
- Vite
- Vitest with jsdom
- Naive UI, `@vicons/ionicons5`, `lucide-vue-next`
- Tailwind CSS 4 via `@tailwindcss/vite`
- `src/components/ui/` 下的轻量 shadcn 风格本地组件

## 常用命令

```bash
npm install
npm run dev
npm run dev -- --host 0.0.0.0
npm test
npm run build
npm run deploy:cloudflare
```

常规验证使用 `npm test`。当改动可能影响 TypeScript 契约、打包、部署配置或生产行为时，使用 `npm run build`。

## 仓库结构

- `src/main.ts` 挂载 Vue 应用。
- `src/App.vue` 编排顶层状态、持久化、导入/导出、预览流程、设置、快捷键、动态头像气泡、通知和移动端拦截。
- `src/components/` 包含图片面板、图片预览、快捷按钮、待办面板、工具面板、工作空间面板、设置菜单、外壳和动态头像气泡等功能组件。
- `src/components/ui/` 包含本地 shadcn 风格基础组件。
- `src/state/` 包含默认值、存储、图片、待办、消息、i18n、版本和动态头像 GIF 主题等带类型的领域/状态辅助逻辑。
- `src/utils/` 包含文本编辑和上下文菜单等可复用工具逻辑。
- `src/__tests__/` 包含针对渲染、状态兼容性、UI 契约、交互、消息、部署配置和组件行为的 Vitest 聚焦测试。
- `docs/superpowers/` 包含历史规格和计划。将其视为背景上下文，不要自动当作当前产品事实。

## 开发约定

- UI 文案应放入现有 i18n/state 模式中，不要在组件里硬编码新增文本。
- 修改用户可见文案或设置时，同时维护中文和英文行为。
- 领域逻辑优先放在 `src/state/` 中的类型化辅助函数里，不要把行为分散到各个组件。
- 大体积图片/GIF 原文不要写入 `localStorage`；使用 `src/state/images.ts` 中现有 IndexedDB 辅助函数。
- 修改持久化状态结构时，在 `src/state/storage.ts` 中保持向后兼容。
- 使用与现有存储辅助函数一致的客户端 ID 生成方式。
- 遵循破坏性操作确认模式。删除、导入、清理已完成事项和类似操作都应通过现有 UX 要求确认。
- 注意移动端行为：完整看板面向桌面工作流，小视口会显示移动端拦截/引导体验。
- 除非明确要求，避免大范围视觉重写。当前设计目标是紧凑、低干扰、参考 Apple HIG 的桌面工具型 UI。
- 修改前端 UI 时，验证文本在桌面和移动断点下都能放入容器，控件不会产生意外布局跳动。

## 测试指南

新增功能或行为变更时，最终 TDD 验证默认保持增量。优先运行覆盖所改行为的最小相关测试文件或聚焦 Vitest 过滤条件。只有当改动影响共享状态、持久化、应用级契约、全局 UI 行为或其他跨模块表面时，才运行完整测试套件。

修改状态辅助函数、迁移、导入/导出或持久化时：

```bash
npm test -- src/__tests__/state.test.ts src/__tests__/storage-key-migration.test.ts
```

修改 UI 组件或交互时，先运行最接近的组件测试；只有当改动触及共享行为时，再扩大测试范围：

```bash
npm test -- src/__tests__/<closest-test-file>.test.ts
```

修改构建配置、部署行为、TypeScript 类型或应用级导入时：

```bash
npm run build
```

## Git 与生成文件

- 除非用户明确要求发布产物，不要提交 `dist/`。
- 不要改写无关的工作区变更。
- 依赖变更必须有明确目的。如果 `package-lock.json` 发生变化，需要说明原因。
- 优先提交小而聚焦、符合现有文件组织方式的补丁。
- 每次会话结束后，将本次会话产生的变更提交到 Git；只提交与本次任务相关的文件，不要顺手纳入无关改动。

## 代理注意事项

- `CLAUDE.md` 存在，但部分内容似乎描述的是旧版本应用。若它与其他资料冲突，优先参考 `README.md`、当前源码和本文件。
- Cloudflare Pages 项目名为 `todolist`；生产环境使用构建后的 `dist` 目录。
- Vite `base` 由 `VITE_BASE` 控制，默认值为 `/`。
