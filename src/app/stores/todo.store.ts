/**
 * Todo Store - Manages todo state using Angular signals
 *
 * Provides reactive state management for todos with support for:
 * - Private and shared todos
 * - Automatic deduplication and filtering
 * - Cascade operations (delete, restore)
 * - Visibility changes (private ↔ team)
 */

import { Injectable, signal, computed, Signal, WritableSignal } from "@angular/core";
import { Todo } from "@models/todo.model";
import {
  deduplicateAndFilterDeleted,
  addEntityToArray,
  removeEntityFromArray,
  updateEntityInArray,
  findById,
} from "./utils/store-helpers";

/**
 * Todo store state interface
 */
interface TodoState {
  privateTodos: Todo[];
  sharedTodos: Todo[];
  loading: boolean;
  loaded: boolean;
  lastLoaded: Date | null;
  selectedTodoId: string | null;
}

/**
 * Initial state for todo store
 */
const initialState: TodoState = {
  privateTodos: [],
  sharedTodos: [],
  loading: false,
  loaded: false,
  lastLoaded: null,
  selectedTodoId: null,
};

@Injectable({
  providedIn: "root",
})
export class TodoStore {
  // ==================== STATE SIGNALS ====================
  private readonly state: WritableSignal<TodoState> = signal(initialState);

  // ==================== COMPUTED SIGNALS ====================

  /**
   * All todos (private + shared), deduplicated and filtered
   */
  readonly todos: Signal<Todo[]> = computed(() => {
    const state = this.state();
    const allTodos = [...state.privateTodos, ...state.sharedTodos];
    return deduplicateAndFilterDeleted(allTodos);
  });

  /**
   * Private todos only (filtered)
   */
  readonly privateTodos: Signal<Todo[]> = computed(() => {
    return this.state().privateTodos.filter((todo) => !todo.deleted_at);
  });

  /**
   * Shared todos only (filtered)
   */
  readonly sharedTodos: Signal<Todo[]> = computed(() => {
    return this.state().sharedTodos.filter((todo) => !todo.deleted_at);
  });

  /**
   * Loading state
   */
  readonly loading: Signal<boolean> = computed(() => this.state().loading);

  /**
   * Loaded state (data has been fetched at least once)
   */
  readonly loaded: Signal<boolean> = computed(() => this.state().loaded);

  /**
   * Last loaded timestamp
   */
  readonly lastLoaded: Signal<Date | null> = computed(() => this.state().lastLoaded);

  /**
   * Selected todo ID
   */
  readonly selectedTodoId: Signal<string | null> = computed(() => this.state().selectedTodoId);

  /**
   * Selected todo (computed from selectedTodoId)
   */
  readonly selectedTodo: Signal<Todo | undefined> = computed(() => {
    const selectedId = this.selectedTodoId();
    if (!selectedId) return undefined;
    return this.todoById(selectedId);
  });

  // ==================== QUERY METHODS ====================

  /**
   * Get todo by ID from current state
   */
  todoById(id: string): Todo | undefined {
    return findById(this.state().privateTodos, id) || findById(this.state().sharedTodos, id);
  }

  /**
   * Check if todo exists
   */
  todoExists(id: string): boolean {
    return this.todoById(id) !== undefined;
  }

  /**
   * Get todos by user ID
   */
  todosByUserId(userId: string): Signal<Todo[]> {
    return computed(() => this.todos().filter((todo) => todo.userId === userId));
  }

  /**
   * Get todos by visibility
   */
  todosByVisibility(visibility: "private" | "team"): Signal<Todo[]> {
    return visibility === "private" ? this.privateTodos : this.sharedTodos;
  }

  /**
   * Get todos with tasks
   */
  readonly todosWithTasks: Signal<Todo[]> = computed(() =>
    this.todos().filter((todo) => todo.tasks && todo.tasks.length > 0)
  );

  /**
   * Get todos without tasks
   */
  readonly todosWithoutTasks: Signal<Todo[]> = computed(() =>
    this.todos().filter((todo) => !todo.tasks || todo.tasks.length === 0)
  );

  // ==================== COMMAND METHODS ====================

  /**
   * Set loading state
   */
  setLoading(loading: boolean): void {
    this.state.update((state) => ({ ...state, loading }));
  }

  /**
   * Set loaded state and timestamp
   */
  setLoaded(loaded: boolean): void {
    this.state.update((state) => ({
      ...state,
      loaded,
      lastLoaded: loaded ? new Date() : state.lastLoaded,
    }));
  }

  /**
   * Set selected todo ID
   */
  selectTodo(todoId: string | null): void {
    this.state.update((state) => ({ ...state, selectedTodoId: todoId }));
  }

  /**
   * Set private todos collection
   */
  setPrivateTodos(todos: Todo[]): void {
    this.state.update((state) => ({ ...state, privateTodos: todos }));
  }

  /**
   * Set shared todos collection
   */
  setSharedTodos(todos: Todo[]): void {
    this.state.update((state) => ({ ...state, sharedTodos: todos }));
  }

