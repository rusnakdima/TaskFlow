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
  addEntityToArray,
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
    private sharedSignal: WritableSignal<Todo[]>,
    private publicSignal: WritableSignal<Todo[]>
  ) {
    super();
  }

  add(data: Todo): void {
    const signal =
      data.visibility === "private"
        ? this.privateSignal
        : data.visibility === "public"
          ? this.publicSignal
          : this.sharedSignal;

    signal.update((todos) => addEntityToArray(todos, data));
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
    const existsInPublic = existsById(this.publicSignal(), id);

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
    if (existsInPublic) {
      updateEntityInSignal(this.publicSignal, id, resolvedUpdates);
    }

    if (updates.deleted_at) {
      this.cascadeDeleteToNested(id, updates.deleted_at);
    }

    // Handle visibility change if needed
    if (updates.visibility) {
      this.handleVisibilityChange(id, updates.visibility);
    }
  }

  private cascadeDeleteToNested(todoId: string, deletedAt: string): void {
    const cascade = (signal: WritableSignal<Todo[]>) => {
      signal.update((todos) =>
        todos.map((todo) => {
          if (todo.id !== todoId) return todo;
          return {
            ...todo,
            tasks: todo.tasks?.map((task) => ({
              ...task,
              deleted_at: task.deleted_at || deletedAt,
              subtasks: task.subtasks?.map((subtask) => ({
                ...subtask,
                deleted_at: subtask.deleted_at || deletedAt,
              })),
            })),
          };
        })
      );
    };
    cascade(this.privateSignal);
    cascade(this.sharedSignal);
    cascade(this.publicSignal);
  }

  remove(id: string): void {
    const privateTodos = this.privateSignal();
    const sharedTodos = this.sharedSignal();
    const publicTodos = this.publicSignal();

    if (existsById(privateTodos, id)) {
      this.privateSignal.set(removeEntityFromArray(privateTodos, id));
    }
    if (existsById(sharedTodos, id)) {
      this.sharedSignal.set(removeEntityFromArray(sharedTodos, id));
    }
    if (existsById(publicTodos, id)) {
      this.publicSignal.set(removeEntityFromArray(publicTodos, id));
    }
  }

  /**
   * Soft-delete todo with all related data (tasks, subtasks, comments)
   * Sets deleted_at on todo and all nested entities
   */
  removeWithCascade(id: string, allTodos: Todo[]): void {
    const todo = allTodos.find((t) => t.id === id);
    if (!todo) return;

    const now = new Date().toISOString();

    const softDeleteInSignal = (signal: WritableSignal<Todo[]>) => {
      signal.update((todos) =>
        todos.map((t) => {
          if (t.id !== id) return t;
          return {
            ...t,
            deleted_at: now,
            tasks: t.tasks?.map((task) => ({
              ...task,
              deleted_at: now,
              subtasks: task.subtasks?.map((subtask) => ({
                ...subtask,
                deleted_at: now,
              })),
            })),
          };
        })
      );
    };

    softDeleteInSignal(this.privateSignal);
    softDeleteInSignal(this.sharedSignal);
  }

  /**
   * Restore todo with all related data
   */
  restoreWithCascade(data: TodoCascadeData): void {
    const restoreInSignal = (signal: WritableSignal<Todo[]>) => {
      signal.update((todos) => {
        const existingIndex = todos.findIndex((t) => t.id === data.todo.id);
        if (existingIndex >= 0) {
          const updatedTodos = [...todos];
          updatedTodos[existingIndex] = {
            ...data.todo,
            tasks: data.tasks.map((task) => ({
              ...task,
              deleted_at: null,
              subtasks: data.subtasks
                .filter((s) => s.task_id === task.id)
                .map((subtask) => ({ ...subtask, deleted_at: null })),
            })),
          };
          return updatedTodos;
        } else {
          return [
            ...todos,
            {
              ...data.todo,
              tasks: data.tasks.map((task) => ({
                ...task,
                deleted_at: null,
                subtasks: data.subtasks
                  .filter((s) => s.task_id === task.id)
                  .map((subtask) => ({ ...subtask, deleted_at: null })),
              })),
            },
          ];
        }
      });
    };

    restoreInSignal(this.privateSignal);
    restoreInSignal(this.sharedSignal);
    restoreInSignal(this.publicSignal);
  }

  getById(id: string): Todo | undefined {
    return (
      this.privateSignal().find((t) => t.id === id) ||
      this.sharedSignal().find((t) => t.id === id) ||
      this.publicSignal().find((t) => t.id === id)
    );
  }

  private handleVisibilityChange(todoId: string, newVisibility: string): void {
    const isPrivate = newVisibility === "private";
    const isPublic = newVisibility === "public";
    const isTeam = newVisibility === "shared";

    const signals: { from: WritableSignal<Todo[]>; to: WritableSignal<Todo[]> } | null = isPrivate
      ? { from: this.sharedSignal, to: this.privateSignal }
      : isPublic
        ? { from: this.privateSignal, to: this.publicSignal }
        : isTeam
          ? { from: this.publicSignal, to: this.sharedSignal }
          : null;

    if (!signals) return;

    const todo =
      this.privateSignal().find((t) => t.id === todoId) ||
      this.sharedSignal().find((t) => t.id === todoId) ||
      this.publicSignal().find((t) => t.id === todoId);

    if (!todo) return;

    signals.from.update((todos) => removeEntityFromArray(todos, todoId));
    signals.to.update((todos) => {
      if (existsById(todos, todoId)) return todos;
      return [{ ...todo, visibility: newVisibility }, ...todos];
    });
  }
}
