const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("note, workspace, and storage use textarea editors with import/export controls", () => {
  const html = read("index.html");

  assert.match(html, /<textarea[^>]+id="noteEditor"/);
  assert.match(html, /<textarea[^>]+id="workspaceEditor"/);
  assert.match(html, /<textarea[^>]+id="storageEditor"/);
  assert.match(html, /id="noteBullets"/);
  assert.match(html, /id="importJsonBtn"/);
  assert.match(html, /id="exportJsonBtn"/);
  assert.match(html, /id="importJsonInput"/);
  assert.doesNotMatch(html, /id="noteEditor" class="ws-editor"/);
  assert.doesNotMatch(html, /id="storageEditor" class="ws-editor"/);
});

test("app wires shared textarea indentation, todo companion, and json import/export", () => {
  const js = read("app.js");

  assert.match(js, /const TEXT_EDITORS =/);
  assert.match(js, /function handleTextEditorKeydown/);
  assert.match(js, /function serializeTextEditorValue/);
  assert.match(js, /function updateTextEditorBulletLayer/);
  assert.match(js, /function indentTextEditorSelection/);
  assert.match(js, /function outdentTextEditorSelection/);
  assert.match(js, /function insertIndentedLineBreak/);
  assert.match(js, /function handleWorkspaceTextareaKeydown/);
  assert.match(js, /function serializeWorkspaceTextarea/);
  assert.match(js, /function updateWorkspaceBulletLayer/);
  assert.match(js, /function indentWorkspaceSelection/);
  assert.match(js, /function outdentWorkspaceSelection/);
  assert.match(js, /function insertWorkspaceIndentedLineBreak/);
  assert.match(js, /function handleTodoFocusIn/);
  assert.match(js, /function handleImportJson/);
  assert.match(js, /function exportJsonState/);
  assert.match(js, /function normalizeImportedState/);
});

test("textarea indentation uses real tab characters and keeps bullets at line start", () => {
  const js = read("app.js");

  assert.match(js, /setRangeText\("\\t", range\.start, range\.start, "preserve"\)/);
  assert.match(js, /const cursorPosition = originalStart \+ 1;[\s\S]*textarea\.setSelectionRange\(cursorPosition, cursorPosition\);/);
  assert.match(js, /\.map\(\(line\) => `\\t\$\{line\}`\)/);
  assert.match(js, /setRangeText\(`\\n\$\{indent\}`/);
  assert.doesNotMatch(js, /dot\.style\.marginLeft/);
});

test("focused areas are visually emphasized and typography is lighter", () => {
  const css = read("styles.css");

  assert.match(css, /body\s*{[^}]*font-size:\s*13px/s);
  assert.match(css, /font-weight:\s*400/);
  assert.match(css, /\.panel\.is-focused[\s\S]*box-shadow/);
  assert.match(css, /\.split-block\.is-focused[\s\S]*box-shadow/);
  assert.match(css, /\.todo-section\.is-focused[\s\S]*box-shadow/);
  assert.match(css, /\.text-editor-textarea/);
  assert.match(css, /\.text-bullet-layer/);
});

test("empty regions explain their purpose", () => {
  const html = read("index.html");
  const js = read("app.js");

  assert.match(html, /随手记：临时想法、灵感、草稿先放这里/);
  assert.match(html, /工作空间：拆任务、写步骤、整理当前上下文/);
  assert.match(html, /工程文件：放路径、命令、配置片段/);
  assert.match(js, /const EMPTY_HINTS =/);
  assert.match(js, /function renderTodoEmptyHint/);
  assert.match(js, /把截图或图片粘贴到这里/);
  assert.match(js, /把常用链接或复制文本做成按钮/);
  assert.match(js, /早：放启动任务/);
});

test("save bubble has many npc-style saved messages", () => {
  const js = read("app.js");
  const match = js.match(/const saveMessages = \[([\s\S]*?)\];/);
  assert.ok(match, "saveMessages array should exist");
  const messages = [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);

  assert.ok(messages.length >= 30, `expected at least 30 save messages, got ${messages.length}`);
  assert.ok(messages.some((message) => message.includes("小小记录员")));
  assert.ok(messages.some((message) => message.includes("背包")));
  assert.ok(messages.every((message) => /保存|收好|记下|归档|备份|存好/.test(message)));
});

test("clear completed buttons use a simple diagonal brush icon", () => {
  const html = read("index.html");

  assert.match(html, /class="clear-completed-button[^"]*"[\s\S]*?<svg viewBox="0 0 24 24"/);
  assert.match(html, /M15\.5 3\.5l5 5/);
  assert.doesNotMatch(html, /M8 8h8v2l-1 8H9l-1-8z/);
});
