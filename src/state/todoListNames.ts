import type { AppLanguage, TodoListConfig, WorkspaceData } from "../types";
import { getDisplayTodoListTitle } from "./i18n";
import { createId } from "./storage/shared";

export function findTodoListByTitle(lists: TodoListConfig[], title: string, language: AppLanguage, exceptId?: string): TodoListConfig | undefined {
  return lists.find(list => list.id !== exceptId && getDisplayTodoListTitle(list, language).trim() === title.trim());
}

/** Keep the first list's configuration and every reminder, including colliding IDs. */
export function mergeDuplicateTodoLists(workspace: WorkspaceData, language: AppLanguage): WorkspaceData {
  const aliases = new Map<string, string>();
  const lists: TodoListConfig[] = [];
  const todos = { ...workspace.todos };
  const visibility = { ...workspace.showCompletedTodos };
  for (const list of workspace.todoLists) {
    const existing = findTodoListByTitle(lists, getDisplayTodoListTitle(list, language), language);
    if (!existing) { lists.push(list); continue; }
    aliases.set(list.id, existing.id);
    const merged = [...(todos[existing.id] ?? [])];
    const ids = new Set(merged.map(todo => todo.id));
    for (const todo of todos[list.id] ?? []) {
      let id = todo.id;
      while (ids.has(id)) id = createId();
      ids.add(id);
      merged.push({ ...todo, id });
    }
    todos[existing.id] = merged;
    visibility[existing.id] = Boolean(visibility[existing.id] || visibility[list.id]);
    delete todos[list.id];
    delete visibility[list.id];
  }
  if (!aliases.size) return workspace;
  const remap = (id: string) => aliases.get(id) ?? id;
  return {
    ...workspace,
    todoLists: lists,
    todos,
    showCompletedTodos: visibility,
    todoListOrder: workspace.todoListOrder && [...new Set(workspace.todoListOrder.map(remap))],
    todoColumnLayouts: workspace.todoColumnLayouts && Object.fromEntries(
      Object.entries(workspace.todoColumnLayouts).map(([count, layout]) => [count, layout.filter(item => !aliases.has(item.id))]),
    ),
    inbox: workspace.inbox && { ...workspace.inbox, todoListId: remap(workspace.inbox.todoListId) },
  };
}
