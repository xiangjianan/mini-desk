(function () {
  "use strict";

  const STORAGE_KEY = "todo-board-state-v1";
  const TEXTAREA_KEYS = {
    noteText: "note",
    workspaceText: "workspace",
    storageText: "storage",
  };

  const saveMessages = [
    "已经帮你存好了",
    "内容稳稳落袋",
    "这次修改已保存",
    "放心，已经记下",
    "保存完成，可以继续",
    "这一版已收好",
    "刚刚的内容已入库",
    "文字已经安全保存",
    "看板状态已更新",
    "记录好了，继续写吧",
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
    note: "",
    workspace: "",
    storage: "",
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
  let previewScale = 1;
  let previewX = 0;
  let previewY = 0;
  let isDraggingPreview = false;
  let dragStart = { x: 0, y: 0, previewX: 0, previewY: 0 };

  const elements = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    applyTheme();
    hydrateTextareas();
    bindEvents();
    renderAll();
  }

  function cacheElements() {
    elements.imageCount = document.getElementById("imageCount");
    elements.imageList = document.getElementById("imageList");
    elements.noteText = document.getElementById("noteText");
    elements.workspaceText = document.getElementById("workspaceText");
    elements.storageText = document.getElementById("storageText");
    elements.addQuickBtn = document.getElementById("addQuickBtn");
    elements.quickButtons = document.getElementById("quickButtons");
    elements.toggleHiddenBtn = document.getElementById("toggleHiddenBtn");
    elements.themeToggle = document.getElementById("themeToggle");
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
  }

  function bindEvents() {
    document.addEventListener("paste", handlePaste);
    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("click", handleDocumentClick);

    Object.keys(TEXTAREA_KEYS).forEach((id) => {
      const textarea = elements[id];
      textarea.addEventListener("focus", () => handleTextareaFocus(textarea));
      textarea.addEventListener("input", () => handleTextareaInput(textarea));
      textarea.addEventListener("blur", () => handleTextareaBlur(textarea));
    });

    window.addEventListener("resize", positionFocusCompanion);
    window.addEventListener("scroll", positionFocusCompanion, true);

    elements.addQuickBtn.addEventListener("click", openAddQuickDialog);
    elements.toggleHiddenBtn.addEventListener("click", toggleHiddenButtons);
    elements.quickButtons.addEventListener("click", handleQuickButtonClick);
    elements.quickButtons.addEventListener("contextmenu", handleQuickContextMenu);
    elements.quickMenu.addEventListener("click", handleQuickMenuClick);
    elements.todoMenu.addEventListener("click", handleTodoMenuClick);
    elements.closeQuickDialog.addEventListener("click", closeQuickDialog);
    elements.quickEditForm.addEventListener("submit", handleQuickEditSubmit);
    elements.editQuickIsLink.addEventListener("change", updateEditValueLabel);
    elements.deleteQuickInDialog.addEventListener("click", deleteActiveQuickFromDialog);
    elements.themeToggle.addEventListener("click", toggleTheme);
    document.querySelectorAll(".clear-completed-button").forEach((button) => {
      button.addEventListener("click", handleClearCompleted);
    });

    document.querySelectorAll(".todo-list").forEach((list) => {
      list.addEventListener("click", handleTodoListClick);
      list.addEventListener("change", handleTodoChange);
      list.addEventListener("input", handleTodoInput);
      list.addEventListener("keydown", handleTodoKeydown);
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
    elements.imageMenu.addEventListener("click", handleImageMenuClick);
    elements.closePreview.addEventListener("click", closeImagePreview);
    elements.imagePreview.addEventListener("wheel", handlePreviewWheel, { passive: false });
    elements.previewStage.addEventListener("click", handlePreviewStageClick);
    elements.previewStage.addEventListener("mousedown", startPreviewDrag);
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
      return {
        ...structuredClone(defaultState),
        ...parsed,
        todos: {
          ...structuredClone(defaultState.todos),
          ...(parsed.todos || {}),
        },
      };
    } catch (error) {
      console.warn("无法读取本地数据，使用默认状态。", error);
      return structuredClone(defaultState);
    }
  }

  function saveState(options = {}) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getSerializableState()));
    if (options.showBubble) {
      showSaveBubble(options);
    }
  }

  function getSerializableState() {
    const todos = Object.fromEntries(
      Object.entries(state.todos).map(([period, todosForPeriod]) => [
        period,
        todosForPeriod.filter((todo) => todo.text.trim()),
      ])
    );
    return {
      ...state,
      todos,
    };
  }

  function hydrateTextareas() {
    elements.noteText.value = state.note;
    elements.workspaceText.value = state.workspace;
    elements.storageText.value = state.storage;
  }

  function renderAll() {
    renderImages();
    renderQuickButtons();
    renderTodos();
  }

  function renderImages() {
    elements.imageCount.textContent = String(state.images.length);
    elements.imageList.innerHTML = "";

    if (state.images.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "暂无图片";
      elements.imageList.append(empty);
      return;
    }

    state.images.forEach((image, index) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "image-card";
      card.dataset.id = image.id;
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
      empty.textContent = "暂无快捷按钮";
      elements.quickButtons.append(empty);
      return;
    }

    visibleButtons.forEach((button) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `quick-button${button.hidden ? " is-hidden" : ""}`;
      item.dataset.id = button.id;
      item.title = button.hidden ? "已隐藏，右键可取消隐藏" : "点击复制，右键编辑";
      item.textContent = button.title;
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
        text.placeholder = "提醒事项";
        text.autocomplete = "off";
        text.spellcheck = false;
        text.setAttribute("aria-label", "编辑提醒事项");

        item.append(checkbox, text);
        list.append(item);
      });
    });
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
      reader.onload = () => {
        state.images.unshift({
          id: createId(),
          src: reader.result,
          createdAt: Date.now(),
        });
        saveState();
        renderImages();
        showToast("图片已添加到图床");
      };
      reader.readAsDataURL(file);
    });
  }

  function handleKeydown(event) {
    const key = event.key;
    if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === "s") {
      event.preventDefault();
      flushTextareaState();
      saveState({ showBubble: true, defaultPosition: true });
      return;
    }

    if (!activePreviewId) {
      return;
    }

    if (key === "Delete" || key === "Backspace") {
      event.preventDefault();
      if (confirmDelete("确定要删除这张图片吗？")) {
        deleteImage(activePreviewId);
        closeImagePreview();
      }
    } else if (key === "Enter") {
      event.preventDefault();
      const image = findImage(activePreviewId);
      if (image) {
        copyImageToClipboard(image);
      }
    } else if (key === " ") {
      event.preventDefault();
      closeImagePreview();
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
  }

  function handleTextareaFocus(textarea) {
    if (blurSaveTimer) {
      clearTimeout(blurSaveTimer);
      blurSaveTimer = null;
    }

    focusedTextarea = textarea;
    lastTextarea = textarea;
    hasTypedInFocusedTextarea = false;
    showFocusCompanion(textarea);
  }

  function handleTextareaInput(textarea) {
    updateTextareaState(textarea);
    hasTypedInFocusedTextarea = true;

    if (inputSaveTimer) {
      clearTimeout(inputSaveTimer);
    }

    inputSaveTimer = setTimeout(() => {
      flushTextareaState();
      saveState({ showBubble: true });
      inputSaveTimer = null;
    }, 3000);
  }

  function handleTextareaBlur(textarea) {
    focusedTextarea = null;
    hideFocusCompanion();

    if (!hasTypedInFocusedTextarea) {
      return;
    }

    if (textarea.id === "workspaceText" && inputSaveTimer) {
      clearTimeout(inputSaveTimer);
      inputSaveTimer = null;
      updateTextareaState(textarea);
      saveState({ showBubble: true });
      return;
    }

    if (blurSaveTimer) {
      clearTimeout(blurSaveTimer);
    }

    blurSaveTimer = setTimeout(() => {
      updateTextareaState(textarea);
      saveState({ showBubble: true });
      blurSaveTimer = null;
    }, 1000);
  }

  function updateTextareaState(textarea) {
    const stateKey = TEXTAREA_KEYS[textarea.id];
    if (stateKey) {
      state[stateKey] = textarea.value;
    }
  }

  function flushTextareaState() {
    Object.keys(TEXTAREA_KEYS).forEach((id) => updateTextareaState(elements[id]));
  }

  function showFocusCompanion(textarea) {
    elements.focusCompanion.classList.add("is-visible");
    elements.focusCompanion.setAttribute("aria-hidden", "false");
    elements.focusVideo.play().catch(() => {});
    positionFocusCompanion(textarea);
  }

  function hideFocusCompanion() {
    positionFocusCompanion(null);
    elements.focusCompanion.classList.remove("is-visible");
    elements.focusCompanion.setAttribute("aria-hidden", "true");
  }

  function positionFocusCompanion(textarea = focusedTextarea || lastTextarea) {
    if (textarea !== null && !(textarea instanceof HTMLTextAreaElement)) {
      textarea = focusedTextarea || lastTextarea;
    }
    if (!textarea) return;
    const size = 72;
    const gap = 6;
    const rect = textarea.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - size - 8, rect.right - size - gap));
    const top = Math.max(8, Math.min(window.innerHeight - size - 8, rect.bottom - size - gap));
    elements.focusCompanion.style.left = `${left}px`;
    elements.focusCompanion.style.top = `${top}px`;
  }

  function showSaveBubble(options = {}) {
    positionFocusCompanion(options.defaultPosition ? null : focusedTextarea);
    const text = randomItem(saveMessages);
    const face = randomItem(kaomoji);
    elements.saveBubble.textContent = `${text} ${face}`;
    elements.focusCompanion.classList.add("is-visible");
    elements.focusCompanion.setAttribute("aria-hidden", "false");
    elements.saveBubble.classList.add("is-visible");
    elements.focusVideo.play().catch(() => {});

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
    copyTextToClipboard(item.value, item.type === "link" ? "URL 已复制" : "文本已复制");
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
  }

  function handleTodoInput(event) {
    if (!event.target.matches(".todo-text")) {
      return;
    }
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
    const item = event.target.closest(".todo-item");
    const todo = findTodo(item.dataset.period, item.dataset.id);
    if (!todo) {
      return;
    }
    todo.text = event.target.value;
    if (todo.text.trim()) {
      saveState();
      return;
    }
    removeTodo(item.dataset.period, item.dataset.id);
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
    const card = event.target.closest(".image-card");
    if (!card) {
      return;
    }
    event.preventDefault();
    closeQuickMenu();
    closeTodoMenu();
    activeImageContext = card.dataset.id;
    elements.imageMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 130)}px`;
    elements.imageMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 110)}px`;
    elements.imageMenu.classList.add("is-visible");
    elements.imageMenu.setAttribute("aria-hidden", "false");
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
    applyPreviewTransform();
  }

  function closeImagePreview() {
    activePreviewId = null;
    elements.imagePreview.classList.remove("is-visible");
    elements.imagePreview.setAttribute("aria-hidden", "true");
    elements.previewImage.removeAttribute("src");
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
    elements.themeToggle.textContent = state.theme === "dark" ? "白天" : "黑夜";
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

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
})();
