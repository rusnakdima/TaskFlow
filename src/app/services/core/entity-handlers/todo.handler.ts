import { WritableSignal } from "@angular/core";
import { EntityHandler } from "./entity-handler.base";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import {
  existsById,
  updateEntityInSignal,
  removeEntityFromArray,
  addIfNotExists,
} from "@stores/utils/store-helpers";

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

    signal.update((todos) => addIfNotExists(todos, data));
  }

  update(
    id: string,
    updates: Partial<Todo>,
    resolvers?: {
      getCategoryById?: (id: string) => import("@models/category.model").Category | undefined;
    }
  ): void {
    const existsInPrivate = existsById(this.privateSignal(), id);
    const existsInShared = existsById(this.sharedSignal(), id);

    // Resolve string category IDs to full objects before merging
    const resolvedUpdates: Partial<Todo> = { ...updates };

    if (updates.categories && Array.isArray(updates.categories)) {
      const first = updates.categories[0];
      if (first !== undefined && typeof first === "string") {
        const resolve = resolvers?.getCategoryById;
        if (resolve) {
          resolvedUpdates.categories = (updates.categories as unknown as string[])
            .map((cid) => resolve(cid))
            .filter((c): c is import("@models/category.model").Category => !!c);
        }
      }
    }

    // Update only the signal where the todo exists
    if (existsInPrivate) {
      updateEntityInSignal(this.privateSignal, id, resolvedUpdates);
    }
    if (existsInShared) {
      updateEntityInSignal(this.sharedSignal, id, resolvedUpdates);
    }

    // Handle visibility change if needed
    if (updates.visibility) {
      this.handleVisibilityChange(id, updates.visibility);
    }
  }

  remove(id: string): void {
    const privateTodos = this.privateSignal();
    const sharedTodos = this.sharedSignal();

    if (existsById(privateTodos, id)) {
      this.privateSignal.set(removeEntityFromArray(privateTodos, id));
    }
    if (existsById(sharedTodos, id)) {
      this.sharedSignal.set(removeEntityFromArray(sharedTodos, id));
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

  private handleVisibilityChange(newVisibility: string, todo_id?: string): void {
    const isPrivate = newVisibility === "private";
    const isTeam = newVisibility === "team";
    if (!isPrivate && !isTeam) return;

    const [from, to] = isPrivate
      ? [this.sharedSignal, this.privateSignal]
      : [this.privateSignal, this.sharedSignal];

    const todo =
      this.privateSignal().find((t) => t.id === todo_id) ||
      this.sharedSignal().find((t) => t.id === todo_id);

    if (!todo) return;

    from.update((todos) => removeEntityFromArray(todos, todo_id!));
    to.update((todos) => {
      if (existsById(todos, todo_id!)) return todos;
      return [{ ...todo, visibility: newVisibility }, ...todos];
    });
  }
}
