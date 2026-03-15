import { WritableSignal } from "@angular/core";
import { EntityHandler } from "./entity-handler.base";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";

export interface TodoCascadeData {
  todo: Todo;
  tasks: Task[];
  subtasks: Subtask[];
  comments: Comment[];
}

export class TodoHandler extends EntityHandler<Todo> {
  constructor(
    private privateSignal: WritableSignal<Todo[]>,
    private sharedSignal: WritableSignal<Todo[]>
  ) {
    super();
  }

  add(data: Todo): void {
    const signal = data.visibility === "private" ? this.privateSignal : this.sharedSignal;

    signal.update((todos) => {
      if (todos.some((t) => t.id === data.id)) return todos;
      return [data, ...todos];
    });
  }

  update(id: string, updates: Partial<Todo>): void {
    const updateSignal = (signal: WritableSignal<Todo[]>) => {
      signal.update((todos) => {
        const hasTodo = todos.some((t) => t.id === id);
        if (!hasTodo) return todos;
        return todos.map((todo) => (todo.id === id ? { ...todo, ...updates } : todo));
      });
    };

    updateSignal(this.privateSignal);
    updateSignal(this.sharedSignal);

    if (updates.visibility) {
      this.handleVisibilityChange(id, updates.visibility);
    }
  }

  remove(id: string): void {
    const privateTodos = this.privateSignal();
    const sharedTodos = this.sharedSignal();

    // Check if todo exists in either signal
    const existsInPrivate = privateTodos.some((t) => t.id === id);
    const existsInShared = sharedTodos.some((t) => t.id === id);

    if (existsInPrivate) {
      this.privateSignal.set(privateTodos.filter((t) => t.id !== id));
    }
    if (existsInShared) {
      this.sharedSignal.set(sharedTodos.filter((t) => t.id !== id));
    }
  }

  /**
   * Remove todo with all related data (tasks, subtasks, comments)
   */
  removeWithCascade(id: string, allTodos: Todo[]): void {
    const todo = allTodos.find((t) => t.id === id);
    if (!todo) return;

    // Collect all related entity IDs
    const taskIds = todo.tasks?.map((t) => t.id) || [];
    const subtaskIds = todo.tasks?.flatMap((t) => t.subtasks?.map((s) => s.id) || []) || [];

    // Remove todo (this will also remove all nested tasks, subtasks, and comments since they're inside the todo)
    this.remove(id);
  }

  /**
   * Restore todo with all related data
   */
  restoreWithCascade(data: TodoCascadeData): void {
    // Restore todo
    this.add(data.todo);
  }

  getById(id: string): Todo | undefined {
    return (
      this.privateSignal().find((t) => t.id === id) || this.sharedSignal().find((t) => t.id === id)
    );
  }

  private handleVisibilityChange(todoId: string, newVisibility: "private" | "team"): void {
    const [from, to] =
      newVisibility === "private"
        ? [this.sharedSignal, this.privateSignal]
        : [this.privateSignal, this.sharedSignal];

    const todo = this.getById(todoId);
    if (!todo) return;

    from.update((todos) => todos.filter((t) => t.id !== todoId));
    to.update((todos) => [
      { ...todo, visibility: newVisibility },
      ...todos.filter((t) => t.id !== todoId),
    ]);
  }
}
