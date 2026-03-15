import { WritableSignal } from "@angular/core";
import { Todo } from "@models/todo.model";

export class TodoUpdater {
  constructor(
    private privateSignal: WritableSignal<Todo[]>,
    private sharedSignal: WritableSignal<Todo[]>
  ) {}

  update(todoId: string | null, updater: (todo: Todo) => Todo): void {
    if (!todoId) {
      this.updateAll(updater);
      return;
    }

    this.updateSignal(this.privateSignal, todoId, updater);
    this.updateSignal(this.sharedSignal, todoId, updater);
  }

  private updateSignal(
    signal: WritableSignal<Todo[]>,
    todoId: string,
    updater: (todo: Todo) => Todo
  ): void {
    signal.update((todos) => {
      const hasTodo = todos.some((todo) => todo.id === todoId);
      if (!hasTodo) return todos;
      return todos.map((todo) => (todo.id === todoId ? updater(todo) : todo));
    });
  }

  private updateAll(updater: (todo: Todo) => Todo): void {
    this.privateSignal.update((todos) => todos.map(updater));
    this.sharedSignal.update((todos) => todos.map(updater));
  }
}
