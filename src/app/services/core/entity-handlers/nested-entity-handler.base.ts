import { WritableSignal } from "@angular/core";
import { Todo } from "@models/todo.model";

export abstract class NestedEntityHandlerBase {
  protected abstract get privateSignal(): WritableSignal<Todo[]>;
  protected abstract get sharedSignal(): WritableSignal<Todo[]>;
  protected abstract get entityType(): "tasks" | "subtasks";

  protected updateTodo(updater: (todo: Todo) => Todo, todo_id?: string | null): void {
    if (!todo_id) {
      this.updateSignal(this.privateSignal, updater);
      this.updateSignal(this.sharedSignal, updater);
      return;
    }
    const privateHasTodo = this.privateSignal().some((t) => t.id === todo_id);
    const sharedHasTodo = this.sharedSignal().some((t) => t.id === todo_id);

    if (privateHasTodo) {
      this.updateSignal(this.privateSignal, updater, todo_id);
    }
    if (sharedHasTodo) {
      this.updateSignal(this.sharedSignal, updater, todo_id);
    }
  }

  protected updateSignal(
    signal: WritableSignal<Todo[]>,
    updater: (todo: Todo) => Todo,
    todo_id?: string
  ): void {
    signal.update((todos) => {
      if (!todo_id) return todos;
      const hasTodo = todos.some((todo) => todo.id === todo_id);
      if (!hasTodo) return todos;
      return todos.map((todo) => (todo.id === todo_id ? updater(todo) : todo));
    });
  }

  protected scanForEntityInSignal(
    todos: Todo[],
    id: string
  ): { found: boolean; todoId: string | null; taskId: string | null } {
    for (const todo of todos) {
      if (
        this.entityType === "tasks" &&
        (Array.isArray(todo.tasks) ? todo.tasks : []).some((t) => t.id === id)
      ) {
        return { found: true, todoId: todo.id, taskId: null };
      }
      if (this.entityType === "subtasks") {
        for (const task of Array.isArray(todo.tasks) ? todo.tasks : []) {
          if ((Array.isArray(task.subtasks) ? task.subtasks : []).some((s) => s.id === id)) {
            return { found: true, todoId: todo.id, taskId: task.id };
          }
        }
      }
    }
    return { found: false, todoId: null, taskId: null };
  }

  protected resolveTodoId(entityId: string, entityType: "tasks" | "subtasks"): string | null {
    const todos = [...this.privateSignal(), ...this.sharedSignal()];

    for (const todo of todos) {
      if (
        entityType === "tasks" &&
        (Array.isArray(todo.tasks) ? todo.tasks : []).some((t) => t.id === entityId)
      ) {
        return todo.id;
      }

      if (entityType === "subtasks") {
        for (const task of Array.isArray(todo.tasks) ? todo.tasks : []) {
          if ((Array.isArray(task.subtasks) ? task.subtasks : []).some((s) => s.id === entityId)) {
            return todo.id;
          }
        }
      }
    }
    return null;
  }

  protected findEntityInTodo(todo: Todo, id: string): any | undefined {
    if (this.entityType === "tasks") {
      return (Array.isArray(todo.tasks) ? todo.tasks : []).find((t) => t.id === id);
    } else {
      for (const task of Array.isArray(todo.tasks) ? todo.tasks : []) {
        const found = (Array.isArray(task.subtasks) ? task.subtasks : []).find((s) => s.id === id);
        if (found) return found;
      }
    }
    return undefined;
  }
}
