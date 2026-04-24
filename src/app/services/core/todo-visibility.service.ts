/* sys lib */
import { Injectable, signal, computed, WritableSignal } from "@angular/core";
/* models */
import { Todo } from "@models/todo.model";

@Injectable({ providedIn: "root" })
export class TodoVisibilityService {
  private readonly _privateTodosSignal = signal<Todo[]>([]);
  private readonly _sharedTodosSignal = signal<Todo[]>([]);

  readonly privateTodos = computed(() => {
    return this._privateTodosSignal().filter(
      (todo) => !todo.deleted_at && todo.visibility === "private"
    );
  });

  readonly sharedTodos = computed(() => {
    return this._sharedTodosSignal().filter(
      (todo) => !todo.deleted_at && todo.visibility === "team"
    );
  });

  moveTodoToShared(todo_id?: string): void {
    if (!todo_id) return;
    const todo = this.getTodoById(todo_id);
    if (!todo) return;

    this._privateTodosSignal.update((todos) => todos.filter((t) => t.id !== todo_id));
    if (!this._sharedTodosSignal().some((t) => t.id !== todo_id)) {
      this._sharedTodosSignal.update((todos) => [
        { ...todo, visibility: "team" as const },
        ...todos.filter((t) => t.id !== todo_id),
      ]);
    }
  }

  moveTodoToPrivate(todo_id?: string): void {
    if (!todo_id) return;
    const todo = this.getTodoById(todo_id);
    if (!todo) return;

    this._sharedTodosSignal.update((todos) => todos.filter((t) => t.id !== todo_id));
    if (!this._privateTodosSignal().some((t) => t.id === todo_id)) {
      this._privateTodosSignal.update((todos) => [
        { ...todo, visibility: "private" as const },
        ...todos.filter((t) => t.id !== todo_id),
      ]);
    }
  }

  setPrivateTodos(todos: Todo[]): void {
    this._privateTodosSignal.set(todos);
  }

  setSharedTodos(todos: Todo[]): void {
    this._sharedTodosSignal.set(todos);
  }

  getPrivateTodos(): Todo[] {
    return this._privateTodosSignal();
  }

  getSharedTodos(): Todo[] {
    return this._sharedTodosSignal();
  }

  getPrivateTodosSignal(): WritableSignal<Todo[]> {
    return this._privateTodosSignal;
  }

  getSharedTodosSignal(): WritableSignal<Todo[]> {
    return this._sharedTodosSignal;
  }

  getTodoById(todoId: string): Todo | undefined {
    return (
      this._privateTodosSignal().find((t) => t.id === todoId) ||
      this._sharedTodosSignal().find((t) => t.id === todoId)
    );
  }
}
