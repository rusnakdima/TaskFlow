/**
 * Task Store - Manages task state using Angular signals
 *
 * Tasks are stored flat (not nested in todos) for better performance
 * Relations to todos are maintained via todoId foreign key
 */

import { Injectable, signal, computed, Signal, WritableSignal } from "@angular/core";
import { Task, TaskStatus } from "@models/task.model";
import {
  deduplicateAndFilterDeleted,
  addEntityToArray,
  removeEntityFromArray,
  updateEntityInArray,
  findById,
  groupByKey,
} from "./utils/store-helpers";

interface TaskState {
  tasks: Task[];
  loading: boolean;
  loaded: boolean;
  lastLoaded: Date | null;
}

const initialState: TaskState = {
  tasks: [],
  loading: false,
  loaded: false,
  lastLoaded: null,
};

@Injectable({
  providedIn: "root",
})
export class TaskStore {
  private readonly state: WritableSignal<TaskState> = signal(initialState);

  // ==================== COMPUTED SIGNALS ====================

  readonly tasks: Signal<Task[]> = computed(() => {
    return deduplicateAndFilterDeleted(this.state().tasks);
  });

  readonly loading: Signal<boolean> = computed(() => this.state().loading);
  readonly loaded: Signal<boolean> = computed(() => this.state().loaded);
  readonly lastLoaded: Signal<Date | null> = computed(() => this.state().lastLoaded);

  /**
   * Tasks filtered by status
   */
  readonly pendingTasks: Signal<Task[]> = computed(() =>
    this.tasks().filter((task) => task.status === TaskStatus.PENDING)
  );

  readonly completedTasks: Signal<Task[]> = computed(() =>
    this.tasks().filter((task) => task.status === TaskStatus.COMPLETED)
  );

  /**
   * Get task count by status
   */
  readonly pendingTaskCount: Signal<number> = computed(() => this.pendingTasks().length);

  readonly completedTaskCount: Signal<number> = computed(() => this.completedTasks().length);

  // ==================== QUERY METHODS ====================

  taskById(id: string): Task | undefined {
    return findById(this.state().tasks, id);
  }

  taskExists(id: string): boolean {
    return this.taskById(id) !== undefined;
  }

  /**
   * Get tasks by todo ID
   */
  tasksByTodoId(todoId: string): Signal<Task[]> {
    return computed(() => this.tasks().filter((task) => task.todoId === todoId));
  }

  /**
   * Get task count by todo ID
   */
  taskCountByTodoId(todoId: string): Signal<number> {
    return computed(() => this.tasks().filter((task) => task.todoId === todoId).length);
  }

  /**
   * Get tasks grouped by todo
   */
  readonly tasksGroupedByTodo: Signal<Map<string, Task[]>> = computed(() => {
    const tasks = this.tasks();
    return groupByKey(tasks, (task) => task.todoId);
  });

  // ==================== COMMAND METHODS ====================

  setLoading(loading: boolean): void {
    this.state.update((state) => ({ ...state, loading }));
  }

  setLoaded(loaded: boolean): void {
    this.state.update((state) => ({
      ...state,
      loaded,
      lastLoaded: loaded ? new Date() : state.lastLoaded,
    }));
  }

  setTasks(tasks: Task[]): void {
    this.state.update((state) => ({ ...state, tasks }));
  }

  addTask(task: Task): void {
    this.state.update((state) => ({
      ...state,
      tasks: addEntityToArray(state.tasks, task),
    }));
  }

  updateTask(id: string, updates: Partial<Task>): void {
    this.state.update((state) => ({
      ...state,
      tasks: updateEntityInArray(state.tasks, id, updates),
    }));
  }

  removeTask(id: string): void {
    this.state.update((state) => ({
      ...state,
      tasks: removeEntityFromArray(state.tasks, id),
    }));
  }

  restoreTask(id: string): void {
    this.updateTask(id, { isDeleted: false });
  }

  clear(): void {
    this.state.set(initialState);
  }

  /**
   * Bulk add/update tasks (for sync operations)
   */
  bulkUpsertTasks(tasks: Task[]): void {
    this.state.update((state) => {
      const taskMap = new Map(state.tasks.map((t) => [t.id, t]));

      for (const task of tasks) {
        taskMap.set(task.id, { ...taskMap.get(task.id), ...task });
      }

      return {
        ...state,
        tasks: Array.from(taskMap.values()),
      };
    });
  }
}