  /**
   * Set both private and shared todos
   */
  setAllTodos(privateTodos: Todo[], sharedTodos: Todo[]): void {
    this.state.update((state) => ({
      ...state,
      privateTodos,
      sharedTodos,
      loaded: true,
      lastLoaded: new Date(),
      loading: false,
    }));
  }

  /**
   * Add a single todo
   */
  addTodo(todo: Todo): void {
    const isPrivate = todo.visibility === "private";

    this.state.update((state) => {
      const targetArray = isPrivate ? state.privateTodos : state.sharedTodos;
      const updatedArray = addEntityToArray(targetArray, todo);

      return {
        ...state,
        privateTodos: isPrivate ? updatedArray : state.privateTodos,
        sharedTodos: isPrivate ? state.sharedTodos : updatedArray,
      };
    });
  }

  /**
   * Update a todo
   */
  updateTodo(id: string, updates: Partial<Todo>): void {
    this.state.update((state) => {
      const existsInPrivate = findById(state.privateTodos, id) !== undefined;
      const existsInShared = findById(state.sharedTodos, id) !== undefined;

      let newPrivateTodos = state.privateTodos;
      let newSharedTodos = state.sharedTodos;

      if (existsInPrivate) {
        newPrivateTodos = updateEntityInArray(state.privateTodos, id, updates);
      }
      if (existsInShared) {
        newSharedTodos = updateEntityInArray(state.sharedTodos, id, updates);
      }

      // Handle visibility change
      if (updates.visibility) {
        const todo = this.todoById(id);
        if (todo && todo.visibility !== updates.visibility) {
          // Remove from old location
          if (updates.visibility === "team") {
            newPrivateTodos = removeEntityFromArray(newPrivateTodos, id);
            if (!findById(newSharedTodos, id)) {
              newSharedTodos = [{ ...todo, ...updates }, ...newSharedTodos];
            }
          } else {
            newSharedTodos = removeEntityFromArray(newSharedTodos, id);
            if (!findById(newPrivateTodos, id)) {
              newPrivateTodos = [{ ...todo, ...updates }, ...newPrivateTodos];
            }
          }
        }
      }

      return {
        ...state,
        privateTodos: newPrivateTodos,
        sharedTodos: newSharedTodos,
      };
    });
  }

  /**
   * Remove a todo
   */
  removeTodo(id: string): void {
    this.state.update((state) => ({
      ...state,
      privateTodos: removeEntityFromArray(state.privateTodos, id),
      sharedTodos: removeEntityFromArray(state.sharedTodos, id),
    }));
  }

  /**
   * Remove todo with cascade (tasks, subtasks, comments are inside todo object)
   * The nested data is automatically removed since it's stored within the todo
   */
  removeTodoWithCascade(id: string): void {
    this.removeTodo(id);
  }

  /**
   * Restore todo (mark as not deleted)
   */
  restoreTodo(id: string): void {
    this.updateTodo(id, { deleted_at: null });
  }

  /**
   * Restore todo with cascade data
   */
  restoreTodoWithCascade(todo: Todo): void {
    this.addTodo({ ...todo, deleted_at: null });
  }

  /**
   * Move todo from private to shared (or vice versa)
   */
  moveTodoToShared(todoId: string): void {
    const todo = this.todoById(todoId);
    if (!todo) return;

    this.state.update((state) => ({
      ...state,
      privateTodos: removeEntityFromArray(state.privateTodos, todoId),
      sharedTodos: addEntityToArray(state.sharedTodos, { ...todo, visibility: "team" }),
    }));
  }

  moveTodoToPrivate(todoId: string): void {
    const todo = this.todoById(todoId);
    if (!todo) return;

    this.state.update((state) => ({
      ...state,
      sharedTodos: removeEntityFromArray(state.sharedTodos, todoId),
      privateTodos: addEntityToArray(state.privateTodos, { ...todo, visibility: "private" }),
    }));
  }

  /**
   * Clear all todos (logout, reset)
   */
  clear(): void {
    this.state.set(initialState);
  }

  /**
   * Bulk update todos (for sync operations)
   */
  bulkUpdateTodos(updates: Todo[], visibility?: "private" | "team"): void {
    this.state.update((state) => {
      let newPrivateTodos = [...state.privateTodos];
      let newSharedTodos = [...state.sharedTodos];

      for (const update of updates) {
        const isPrivate =
          visibility !== undefined ? visibility === "private" : update.visibility === "private";
        const targetArray = isPrivate ? newPrivateTodos : newSharedTodos;
        const existingIndex = targetArray.findIndex((t) => t.id === update.id);

        if (existingIndex >= 0) {
          targetArray[existingIndex] = { ...targetArray[existingIndex], ...update };
        } else {
          targetArray.unshift(update);
        }
      }

      return {
        ...state,
        privateTodos: newPrivateTodos,
        sharedTodos: newSharedTodos,
      };
    });
  }
}
