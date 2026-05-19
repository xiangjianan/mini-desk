(function () {
  "use strict";

  const STORAGE_KEY = "todo-board-state-v1";
  const IMAGE_DB_NAME = "todo-board-images-v1";
  const IMAGE_STORE_NAME = "images";

  const TEXT_EDITORS = {
    noteEditor: {
      stateKey: "noteLines",
      bulletId: "noteBullets",
      placeholder: "随手记：临时想法、灵感、草稿先放这里。",
    },
    workspaceEditor: {
      stateKey: "workspaceLines",
      bulletId: "workspaceBullets",
      placeholder: "工作空间：拆任务、写步骤、整理当前上下文。Tab 可缩进。",
    },
    storageEditor: {
      stateKey: "storageLines",
      bulletId: "storageBullets",
      placeholder: "写下你的创意吧",
    },
  };

  const DEFAULT_TITLES = {
    "image-title": "🖼 图",
    "note-title": "📝 记",
    "quick-title": "🔗 链",
    "todo-morning-title": "🌅 早",
    "todo-noon-title": "☀️ 中",
    "todo-evening-title": "🌙 晚",
    "workspace-title": "🛠 工作空间",
    "storage-title": "📁 双击可改名",
  };

  const EMPTY_HINTS = {
    images: "把截图或图片粘贴到这里，可预览、复制、拖动排序。",
    quickButtons: "把常用链接或复制文本做成按钮，点击即可复制。",
    todos: {
      morning: "早：放启动任务、晨间提醒和今天最先处理的事项。",
      noon: "中：放午间跟进、临时插入和需要继续推进的事项。",
      evening: "晚：放收尾检查、复盘记录和明天之前要记住的事项。",
    },
  };

  const saveMessages = [
    "保存好啦～",
    "收好啦，放心吧",
    "已存好，继续写吧",
    "嗯，记下了",
    "安安稳稳地存好了",
    "备份完成，安心继续",
    "这一页归档好啦",
    "改动已收好，没有遗漏",
    "放心，都记下来了",
    "整理完毕，存好了",
    "眨眨眼，保存好了",
    "盖个章，已存档",
    "已备份，可以继续冒险了",
    "轻轻合上本子，已保存",
    "把你的想法收好啦",
    "确认过了，全部存好了",
  ];

  const kaomoji = [
    "(＾▽＾)",
    "(｀・ω・´)",
    "(｡･∀･)ﾉﾞ",
    "(๑•̀ㅂ•́)و✧",
    "(￣▽￣)ノ",
    "(ง •_•)ง",
    "(｡•̀ᴗ-)✧",
    "(＾－＾)V",
    "(づ￣ ³￣)づ",
    "( •̀ ω •́ )y",
  ];

  const defaultState = {
    theme: "light",
    customTitles: {},
    noteLines: [],
    workspaceLines: [],
    storageLines: [],
    images: [],
    quickButtons: [],
    showHiddenQuickButtons: false,
    todos: {
      morning: [],
      noon: [],
      evening: [],
    },
  };

  let state = loadState();
  let inputSaveTimer = null;
  let blurSaveTimer = null;
  let bubbleTimer = null;
  let toastTimer = null;
  let focusedTextarea = null;
  let lastTextarea = null;
  let hasTypedInFocusedTextarea = false;
  let activeQuickId = null;
  let activeTodoContext = null;
  let activeImageContext = null;
  let activePreviewId = null;
  let draggedTodo = null;
  let draggedImageId = null;
  let draggedQuickId = null;
  let previewScale = 1;
  let previewX = 0;
  let previewY = 0;
  let isDraggingPreview = false;
  let dragStart = { x: 0, y: 0, previewX: 0, previewY: 0 };

  const elements = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    await hydrateStoredImages();
    applyTheme();
    applyCustomTitles();
    hydrateTextareas();
    bindEvents();
    renderAll();
  }

  function cacheElements() {
    elements.imageCount = document.getElementById("imageCount");
    elements.imageList = document.getElementById("imageList");
    elements.noteEditor = document.getElementById("noteEditor");
    elements.workspaceEditor = document.getElementById("workspaceEditor");
    elements.storageEditor = document.getElementById("storageEditor");
    elements.addQuickBtn = document.getElementById("addQuickBtn");
    elements.quickButtons = document.getElementById("quickButtons");
    elements.toggleHiddenBtn = document.getElementById("toggleHiddenBtn");
    elements.importJsonInput = document.getElementById("importJsonInput");
    elements.themeToggle = document.getElementById("themeToggle");
    elements.iconSun = document.getElementById("iconSun");
    elements.iconMoon = document.getElementById("iconMoon");
    elements.focusCompanion = document.getElementById("focusCompanion");
    elements.focusVideo = document.getElementById("focusVideo");
    elements.saveBubble = document.getElementById("saveBubble");
    elements.toast = document.getElementById("toast");
    elements.quickMenu = document.getElementById("quickMenu");
    elements.todoMenu = document.getElementById("todoMenu");
    elements.quickDialog = document.getElementById("quickDialog");
    elements.quickDialogTitle = document.getElementById("quickDialogTitle");
    elements.quickEditForm = document.getElementById("quickEditForm");
    elements.closeQuickDialog = document.getElementById("closeQuickDialog");
    elements.editQuickTitle = document.getElementById("editQuickTitle");
    elements.editQuickIsLink = document.getElementById("editQuickIsLink");
    elements.editQuickValue = document.getElementById("editQuickValue");
    elements.editQuickValueLabel = document.getElementById("editQuickValueLabel");
    elements.deleteQuickInDialog = document.getElementById("deleteQuickInDialog");
    elements.iconEyeOff = document.getElementById("iconEyeOff");
    elements.iconEye = document.getElementById("iconEye");
    elements.imagePreview = document.getElementById("imagePreview");
    elements.previewStage = document.getElementById("previewStage");
    elements.previewImage = document.getElementById("previewImage");
    elements.closePreview = document.getElementById("closePreview");
    elements.imageMenu = document.getElementById("imageMenu");
    elements.imageListMenu = document.getElementById("imageListMenu");
    elements.previewList = document.getElementById("previewList");
    elements.previewMenu = document.getElementById("previewMenu");
    elements.settingsBtn = document.getElementById("settingsBtn");
    elements.settingsMenu = document.getElementById("settingsMenu");
  }

  function bindEvents() {
    document.addEventListener("paste", handlePaste);
    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("dblclick", handleDocumentDblClick);

    Object.keys(TEXT_EDITORS).forEach((id) => {
      const editor = elements[id];
      editor.addEventListener("input", () => handleTextareaInput(editor));
      editor.addEventListener("keydown", handleTextEditorKeydown);
      editor.addEventListener("focus", () => handleTextareaFocus(editor));
      editor.addEventListener("blur", (event) => handleTextareaBlur(editor, event));
      editor.addEventListener("scroll", () => updateTextEditorBulletLayer(editor));
    });

    window.addEventListener("resize", positionFocusCompanion);
    window.addEventListener("scroll", positionFocusCompanion, true);

    elements.addQuickBtn.addEventListener("click", openAddQuickDialog);
    elements.toggleHiddenBtn.addEventListener("click", toggleHiddenButtons);
    elements.quickButtons.addEventListener("click", handleQuickButtonClick);
    elements.quickButtons.addEventListener("contextmenu", handleQuickContextMenu);
    elements.quickButtons.addEventListener("dragstart", handleQuickDragStart);
    elements.quickButtons.addEventListener("dragover", handleQuickDragOver);
    elements.quickButtons.addEventListener("drop", handleQuickDrop);
    elements.quickButtons.addEventListener("dragend", handleQuickDragEnd);
    elements.quickMenu.addEventListener("click", handleQuickMenuClick);
    elements.todoMenu.addEventListener("click", handleTodoMenuClick);
    elements.closeQuickDialog.addEventListener("click", closeQuickDialog);
    elements.quickEditForm.addEventListener("submit", handleQuickEditSubmit);
    elements.editQuickIsLink.addEventListener("change", updateEditValueLabel);
    elements.deleteQuickInDialog.addEventListener("click", deleteActiveQuickFromDialog);
    elements.importJsonInput.addEventListener("change", handleImportJson);
    elements.themeToggle.addEventListener("click", toggleTheme);
    document.querySelectorAll(".clear-completed-button").forEach((button) => {
      button.addEventListener("click", handleClearCompleted);
    });

    document.querySelectorAll(".todo-list").forEach((list) => {
      list.addEventListener("click", handleTodoListClick);
      list.addEventListener("change", handleTodoChange);
      list.addEventListener("input", handleTodoInput);
      list.addEventListener("keydown", handleTodoKeydown);
      list.addEventListener("focusin", handleTodoFocusIn);
      list.addEventListener("focusout", handleTodoFocusOut);
      list.addEventListener("contextmenu", handleTodoContextMenu);
      list.addEventListener("dragstart", handleTodoDragStart);
      list.addEventListener("dragover", handleTodoDragOver);
      list.addEventListener("dragleave", handleTodoDragLeave);
      list.addEventListener("drop", handleTodoDrop);
      list.addEventListener("dragend", handleTodoDragEnd);
    });

    elements.imageList.addEventListener("click", handleImageListClick);
    elements.imageList.addEventListener("dblclick", handleImageListDoubleClick);
    elements.imageList.addEventListener("contextmenu", handleImageContextMenu);
    elements.imageList.addEventListener("dragstart", handleImageDragStart);
    elements.imageList.addEventListener("dragover", handleImageDragOver);
    elements.imageList.addEventListener("drop", handleImageDrop);
    elements.imageList.addEventListener("dragend", handleImageDragEnd);
    elements.imageMenu.addEventListener("click", handleImageMenuClick);
    elements.imageListMenu.addEventListener("click", handleImageListMenuClick);
    elements.closePreview.addEventListener("click", closeImagePreview);
    elements.imagePreview.addEventListener("wheel", handlePreviewWheel, { passive: false });
    elements.previewStage.addEventListener("click", handlePreviewStageClick);
    elements.previewStage.addEventListener("contextmenu", handlePreviewContextMenu);
    elements.previewStage.addEventListener("mousedown", startPreviewDrag);
    elements.previewMenu.addEventListener("click", handlePreviewMenuClick);
    elements.previewList.addEventListener("click", handlePreviewListClick);
    elements.previewList.addEventListener("contextmenu", handlePreviewListContextMenu);
    elements.settingsBtn.addEventListener("click", handleSettingsClick);
    elements.settingsMenu.addEventListener("click", handleSettingsMenuClick);
    window.addEventListener("mousemove", movePreviewDrag);
    window.addEventListener("mouseup", endPreviewDrag);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return structuredClone(defaultState);
      }
      const parsed = JSON.parse(raw);
      const result = {
        ...structuredClone(defaultState),
        ...parsed,
        todos: {
          ...structuredClone(defaultState.todos),
          ...(parsed.todos || {}),
        },
      };
      if (typeof result.workspaceLines === "string") {
        result.workspaceLines = migrateWorkspaceText(result.workspaceLines);
        delete result.workspace;
      } else if (result.workspace !== undefined) {
        result.workspaceLines = migrateWorkspaceText(result.workspace);
        delete result.workspace;
      }
      if (result.note !== undefined && !result.noteLines) {
        result.noteLines = migrateWorkspaceText(result.note);
        delete result.note;
      }
      if (result.storage !== undefined && !result.storageLines) {
        result.storageLines = migrateWorkspaceText(result.storage);
        delete result.storage;
      }
      return result;
    } catch (error) {
      console.warn("无法读取本地数据，使用默认状态。", error);
      return structuredClone(defaultState);
    }
  }

  function migrateWorkspaceText(text) {
    if (!text) return [];
    return text.split("\n").map((line) => ({ text: line, indent: 0 }));
  }

  function saveState(options = {}) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getSerializableState({ includeImageData: false })));
    } catch (error) {
      console.warn("保存本地数据失败。", error);
      showToast("本地保存空间不足，图片仍保留在当前页面");
    }
    if (options.showBubble) {
      showSaveBubble();
    }
  }

  function getSerializableState(options = {}) {
    const { includeImageData = true } = options;
    const todos = Object.fromEntries(
      Object.entries(state.todos).map(([period, todosForPeriod]) => [
        period,
        todosForPeriod.filter((todo) => todo.text.trim()),
      ])
    );
    return {
      ...state,
      images: includeImageData ? state.images : serializeImagesForLocalStorage(state.images),
      todos,
    };
  }

  function serializeImagesForLocalStorage(images) {
    return images.map((image) => ({
      id: image.id,
      createdAt: image.createdAt,
    }));
  }

  function exportJsonState() {
    flushTextareaState();
    const payload = {
      app: "todo-board",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: getSerializableState(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `todo-board-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("JSON 已导出");
  }

  async function handleImportJson(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text());
      const importedState = normalizeImportedState(parsed);
      if (!window.confirm("导入 JSON 会覆盖当前页面所有数据，继续吗？")) {
        return;
      }
      state = importedState;
      await persistImagePayloads();
      saveState();
      applyTheme();
      applyCustomTitles();
      renderAll();
      showToast("JSON 已导入");
    } catch (error) {
      console.warn("JSON 导入失败。", error);
      showToast("JSON 导入失败");
    } finally {
      event.target.value = "";
    }
  }

  function normalizeImportedState(payload) {
    const imported = payload?.data && isPlainObject(payload.data) ? payload.data : payload;
    if (!isPlainObject(imported)) {
      throw new Error("导入内容不是有效的状态对象");
    }

    const nextState = {
      ...structuredClone(defaultState),
      ...imported,
      customTitles: isPlainObject(imported.customTitles) ? imported.customTitles : {},
      noteLines: normalizeLineCollection(imported.noteLines ?? imported.note),
      workspaceLines: normalizeLineCollection(imported.workspaceLines ?? imported.workspace),
      storageLines: normalizeLineCollection(imported.storageLines ?? imported.storage),
      images: normalizeImages(imported.images),
      quickButtons: normalizeQuickButtons(imported.quickButtons),
      showHiddenQuickButtons: Boolean(imported.showHiddenQuickButtons),
      todos: normalizeTodos(imported.todos),
    };

    nextState.theme = imported.theme === "dark" ? "dark" : "light";
    return nextState;
  }

  function normalizeLineCollection(value) {
    if (typeof value === "string") {
      return migrateWorkspaceText(value);
    }
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((line) => {
      if (typeof line === "string") {
        return { text: line, indent: 0 };
      }
      return {
        text: String(line?.text ?? ""),
        indent: Math.max(0, Number(line?.indent) || 0),
      };
    });
  }

  function normalizeImages(images) {
    if (!Array.isArray(images)) {
      return [];
    }
    return images
      .filter((image) => image && (typeof image.src === "string" || image.id !== undefined))
      .map((image) => ({
        id: String(image.id || createId()),
        src: typeof image.src === "string" ? image.src : "",
        createdAt: Number(image.createdAt) || Date.now(),
      }));
  }

  function normalizeQuickButtons(buttons) {
    if (!Array.isArray(buttons)) {
      return [];
    }
    return buttons
      .filter((button) => button && button.title !== undefined && button.value !== undefined)
      .map((button) => ({
        id: String(button.id || createId()),
        title: String(button.title),
        value: String(button.value),
        type: button.type === "text" ? "text" : "link",
        hidden: Boolean(button.hidden),
      }));
  }

  function normalizeTodos(todos) {
    const normalized = structuredClone(defaultState.todos);
    Object.keys(normalized).forEach((period) => {
      const items = Array.isArray(todos?.[period]) ? todos[period] : [];
      normalized[period] = items
        .filter((todo) => todo && todo.text !== undefined)
        .map((todo) => ({
          id: String(todo.id || createId()),
          text: String(todo.text),
          done: Boolean(todo.done),
        }));
    });
    return normalized;
  }

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function openImageDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB 不可用"));
        return;
      }

      const request = window.indexedDB.open(IMAGE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
          db.createObjectStore(IMAGE_STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("无法打开图片存储"));
    });
  }

  async function storeImagePayload(image) {
    const db = await openImageDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(IMAGE_STORE_NAME, "readwrite");
      transaction.objectStore(IMAGE_STORE_NAME).put({
        id: image.id,
        src: image.src,
      });
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error("图片写入失败"));
      };
    });
  }

  async function getStoredImagePayload(id) {
    const db = await openImageDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(IMAGE_STORE_NAME, "readonly");
      const request = transaction.objectStore(IMAGE_STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("图片读取失败"));
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error("图片读取失败"));
      };
    });
  }

  async function deleteStoredImage(id) {
    const db = await openImageDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(IMAGE_STORE_NAME, "readwrite");
      transaction.objectStore(IMAGE_STORE_NAME).delete(id);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error("图片删除失败"));
      };
    });
  }

  async function persistImagePayloads() {
    const imagesWithPayload = state.images.filter((image) => image.src);
    await Promise.all(imagesWithPayload.map((image) => storeImagePayload(image)));
  }

  async function hydrateStoredImages() {
    try {
      const hydratedImages = await Promise.all(
        state.images.map(async (image) => {
          if (image.src) {
            await storeImagePayload(image);
            return image;
          }
          const stored = await getStoredImagePayload(image.id);
          return stored?.src ? { ...image, src: stored.src } : null;
        })
      );
      state.images = hydratedImages.filter(Boolean);
      saveState();
    } catch (error) {
      console.warn("图片数据恢复失败。", error);
      state.images = state.images.filter((image) => image.src);
    }
  }

  function hydrateTextareas() {
    Object.keys(TEXT_EDITORS).forEach((id) => hydrateTextEditor(elements[id]));
  }

  function hydrateTextEditor(textarea) {
    const config = getTextEditorConfig(textarea);
    if (!config) return;
    textarea.value = textEditorLinesToText(state[config.stateKey]);
    
  }

  function textEditorLinesToText(lines) {
    if (!Array.isArray(lines) || lines.length === 0) {
      return "";
    }
    return lines
      .map((line) => {
        const indent = Math.max(0, Number(line?.indent) || 0);
        const text = line?.text || "";
        const tabs = "\t".repeat(indent);
        return text ? `${tabs}- ${text}` : tabs;
      })
      .join("\n");
  }

  function serializeTextEditorValue(value = "") {
    if (!value) {
      return [];
    }
    return value.split("\n").map((line) => {
      const indentMatch = line.match(/^\t*/);
      const indent = indentMatch ? indentMatch[0].length : 0;
      let text = line.slice(indent);
      if (text.startsWith("- ")) text = text.slice(2);
      return { text, indent };
    });
  }

  function serializeWorkspaceTextarea(value = elements.workspaceEditor.value) {
    return serializeTextEditorValue(value);
  }

  function renderAll() {
    renderImages();
    renderQuickButtons();
    renderTodos();
    hydrateTextareas();
  }

  function getTextEditorConfig(textarea) {
    return TEXT_EDITORS[textarea.id];
  }

  function triggerTextEditorSave(textarea) {
    hasTypedInFocusedTextarea = true;
    if (inputSaveTimer) {
      clearTimeout(inputSaveTimer);
    }
    inputSaveTimer = setTimeout(() => {
      flushTextEditorState(textarea);
      saveState({ showBubble: true });
      inputSaveTimer = null;
    }, 3000);
  }

  function triggerWorkspaceTextareaSave(textarea) {
    triggerTextEditorSave(textarea);
  }

  function flushTextEditorState(textarea) {
    if (!textarea) return;
    const config = getTextEditorConfig(textarea);
    if (!config) return;
    state[config.stateKey] = serializeTextEditorValue(textarea.value);
  }

  function flushWorkspaceTextareaState(textarea = elements.workspaceEditor) {
    flushTextEditorState(textarea);
  }

  function handleTextEditorKeydown(event) {
    if (event.key === "Tab") {
      event.preventDefault();
      if (event.shiftKey) {
        outdentTextEditorSelection(event.currentTarget);
      } else {
        indentTextEditorSelection(event.currentTarget);
      }
      flushTextEditorState(event.currentTarget);
      triggerTextEditorSave(event.currentTarget);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (insertIndentedLineBreak(event.currentTarget)) {
        flushTextEditorState(event.currentTarget);
        triggerTextEditorSave(event.currentTarget);
      }
    }
  }

  function handleWorkspaceTextareaKeydown(event) {
    handleTextEditorKeydown(event);
  }

  function indentTextEditorSelection(textarea) {
    const originalStart = textarea.selectionStart;
    const originalEnd = textarea.selectionEnd;
    const range = getTextEditorSelectedLineRange(textarea);

    if (originalStart === originalEnd) {
      // Single cursor: insert tab before text, re-hydrate to add bullet
      const lines = serializeTextEditorValue(textarea.value);
      const lineIdx = textarea.value.slice(0, originalStart).split("\n").length - 1;
      const col = originalStart - (textarea.value.slice(0, originalStart).lastIndexOf("\n") + 1);
      if (lineIdx >= 0 && lineIdx < lines.length) {
        lines[lineIdx].indent += 1;
      }
      textarea.value = textEditorLinesToText(lines);
      // Restore cursor: find position on same line, offset by 1 tab
      const hydratedLines = textarea.value.split("\n");
      let pos = 0;
      for (let i = 0; i < lineIdx; i++) pos += hydratedLines[i].length + 1;
      const tabCount = lines[lineIdx]?.indent || 0;
      const bulletLen = (lines[lineIdx]?.text) ? 2 : 0; // "- " length
      const restoreCol = Math.min(col + 1, tabCount + bulletLen + (lines[lineIdx]?.text?.length || 0));
      const finalPos = pos + Math.max(restoreCol, tabCount + bulletLen);
      textarea.setSelectionRange(finalPos, finalPos);
      return;
    }

    const selectedText = textarea.value.slice(range.start, range.end);
    const indented = selectedText
      .split("\n")
      .map((line) => `\t${line}`)
      .join("\n");
    textarea.setRangeText(indented, range.start, range.end, "preserve");
    const selectionStart = originalStart + countInsertedTabsBeforeOffset(selectedText, originalStart - range.start);
    const selectionEnd = originalEnd + countInsertedTabsBeforeOffset(selectedText, originalEnd - range.start);
    textarea.setSelectionRange(selectionStart, selectionEnd);
    
  }

  function countInsertedTabsBeforeOffset(text, offset) {
    let count = 1;
    for (let index = 0; index < offset; index += 1) {
      if (text[index] === "\n") {
        count += 1;
      }
    }
    return count;
  }

  function indentWorkspaceSelection(textarea) {
    indentTextEditorSelection(textarea);
  }

  function outdentTextEditorSelection(textarea) {
    const range = getTextEditorSelectedLineRange(textarea);
    const selectedText = textarea.value.slice(range.start, range.end);
    // Save cursor position relative to text content before modification
    const cursorLineStart = textarea.value.lastIndexOf("\n", Math.max(0, textarea.selectionStart - 1)) + 1;
    const cursorLine = textarea.value.slice(cursorLineStart, textarea.value.indexOf("\n", textarea.selectionStart) === -1 ? textarea.value.length : textarea.value.indexOf("\n", textarea.selectionStart));
    const oldIndentLen = (cursorLine.match(/^\t*/)?.[0].length || 0);
    const oldBulletLen = cursorLine.slice(oldIndentLen).startsWith("- ") ? 2 : 0;
    const oldTextStart = oldIndentLen + oldBulletLen;
    const cursorColInText = Math.max(0, textarea.selectionStart - cursorLineStart - oldTextStart);
    const lineIdx = textarea.value.slice(0, cursorLineStart).split("\n").length - 1;
    // Outdent selected lines
    const outdented = selectedText
      .split("\n")
      .map((line) => {
        if (!line.startsWith("\t")) {
          return line;
        }
        return line.slice(1);
      })
      .join("\n");
    textarea.setRangeText(outdented, range.start, range.end, "end");
    // Serialize and re-hydrate to fix bullet display
    const lines = serializeTextEditorValue(textarea.value);
    textarea.value = textEditorLinesToText(lines);
    // Restore cursor on same line, same relative position to text
    const hydratedLines = textarea.value.split("\n");
    const targetIdx = Math.min(lineIdx, hydratedLines.length - 1);
    let pos = 0;
    for (let i = 0; i < targetIdx; i++) pos += hydratedLines[i].length + 1;
    const newLine = hydratedLines[targetIdx] || "";
    const newIndentLen = (newLine.match(/^\t*/)?.[0].length || 0);
    const newBulletLen = newLine.slice(newIndentLen).startsWith("- ") ? 2 : 0;
    const textLen = newLine.length - newIndentLen - newBulletLen;
    const finalPos = pos + newIndentLen + newBulletLen + Math.min(cursorColInText, Math.max(0, textLen));
    textarea.setSelectionRange(finalPos, finalPos);
  }

  function outdentWorkspaceSelection(textarea) {
    outdentTextEditorSelection(textarea);
  }

  function insertIndentedLineBreak(textarea) {
    if (textarea.selectionStart !== textarea.selectionEnd) {
      return false;
    }
    const lineStart = textarea.value.lastIndexOf("\n", textarea.selectionStart - 1) + 1;
    const line = textarea.value.slice(lineStart, textarea.selectionStart);
    const indent = line.match(/^\t*/)?.[0] || "";
    // Check if line has a bullet
    const hasBullet = line.startsWith(indent) && line.slice(indent.length).startsWith("- ");
    const bullet = (indent && hasBullet) ? "- " : "";
    textarea.setRangeText(`\n${indent}${bullet}`, textarea.selectionStart, textarea.selectionEnd, "end");
    return true;
  }

  function insertWorkspaceIndentedLineBreak(textarea) {
    return insertIndentedLineBreak(textarea);
  }

  function getTextEditorSelectedLineRange(textarea) {
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const rangeStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const effectiveEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
    const nextBreak = value.indexOf("\n", effectiveEnd);
    const rangeEnd = nextBreak === -1 ? value.length : nextBreak;
    return { start: rangeStart, end: rangeEnd };
  }

  function updateTextEditorBulletLayer() {
    // no-op: bullets are inline in textarea text
  }

  function updateWorkspaceBulletLayer() {
    // no-op
  }

  function renderImages() {
    elements.imageCount.textContent = String(state.images.length);
    elements.imageList.innerHTML = "";

    if (state.images.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = EMPTY_HINTS.images;
      elements.imageList.append(empty);
      return;
    }

    state.images.forEach((image, index) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "image-card";
      card.dataset.id = image.id;
      card.draggable = true;
      card.title = "单击预览，双击复制";

      const indexLabel = document.createElement("span");
      indexLabel.className = "image-index";
      indexLabel.textContent = String(index + 1);

      const img = document.createElement("img");
      img.src = image.src;
      img.alt = "图床图片";

      card.append(indexLabel, img);
      elements.imageList.append(card);
    });
  }

  function renderQuickButtons() {
    const showing = state.showHiddenQuickButtons;
    const toggleLabel = showing ? "隐藏已隐藏快捷链接" : "显示全部快捷链接";
    elements.toggleHiddenBtn.setAttribute("aria-label", toggleLabel);
    elements.toggleHiddenBtn.title = toggleLabel;
    elements.iconEyeOff.style.display = showing ? "" : "none";
    elements.iconEye.style.display = showing ? "none" : "";
    elements.quickButtons.innerHTML = "";

    const visibleButtons = state.quickButtons.filter((button) => {
      return state.showHiddenQuickButtons || !button.hidden;
    });

    if (visibleButtons.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = EMPTY_HINTS.quickButtons;
      elements.quickButtons.append(empty);
      return;
    }

    visibleButtons.forEach((button) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `quick-button${button.hidden ? " is-hidden" : ""}`;
      item.dataset.id = button.id;
      item.draggable = true;
      item.title = button.hidden ? "已隐藏，右键可取消隐藏" : "点击复制，右键编辑";
      if (button.type === "text") {
        item.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="vertical-align:-2px;margin-right:2px;flex-shrink:0"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>${button.title}</span>`;
      } else {
        item.textContent = button.title;
      }
      elements.quickButtons.append(item);
    });
  }

  function renderTodos() {
    Object.keys(state.todos).forEach((period) => {
      const list = document.querySelector(`[data-list="${period}"]`);
      const count = document.querySelector(`[data-count="${period}"]`);
      const todos = getOrderedTodos(state.todos[period]);
      list.innerHTML = "";
      count.textContent = String(todos.filter((todo) => !todo.done).length);

      if (todos.length === 0) {
        renderTodoEmptyHint(list, period);
        return;
      }

      todos.forEach((todo) => {
        const item = document.createElement("li");
        item.className = `todo-item${todo.done ? " is-done" : ""}`;
        item.dataset.id = todo.id;
        item.dataset.period = period;
        item.draggable = true;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = todo.done;
        checkbox.setAttribute("aria-label", "标记完成");

        const text = document.createElement("input");
        text.type = "text";
        text.className = "todo-text";
        text.value = todo.text;
        text.placeholder = DEFAULT_TITLES[`todo-${period}-title`] || "提醒事项";
        text.autocomplete = "off";
        text.spellcheck = false;
        text.setAttribute("aria-label", `编辑${DEFAULT_TITLES[`todo-${period}-title`] || "提醒事项"}`);

        item.append(checkbox, text);
        list.append(item);
      });
    });
  }

  function renderTodoEmptyHint(list, period) {
    const empty = document.createElement("li");
    empty.className = "todo-empty hint";
    empty.textContent = EMPTY_HINTS.todos[period] || "点击空白处新增提醒事项。";
    list.append(empty);
  }

  function handlePaste(event) {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) {
      return;
    }

    event.preventDefault();
    imageItems.forEach((item) => {
      const file = item.getAsFile();
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        const image = {
          id: createId(),
          src: reader.result,
          createdAt: Date.now(),
        };
        try {
          await storeImagePayload(image);
          state.images.push(image);
          saveState();
          renderImages();
          showToast("图片已添加到图床");
        } catch (error) {
          console.warn("图片保存失败。", error);
          showToast("图片保存失败，请稍后再试");
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function handleKeydown(event) {
    const key = event.key;
    if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === "s") {
      event.preventDefault();
      flushTextareaState();
      saveState({ showBubble: true });
      return;
    }

    if (!activePreviewId) {
      return;
    }

    if (key === "Delete" || key === "Backspace") {
      event.preventDefault();
      if (confirmDelete("确定要删除这张图片吗？")) {
        const nextId = findAdjacentImageId(activePreviewId, 1);
        deleteImage(activePreviewId);
        if (nextId) {
          openImagePreview(nextId);
        } else {
          closeImagePreview();
        }
      }
    } else if (key === "Enter") {
      event.preventDefault();
      const image = findImage(activePreviewId);
      if (image) {
        copyImageToClipboard(image);
      }
    } else if (key === "Escape" || key === " ") {
      event.preventDefault();
      closeImagePreview();
    } else if (key === "ArrowLeft" || key === "ArrowUp") {
      event.preventDefault();
      navigatePreview(-1);
    } else if (key === "ArrowRight" || key === "ArrowDown") {
      event.preventDefault();
      navigatePreview(1);
    }
  }

  function handleDocumentClick(event) {
    if (!elements.quickMenu.contains(event.target)) {
      closeQuickMenu();
    }
    if (!elements.todoMenu.contains(event.target)) {
      closeTodoMenu();
    }
    if (!elements.imageMenu.contains(event.target)) {
      closeImageMenu();
    }
    if (elements.imageListMenu && !elements.imageListMenu.contains(event.target)) {
      closeImageListMenu();
    }
    if (elements.previewMenu && !elements.previewMenu.contains(event.target)) {
      closePreviewMenu();
    }
    if (elements.settingsMenu && !elements.settingsMenu.contains(event.target) && !elements.settingsBtn.contains(event.target)) {
      closeSettingsMenu();
    }
  }

  function handleDocumentDblClick(event) {
    const heading = event.target.closest(".panel-header h1, .panel-header h2, .todo-heading h3");
    if (!heading) return;
    if (heading.querySelector("input")) return;

    const id = heading.id || heading.closest(".panel-header")?.querySelector("h1, h2")?.id;
    if (!id) return;

    const original = heading.textContent;
    const input = document.createElement("input");
    input.type = "text";
    input.value = original;
    input.className = "title-edit-input";
    heading.textContent = "";
    heading.append(input);
    input.focus();
    input.select();

    const commit = () => {
      const value = input.value.trim() || original;
      heading.textContent = value;
      if (value !== original) {
        state.customTitles[id] = value;
        saveState();
      }
    };

    input.addEventListener("blur", commit, { once: true });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      } else if (e.key === "Escape") {
        input.value = original;
        input.blur();
      }
    });
  }

  function applyCustomTitles() {
    Object.entries(DEFAULT_TITLES).forEach(([id, defaultTitle]) => {
      const heading = document.getElementById(id);
      if (heading) {
        heading.textContent = state.customTitles[id] || defaultTitle;
      }
    });
  }

  function handleTextareaFocus(textarea) {
    if (blurSaveTimer) {
      clearTimeout(blurSaveTimer);
      blurSaveTimer = null;
    }

    focusedTextarea = textarea;
    lastTextarea = textarea;
    hasTypedInFocusedTextarea = false;
    markFocusedArea(textarea);
    showFocusCompanion(textarea);
  }

  function handleTextareaInput(textarea) {
    const config = getTextEditorConfig(textarea);
    if (config) {
      flushTextEditorState(textarea);
      
      triggerTextEditorSave(textarea);
    }
  }

  function handleTextareaBlur(textarea, event) {
    if (event?.relatedTarget && textarea.contains(event.relatedTarget)) {
      return;
    }
    focusedTextarea = null;
    clearFocusedAreas();
    hideFocusCompanion();

    if (!hasTypedInFocusedTextarea) {
      return;
    }

    const config = getTextEditorConfig(textarea);
    if (config && inputSaveTimer) {
      clearTimeout(inputSaveTimer);
      inputSaveTimer = null;
      flushTextEditorState(textarea);
      saveState({ showBubble: true });
      return;
    }

    if (blurSaveTimer) {
      clearTimeout(blurSaveTimer);
    }

    blurSaveTimer = setTimeout(() => {
      if (config) {
        flushTextEditorState(textarea);
      }
      saveState({ showBubble: true });
      blurSaveTimer = null;
    }, 1000);
  }

  function updateTextareaState(textarea) {
    const config = getTextEditorConfig(textarea);
    if (config) {
      flushTextEditorState(textarea);
    }
  }

  function flushTextareaState() {
    Object.keys(TEXT_EDITORS).forEach((id) => flushTextEditorState(elements[id]));
  }

  function markFocusedArea(target) {
    clearFocusedAreas();
    const area = target.closest(".split-block") || target.closest(".todo-section") || target.closest(".panel") || target;
    area.classList.add("is-focused");
  }

  function clearFocusedAreas() {
    document.querySelectorAll(".panel.is-focused, .split-block.is-focused, .todo-section.is-focused").forEach((area) => {
      area.classList.remove("is-focused");
    });
  }

  function showFocusCompanion(textarea) {
    positionFocusCompanion(textarea);
    elements.focusCompanion.classList.add("is-visible");
    elements.focusCompanion.setAttribute("aria-hidden", "false");
  }

  function hideFocusCompanion() {
    elements.focusCompanion.classList.remove("is-visible");
    elements.focusCompanion.setAttribute("aria-hidden", "true");
  }

  function positionFocusCompanion(textarea) {
    if (textarea === undefined) {
      textarea = focusedTextarea || lastTextarea;
    }
    if (textarea !== null && !(textarea instanceof HTMLElement)) {
      textarea = focusedTextarea || lastTextarea;
    }
    const size = 72;
    const gap = 12;
    if (!textarea) {
      elements.focusCompanion.style.left = `${window.innerWidth - size - gap}px`;
      elements.focusCompanion.style.top = `${window.innerHeight - size - gap}px`;
      return;
    }
    const rect = textarea.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - size - 8, rect.right - size - 6));
    const top = Math.max(8, Math.min(window.innerHeight - size - 8, rect.bottom - size - 6));
    elements.focusCompanion.style.left = `${left}px`;
    elements.focusCompanion.style.top = `${top}px`;
  }

  function showSaveBubble() {
    const text = randomItem(saveMessages);
    const face = randomItem(kaomoji);
    elements.saveBubble.textContent = `${text} ${face}`;
    elements.focusCompanion.classList.add("is-visible");
    elements.focusCompanion.setAttribute("aria-hidden", "false");
    elements.saveBubble.classList.add("is-visible");
    if (bubbleTimer) {
      clearTimeout(bubbleTimer);
    }
    bubbleTimer = setTimeout(() => {
      elements.saveBubble.classList.remove("is-visible");
      if (!focusedTextarea) {
        hideFocusCompanion();
      }
    }, 3000);
  }

  function handleQuickButtonClick(event) {
    const button = event.target.closest(".quick-button");
    if (!button) {
      return;
    }
    const item = findQuickButton(button.dataset.id);
    if (!item) {
      return;
    }
    if (item.type === "link") {
      window.open(item.value, "_blank");
    } else {
      copyTextToClipboard(item.value, "文本已复制");
    }
  }

  function handleQuickContextMenu(event) {
    const button = event.target.closest(".quick-button");
    if (!button) {
      return;
    }
    event.preventDefault();
    closeTodoMenu();
    activeQuickId = button.dataset.id;
    const item = findQuickButton(activeQuickId);
    const hideButton = elements.quickMenu.querySelector('[data-action="hide"]');
    hideButton.textContent = item?.hidden ? "取消隐藏" : "隐藏";
    elements.quickMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 130)}px`;
    elements.quickMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 110)}px`;
    elements.quickMenu.classList.add("is-visible");
    elements.quickMenu.setAttribute("aria-hidden", "false");
  }

  function handleQuickMenuClick(event) {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton || !activeQuickId) {
      return;
    }

    const action = actionButton.dataset.action;
    let shouldCloseMenu = true;
    if (action === "edit") {
      openQuickDialog(activeQuickId);
    } else if (action === "hide") {
      toggleQuickHidden(activeQuickId);
    } else if (action === "delete") {
      const item = findQuickButton(activeQuickId);
      if (confirmDelete(`确定要删除快捷按钮“${item?.title || ""}”吗？`)) {
        deleteQuickButton(activeQuickId);
      } else {
        shouldCloseMenu = false;
      }
    }
    if (shouldCloseMenu) {
      closeQuickMenu();
    }
  }

  function openQuickDialog(id) {
    const item = findQuickButton(id);
    if (!item) {
      return;
    }
    activeQuickId = id;
    elements.quickDialogTitle.textContent = "编辑快捷按钮";
    elements.deleteQuickInDialog.hidden = false;
    elements.editQuickTitle.value = item.title;
    elements.editQuickIsLink.checked = item.type === "link";
    elements.editQuickValue.value = item.value;
    updateEditValueLabel();
    elements.quickDialog.showModal();
  }

  function openAddQuickDialog() {
    activeQuickId = null;
    elements.quickDialogTitle.textContent = "新增快捷按钮";
    elements.deleteQuickInDialog.hidden = true;
    elements.editQuickTitle.value = "";
    elements.editQuickIsLink.checked = true;
    elements.editQuickValue.value = "";
    updateEditValueLabel();
    elements.quickDialog.showModal();
    elements.editQuickTitle.focus();
  }

  function closeQuickDialog() {
    elements.quickDialog.close();
  }

  function handleQuickEditSubmit(event) {
    event.preventDefault();
    const title = elements.editQuickTitle.value.trim();
    const value = elements.editQuickValue.value.trim();
    const type = elements.editQuickIsLink.checked ? "link" : "text";

    if (!title || !value) {
      showToast("请填写标题和内容");
      return;
    }

    if (activeQuickId) {
      const item = findQuickButton(activeQuickId);
      if (!item) {
        return;
      }
      item.title = title;
      item.value = value;
      item.type = type;
    } else {
      state.quickButtons.push({
        id: createId(),
        title,
        value,
        type,
        hidden: false,
      });
    }

    saveState();
    renderQuickButtons();
    closeQuickDialog();
  }

  function updateEditValueLabel() {
    elements.editQuickValueLabel.textContent = elements.editQuickIsLink.checked ? "URL" : "复制文本";
  }

  function deleteActiveQuickFromDialog() {
    if (activeQuickId) {
      const item = findQuickButton(activeQuickId);
      if (confirmDelete(`确定要删除快捷按钮“${item?.title || ""}”吗？`)) {
        deleteQuickButton(activeQuickId);
        closeQuickDialog();
      }
    }
  }

  function toggleHiddenButtons() {
    state.showHiddenQuickButtons = !state.showHiddenQuickButtons;
    saveState();
    renderQuickButtons();
  }

  function toggleQuickHidden(id) {
    const item = findQuickButton(id);
    if (!item) {
      return;
    }
    item.hidden = !item.hidden;
    saveState();
    renderQuickButtons();
  }

  function deleteQuickButton(id) {
    state.quickButtons = state.quickButtons.filter((button) => button.id !== id);
    saveState();
    renderQuickButtons();
  }

  function closeQuickMenu() {
    elements.quickMenu.classList.remove("is-visible");
    elements.quickMenu.setAttribute("aria-hidden", "true");
  }

  function closeTodoMenu() {
    elements.todoMenu.classList.remove("is-visible");
    elements.todoMenu.setAttribute("aria-hidden", "true");
    activeTodoContext = null;
  }

  function findQuickButton(id) {
    return state.quickButtons.find((button) => button.id === id);
  }

  function handleTodoFocusIn(event) {
    if (!event.target.matches(".todo-text")) {
      return;
    }
    const section = event.target.closest(".todo-section");
    if (!section) {
      return;
    }
    focusedTextarea = section;
    lastTextarea = section;
    markFocusedArea(section);
    showFocusCompanion(section);
  }

  function handleTodoChange(event) {
    if (!event.target.matches('input[type="checkbox"]')) {
      return;
    }
    const item = event.target.closest(".todo-item");
    if (!item) {
      return;
    }
    const todo = findTodo(item.dataset.period, item.dataset.id);
    if (!todo) {
      return;
    }
    todo.done = event.target.checked;
    normalizeTodoPeriod(item.dataset.period);
    saveState();
    renderTodos();
  }

  function handleClearCompleted(event) {
    const period = event.currentTarget.dataset.clearCompleted;
    const completedCount = state.todos[period].filter((todo) => todo.done).length;
    if (completedCount === 0) {
      showToast("没有已完成事项");
      return;
    }
    if (!confirmDelete(`确定要清除 ${completedCount} 条已完成事项吗？`)) {
      return;
    }
    state.todos[period] = state.todos[period].filter((todo) => !todo.done);
    saveState();
    renderTodos();
    clearFocusedAreas();
    hideFocusCompanion();
  }

  function handleTodoInput(event) {
    if (!event.target.matches(".todo-text")) {
      return;
    }
    handleTodoFocusIn(event);
    const item = event.target.closest(".todo-item");
    const todo = findTodo(item.dataset.period, item.dataset.id);
    if (!todo) {
      return;
    }
    todo.text = event.target.value;
    saveState();
  }

  function handleTodoKeydown(event) {
    if (!event.target.matches(".todo-text") || event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const item = event.target.closest(".todo-item");
    updateTodoTextFromInput(event.target);
    if (!event.target.value.trim()) {
      return;
    }
    insertTodoAfter(item.dataset.period, item.dataset.id, "", true);
  }

  function handleTodoFocusOut(event) {
    if (!event.target.matches(".todo-text")) {
      return;
    }
    const section = event.target.closest(".todo-section");
    const item = event.target.closest(".todo-item");
    const todo = findTodo(item.dataset.period, item.dataset.id);
    if (!todo) {
      settleTodoFocusOut(section);
      return;
    }
    todo.text = event.target.value;
    if (todo.text.trim()) {
      saveState();
      settleTodoFocusOut(section);
      return;
    }
    removeTodo(item.dataset.period, item.dataset.id);
    settleTodoFocusOut(section);
  }

  function settleTodoFocusOut(section) {
    requestAnimationFrame(() => {
      if (!section || document.activeElement?.closest(".todo-section") === section) {
        return;
      }
      section.classList.remove("is-focused");
      if (focusedTextarea === section) {
        focusedTextarea = null;
        hideFocusCompanion();
      }
    });
  }

  function handleTodoListClick(event) {
    const item = event.target.closest(".todo-item");
    if (item) {
      if (!event.target.matches('input[type="checkbox"]')) {
        item.querySelector(".todo-text")?.focus();
      }
      return;
    }
    if (event.target === event.currentTarget) {
      addTodo(event.currentTarget.dataset.list, "", true);
    }
  }

  function addTodo(period, text = "", shouldFocus = false) {
    const todo = {
      id: createId(),
      text,
      done: false,
    };
    state.todos[period].push(todo);
    normalizeTodoPeriod(period);
    if (todo.text.trim()) {
      saveState();
    }
    renderTodos();
    if (shouldFocus) {
      focusTodoInput(todo.id);
    }
    return todo;
  }

  function insertTodoAfter(period, afterId, text = "", shouldFocus = false) {
    const todo = {
      id: createId(),
      text,
      done: false,
    };
    const index = state.todos[period].findIndex((item) => item.id === afterId);
    const insertIndex = index < 0 ? state.todos[period].length : index + 1;
    state.todos[period].splice(insertIndex, 0, todo);
    normalizeTodoPeriod(period);
    if (todo.text.trim()) {
      saveState();
    }
    renderTodos();
    if (shouldFocus) {
      focusTodoInput(todo.id);
    }
    return todo;
  }

  function updateTodoTextFromInput(input) {
    const item = input.closest(".todo-item");
    const todo = findTodo(item.dataset.period, item.dataset.id);
    if (todo) {
      todo.text = input.value;
    }
  }

  function focusTodoInput(id) {
    requestAnimationFrame(() => {
      const input = document.querySelector(`.todo-item[data-id="${CSS.escape(id)}"] .todo-text`);
      if (!input) {
        return;
      }
      input.focus();
      input.select();
    });
  }

  function handleTodoContextMenu(event) {
    const item = event.target.closest(".todo-item");
    if (!item) {
      return;
    }
    event.preventDefault();
    closeQuickMenu();
    activeTodoContext = {
      id: item.dataset.id,
      period: item.dataset.period,
    };
    elements.todoMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 130)}px`;
    elements.todoMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 70)}px`;
    elements.todoMenu.classList.add("is-visible");
    elements.todoMenu.setAttribute("aria-hidden", "false");
  }

  function handleTodoMenuClick(event) {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton || !activeTodoContext) {
      return;
    }
    if (actionButton.dataset.action === "delete") {
      deleteTodoWithConfirmation(activeTodoContext.period, activeTodoContext.id);
    }
    closeTodoMenu();
  }

  function deleteTodoWithConfirmation(period, id) {
    const todo = findTodo(period, id);
    if (!todo || !confirmDelete(`确定要删除待办事项“${todo.text}”吗？`)) {
      return;
    }
    removeTodo(period, id);
  }

  function removeTodo(period, id) {
    state.todos[period] = state.todos[period].filter((todoItem) => todoItem.id !== id);
    saveState();
    renderTodos();
  }

  function handleTodoDragStart(event) {
    if (event.target.matches(".todo-text")) {
      event.preventDefault();
      return;
    }
    const item = event.target.closest(".todo-item");
    if (!item) {
      return;
    }
    draggedTodo = {
      id: item.dataset.id,
      period: item.dataset.period,
    };
    item.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify(draggedTodo));
  }

  function handleTodoDragOver(event) {
    if (!draggedTodo) {
      return;
    }
    event.preventDefault();
    event.currentTarget.classList.add("is-drag-over");
    event.dataTransfer.dropEffect = "move";
  }

  function handleTodoDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      event.currentTarget.classList.remove("is-drag-over");
    }
  }

  function handleTodoDrop(event) {
    event.preventDefault();
    const list = event.currentTarget;
    list.classList.remove("is-drag-over");
    const transferTodo = getDraggedTodo(event);
    if (!transferTodo) {
      return;
    }
    const targetItem = event.target.closest(".todo-item");
    const targetId = targetItem?.dataset.id || null;
    moveTodo(transferTodo.period, transferTodo.id, list.dataset.list, targetId);
  }

  function handleTodoDragEnd() {
    document.querySelectorAll(".todo-item.is-dragging").forEach((item) => item.classList.remove("is-dragging"));
    document.querySelectorAll(".todo-list.is-drag-over").forEach((list) => list.classList.remove("is-drag-over"));
    draggedTodo = null;
  }

  function getDraggedTodo(event) {
    if (draggedTodo) {
      return draggedTodo;
    }
    try {
      return JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch (error) {
      return null;
    }
  }

  function moveTodo(sourcePeriod, todoId, destinationPeriod, targetId) {
    if (!state.todos[sourcePeriod] || !state.todos[destinationPeriod]) {
      return;
    }
    const sourceTodos = state.todos[sourcePeriod];
    const sourceIndex = sourceTodos.findIndex((todo) => todo.id === todoId);
    if (sourceIndex < 0) {
      return;
    }
    const [todo] = sourceTodos.splice(sourceIndex, 1);
    const destinationTodos = sourcePeriod === destinationPeriod ? sourceTodos : state.todos[destinationPeriod];
    let insertIndex = targetId ? destinationTodos.findIndex((targetTodo) => targetTodo.id === targetId) : destinationTodos.length;
    if (insertIndex < 0 || targetId === todoId) {
      insertIndex = destinationTodos.length;
    }
    destinationTodos.splice(insertIndex, 0, todo);
    normalizeTodoPeriod(sourcePeriod);
    if (sourcePeriod !== destinationPeriod) {
      normalizeTodoPeriod(destinationPeriod);
    }
    saveState();
    renderTodos();
  }

  function normalizeTodoPeriod(period) {
    state.todos[period] = getOrderedTodos(state.todos[period]);
  }

  function getOrderedTodos(todos) {
    return [...todos.filter((todo) => !todo.done), ...todos.filter((todo) => todo.done)];
  }

  function findTodo(period, id) {
    return state.todos[period].find((todo) => todo.id === id);
  }

  function handleImageListClick(event) {
    const card = event.target.closest(".image-card");
    if (!card) {
      return;
    }
    openImagePreview(card.dataset.id);
  }

  function handleImageListDoubleClick(event) {
    const card = event.target.closest(".image-card");
    if (!card) {
      return;
    }
    const image = findImage(card.dataset.id);
    if (image) {
      copyImageToClipboard(image);
    }
  }

  function handleImageContextMenu(event) {
    event.preventDefault();
    closeQuickMenu();
    closeTodoMenu();
    closeImageMenu();
    closeImageListMenu();
    const card = event.target.closest(".image-card");
    if (card) {
      activeImageContext = card.dataset.id;
      elements.imageMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 130)}px`;
      elements.imageMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 110)}px`;
      elements.imageMenu.classList.add("is-visible");
      elements.imageMenu.setAttribute("aria-hidden", "false");
    } else if (event.target.closest(".image-list")) {
      elements.imageListMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 130)}px`;
      elements.imageListMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 50)}px`;
      elements.imageListMenu.classList.add("is-visible");
      elements.imageListMenu.setAttribute("aria-hidden", "false");
    }
  }

  function handleImageMenuClick(event) {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton || !activeImageContext) {
      return;
    }
    const action = actionButton.dataset.action;
    if (action === "preview") {
      openImagePreview(activeImageContext);
    } else if (action === "copy") {
      const image = findImage(activeImageContext);
      if (image) {
        copyImageToClipboard(image);
      }
    } else if (action === "delete") {
      if (confirmDelete("确定要删除这张图片吗？")) {
        deleteImage(activeImageContext);
      }
    }
    closeImageMenu();
  }

  function closeImageMenu() {
    elements.imageMenu.classList.remove("is-visible");
    elements.imageMenu.setAttribute("aria-hidden", "true");
    activeImageContext = null;
  }

  function closeImageListMenu() {
    if (!elements.imageListMenu) return;
    elements.imageListMenu.classList.remove("is-visible");
    elements.imageListMenu.setAttribute("aria-hidden", "true");
  }

  function handleImageListMenuClick(event) {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton) return;
    closeImageListMenu();
    if (actionButton.dataset.action === "paste") {
      pasteImageFromClipboard();
    }
  }

  async function pasteImageFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        const reader = new FileReader();
        reader.onload = async () => {
          const image = {
            id: createId(),
            src: reader.result,
            createdAt: Date.now(),
          };
          try {
            await storeImagePayload(image);
            state.images.push(image);
            saveState();
            renderImages();
            showToast("图片已添加到图床");
          } catch (error) {
            console.warn("图片保存失败。", error);
            showToast("图片保存失败，请稍后再试");
          }
        };
        reader.readAsDataURL(blob);
      }
    } catch (error) {
      showToast("无法读取剪贴板，请尝试 Ctrl+V 粘贴");
    }
  }

  function handleQuickDragStart(event) {
    const button = event.target.closest(".quick-button");
    if (!button) return;
    draggedQuickId = button.dataset.id;
    button.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
  }

  function handleQuickDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const button = event.target.closest(".quick-button");
    elements.quickButtons.querySelectorAll(".is-drag-over").forEach((el) => el.classList.remove("is-drag-over"));
    if (button && button.dataset.id !== draggedQuickId) {
      button.classList.add("is-drag-over");
    }
  }

  function handleQuickDrop(event) {
    event.preventDefault();
    const button = event.target.closest(".quick-button");
    if (!button || !draggedQuickId) return;
    const targetId = button.dataset.id;
    if (targetId === draggedQuickId) return;

    const fromIndex = state.quickButtons.findIndex((b) => b.id === draggedQuickId);
    const toIndex = state.quickButtons.findIndex((b) => b.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = state.quickButtons.splice(fromIndex, 1);
    state.quickButtons.splice(toIndex, 0, moved);
    saveState();
    renderQuickButtons();
  }

  function handleQuickDragEnd() {
    draggedQuickId = null;
    elements.quickButtons.querySelectorAll(".is-dragging, .is-drag-over").forEach((el) => {
      el.classList.remove("is-dragging", "is-drag-over");
    });
  }

  function handleImageDragStart(event) {
    const card = event.target.closest(".image-card");
    if (!card) return;
    draggedImageId = card.dataset.id;
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
  }

  function handleImageDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const card = event.target.closest(".image-card");
    elements.imageList.querySelectorAll(".is-drag-over").forEach((el) => el.classList.remove("is-drag-over"));
    if (card && card.dataset.id !== draggedImageId) {
      card.classList.add("is-drag-over");
    }
  }

  function handleImageDrop(event) {
    event.preventDefault();
    const card = event.target.closest(".image-card");
    if (!card || !draggedImageId) return;
    const targetId = card.dataset.id;
    if (targetId === draggedImageId) return;

    const fromIndex = state.images.findIndex((img) => img.id === draggedImageId);
    const toIndex = state.images.findIndex((img) => img.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = state.images.splice(fromIndex, 1);
    state.images.splice(toIndex, 0, moved);
    saveState();
    renderImages();
  }

  function handleImageDragEnd() {
    draggedImageId = null;
    elements.imageList.querySelectorAll(".is-dragging, .is-drag-over").forEach((el) => {
      el.classList.remove("is-dragging", "is-drag-over");
    });
  }

  function handlePreviewContextMenu(event) {
    event.preventDefault();
    closeImageMenu();
    closePreviewMenu();
    showPreviewMenu(event.clientX, event.clientY);
  }

  function handlePreviewListContextMenu(event) {
    const thumb = event.target.closest(".preview-thumb");
    if (!thumb) return;
    event.preventDefault();
    closeImageMenu();
    closePreviewMenu();
    activePreviewId = thumb.dataset.id;
    openImagePreview(activePreviewId);
    showPreviewMenu(event.clientX, event.clientY);
  }

  function showPreviewMenu(x, y) {
    elements.previewMenu.style.left = `${Math.min(x, window.innerWidth - 130)}px`;
    elements.previewMenu.style.top = `${Math.min(y, window.innerHeight - 140)}px`;
    elements.previewMenu.classList.add("is-visible");
    elements.previewMenu.setAttribute("aria-hidden", "false");
  }

  function handlePreviewMenuClick(event) {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton || !activePreviewId) return;

    const action = actionButton.dataset.action;
    if (action === "copy") {
      const image = findImage(activePreviewId);
      if (image) copyImageToClipboard(image);
    } else if (action === "delete") {
      if (confirmDelete("确定要删除这张图片吗？")) {
        const nextId = findAdjacentImageId(activePreviewId, 1);
        deleteImage(activePreviewId);
        if (nextId) {
          openImagePreview(nextId);
        } else {
          closeImagePreview();
        }
      }
    } else if (action === "close") {
      closeImagePreview();
    }
    closePreviewMenu();
  }

  function closePreviewMenu() {
    if (!elements.previewMenu) return;
    elements.previewMenu.classList.remove("is-visible");
    elements.previewMenu.setAttribute("aria-hidden", "true");
  }

  function openImagePreview(id) {
    const image = findImage(id);
    if (!image) {
      return;
    }

    activePreviewId = id;
    previewScale = 1;
    previewX = 0;
    previewY = 0;
    elements.previewImage.src = image.src;
    elements.imagePreview.classList.add("is-visible");
    elements.imagePreview.setAttribute("aria-hidden", "false");
    renderPreviewList();
    applyPreviewTransform();
  }

  function closeImagePreview() {
    activePreviewId = null;
    elements.imagePreview.classList.remove("is-visible");
    elements.imagePreview.setAttribute("aria-hidden", "true");
    elements.previewImage.removeAttribute("src");
    elements.previewList.innerHTML = "";
  }

  function renderPreviewList() {
    elements.previewList.innerHTML = "";
    state.images.forEach((image, index) => {
      const thumb = document.createElement("div");
      thumb.className = "preview-thumb" + (image.id === activePreviewId ? " is-active" : "");
      thumb.dataset.id = image.id;
      thumb.dataset.index = index + 1;
      const img = document.createElement("img");
      img.src = image.src;
      img.alt = "";
      img.draggable = false;
      thumb.append(img);
      elements.previewList.append(thumb);
    });
    scrollToActiveThumb();
  }

  function scrollToActiveThumb() {
    const active = elements.previewList.querySelector(".preview-thumb.is-active");
    if (active) {
      active.scrollIntoView({ block: "nearest" });
    }
  }

  function navigatePreview(direction) {
    if (!activePreviewId || state.images.length === 0) {
      return;
    }
    const nextId = findAdjacentImageId(activePreviewId, direction);
    if (nextId && nextId !== activePreviewId) {
      openImagePreview(nextId);
    }
  }

  function findAdjacentImageId(currentId, direction) {
    const index = state.images.findIndex((img) => img.id === currentId);
    if (index === -1) {
      return null;
    }
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= state.images.length) {
      return null;
    }
    return state.images[nextIndex].id;
  }

  function handlePreviewWheel(event) {
    if (!activePreviewId) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.12 : 0.12;
    previewScale = clamp(previewScale + delta, 0.2, 6);
    applyPreviewTransform();
  }

  function handlePreviewStageClick(event) {
    if (event.target === elements.previewStage) {
      closeImagePreview();
    }
  }

  function handlePreviewListClick(event) {
    const thumb = event.target.closest(".preview-thumb");
    if (!thumb) {
      return;
    }
    openImagePreview(thumb.dataset.id);
  }

  function startPreviewDrag(event) {
    if (!activePreviewId || event.button !== 0 || event.target !== elements.previewImage) {
      return;
    }
    isDraggingPreview = true;
    dragStart = {
      x: event.clientX,
      y: event.clientY,
      previewX,
      previewY,
    };
    elements.previewStage.classList.add("is-dragging");
  }

  function movePreviewDrag(event) {
    if (!isDraggingPreview) {
      return;
    }
    previewX = dragStart.previewX + event.clientX - dragStart.x;
    previewY = dragStart.previewY + event.clientY - dragStart.y;
    applyPreviewTransform();
  }

  function endPreviewDrag() {
    isDraggingPreview = false;
    elements.previewStage.classList.remove("is-dragging");
  }

  function applyPreviewTransform() {
    elements.previewImage.style.transform = `translate(calc(-50% + ${previewX}px), calc(-50% + ${previewY}px)) scale(${previewScale})`;
  }

  function deleteImage(id) {
    state.images = state.images.filter((image) => image.id !== id);
    deleteStoredImage(id).catch((error) => console.warn("图片存储删除失败。", error));
    saveState();
    renderImages();
    showToast("图片已删除");
  }

  function confirmDelete(message) {
    return window.confirm(message || "确定要删除吗？");
  }

  function findImage(id) {
    return state.images.find((image) => image.id === id);
  }

  async function copyImageToClipboard(image) {
    try {
      if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
        throw new Error("当前浏览器不支持图片写入剪贴板");
      }
      const response = await fetch(image.src);
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      showToast("图片已复制");
    } catch (error) {
      console.warn(error);
      showToast("当前浏览器不支持直接复制图片");
    }
  }

  async function copyTextToClipboard(text, message) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(message);
    } catch (error) {
      console.warn(error);
      showToast("复制失败，请检查浏览器权限");
    }
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    saveState();
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    const isDark = state.theme === "dark";
    elements.iconSun.style.display = isDark ? "" : "none";
    elements.iconMoon.style.display = isDark ? "none" : "";
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => {
      elements.toast.classList.remove("is-visible");
    }, 2200);
  }

  function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function createId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function closeSettingsMenu() {
    elements.settingsMenu.classList.remove("is-visible");
    elements.settingsMenu.setAttribute("aria-hidden", "true");
  }

  function handleSettingsClick(event) {
    event.stopPropagation();
    const rect = elements.settingsBtn.getBoundingClientRect();
    elements.settingsMenu.style.left = `${rect.right - 130}px`;
    elements.settingsMenu.style.top = `${rect.bottom + 4}px`;
    elements.settingsMenu.classList.toggle("is-visible");
    elements.settingsMenu.setAttribute("aria-hidden", !elements.settingsMenu.classList.contains("is-visible"));
  }

  function handleSettingsMenuClick(event) {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "import") {
      elements.importJsonInput.click();
    } else if (action === "export") {
      exportJsonState();
    } else if (action === "github") {
      window.open("https://github.com/xiangjianan/todolist", "_blank");
    }
    closeSettingsMenu();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
})();
