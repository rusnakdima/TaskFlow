/**
 * Subtask Store - Manages subtask state using Angular signals
 *
 * Subtasks are stored flat (not nested in tasks) for better performance
 * Relations to tasks are maintained via taskId foreign key
 */

import { Injectable, signal, computed, Signal, WritableSignal } from "@angular/core";
import { Subtask } from "@models/subtask.model";
import {
  deduplicateAndFilterDeleted,
  addEntityToArray,
  removeEntityFromArray,
  updateEntityInArray,
  findById,
  groupByKey,
} from "./utils/store-helpers";

interface SubtaskState {
  subtasks: Subtask[];
  loading: boolean;
  loaded: boolean;
  lastLoaded: Date | null;
}

const initialState: SubtaskState = {
  subtasks: [],
  loading: false,
  loaded: false,
  lastLoaded: null,
};

@Injectable({
  providedIn: "root",
})
export class SubtaskStore {
  private readonly state: WritableSignal<SubtaskState> = signal(initialState);

  // ==================== COMPUTED SIGNALS ====================

  readonly subtasks: Signal<Subtask[]> = computed(() => {
    return deduplicateAndFilterDeleted(this.state().subtasks);
  });

  readonly loading: Signal<boolean> = computed(() => this.state().loading);
  readonly loaded: Signal<boolean> = computed(() => this.state().loaded);
  readonly lastLoaded: Signal<Date | null> = computed(() => this.state().lastLoaded);

  // ==================== QUERY METHODS ====================

  subtaskById(id: string): Subtask | undefined {
    return findById(this.state().subtasks, id);
  }

  subtaskExists(id: string): boolean {
    return this.subtaskById(id) !== undefined;
  }

  /**
   * Get subtasks by task ID
   */
  subtasksByTaskId(taskId: string): Signal<Subtask[]> {
    return computed(() => this.subtasks().filter((subtask) => subtask.taskId === taskId));
  }

  /**
   * Get subtask count by task ID
   */
  subtaskCountByTaskId(taskId: string): Signal<number> {
    return computed(() => this.subtasks().filter((subtask) => subtask.taskId === taskId).length);
  }

  /**
   * Get subtasks grouped by task
   */
  readonly subtasksGroupedByTask: Signal<Map<string, Subtask[]>> = computed(() => {
    const subtasks = this.subtasks();
    return groupByKey(subtasks, (subtask) => subtask.taskId);
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

  setSubtasks(subtasks: Subtask[]): void {
    this.state.update((state) => ({ ...state, subtasks }));
  }

  addSubtask(subtask: Subtask): void {
    this.state.update((state) => ({
      ...state,
      subtasks: addEntityToArray(state.subtasks, subtask),
    }));
  }

  updateSubtask(id: string, updates: Partial<Subtask>): void {
    this.state.update((state) => ({
      ...state,
      subtasks: updateEntityInArray(state.subtasks, id, updates),
    }));
  }

  removeSubtask(id: string): void {
    this.state.update((state) => ({
      ...state,
      subtasks: removeEntityFromArray(state.subtasks, id),
    }));
  }

  restoreSubtask(id: string): void {
    this.updateSubtask(id, { deleted_at: null });
  }

  clear(): void {
    this.state.set(initialState);
  }

  /**
   * Bulk add/update subtasks (for sync operations)
   */
  bulkUpsertSubtasks(subtasks: Subtask[]): void {
    this.state.update((state) => {
      const subtaskMap = new Map(state.subtasks.map((s) => [s.id, s]));

      for (const subtask of subtasks) {
        subtaskMap.set(subtask.id, { ...subtaskMap.get(subtask.id), ...subtask });
      }

      return {
        ...state,
        subtasks: Array.from(subtaskMap.values()),
      };
    });
  }
}
