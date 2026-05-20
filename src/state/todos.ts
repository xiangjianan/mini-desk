import type { TodoItem, TodoMap, TodoPeriod } from "../types";

export function getOrderedTodos(todos: TodoItem[], deferredDoneIds: ReadonlySet<string> = new Set()): TodoItem[] {
  return [
    ...todos.filter((todo) => !todo.done || deferredDoneIds.has(todo.id)),
    ...todos.filter((todo) => todo.done && !deferredDoneIds.has(todo.id)),
  ];
}

export function addTodo(
  todos: TodoMap,
  period: TodoPeriod,
  todo: TodoItem,
  afterId?: string,
): TodoMap {
  const next = cloneTodoMap(todos);
  const list = next[period];
  if (!afterId) {
    list.push(todo);
    return next;
  }
  const index = list.findIndex((item) => item.id === afterId);
  list.splice(index >= 0 ? index + 1 : list.length, 0, todo);
  return next;
}

export function updateTodoText(
  todos: TodoMap,
  period: TodoPeriod,
  id: string,
  text: string,
): TodoMap {
  const next = cloneTodoMap(todos);
  const todo = next[period].find((item) => item.id === id);
  if (todo) todo.text = text;
  return next;
}

export function completeTodo(
  todos: TodoMap,
  period: TodoPeriod,
  id: string,
  done: boolean,
): TodoMap {
  const next = cloneTodoMap(todos);
  const todo = next[period].find((item) => item.id === id);
  if (todo) todo.done = done;
  return next;
}

export function removeTodo(todos: TodoMap, period: TodoPeriod, id: string): TodoMap {
  const next = cloneTodoMap(todos);
  next[period] = next[period].filter((todo) => todo.id !== id);
  return next;
}

export function clearCompleted(todos: TodoMap, period: TodoPeriod): TodoMap {
  const next = cloneTodoMap(todos);
  next[period] = next[period].filter((todo) => !todo.done);
  return next;
}

export function removeEmptyTodo(todos: TodoMap, period: TodoPeriod, id: string): TodoMap {
  const todo = todos[period].find((item) => item.id === id);
  if (!todo || todo.text.trim()) return todos;
  return removeTodo(todos, period, id);
}

export function moveTodo(
  todos: TodoMap,
  sourcePeriod: TodoPeriod,
  id: string,
  destinationPeriod: TodoPeriod,
  targetId?: string,
): TodoMap {
  const next = cloneTodoMap(todos);
  const source = next[sourcePeriod];
  const sourceIndex = source.findIndex((todo) => todo.id === id);
  if (sourceIndex < 0) return next;

  const [todo] = source.splice(sourceIndex, 1);
  const destination = next[destinationPeriod];
  const targetIndex = targetId ? destination.findIndex((item) => item.id === targetId) : -1;
  destination.splice(targetIndex >= 0 ? targetIndex : destination.length, 0, todo);
  return next;
}

export function cloneTodoMap(todos: TodoMap): TodoMap {
  return {
    morning: todos.morning.map((todo) => ({ ...todo })),
    noon: todos.noon.map((todo) => ({ ...todo })),
    evening: todos.evening.map((todo) => ({ ...todo })),
  };
}
