import { Injectable } from "@angular/core";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

export interface CascadeResult {
  taskIds: string[];
  subtaskIds: string[];
  timestamp: string;
}

export interface CascadeUpdate {
  id: string;
  updates: { deleted_at: string | null; updated_at: string };
}

// ARCHITECTURAL NOTE: CascadeService handles cascade operations for task/subtask deletion.
// This is a focused utility service, not a god service - kept minimal.
@Injectable({ providedIn: "root" })
export class CascadeService {
  getCascadeTaskIds(tasks: Task[], todoId: string): string[] {
    return tasks.filter((t) => t.todo_id === todoId).map((t) => t.id);
  }

  getCascadeSubtaskIds(subtasks: Subtask[], taskIds: string[]): string[] {
    return subtasks.filter((s) => taskIds.includes(s.task_id)).map((s) => s.id);
  }

  getCascadeSubtaskIdsForTask(subtasks: Subtask[], taskId: string): string[] {
    return subtasks.filter((s) => s.task_id === taskId).map((s) => s.id);
  }

  computeCascadeForTodo(tasks: Task[], subtasks: Subtask[], todoId: string): CascadeResult {
    const taskIds = this.getCascadeTaskIds(tasks, todoId);
    const subtaskIds = this.getCascadeSubtaskIds(subtasks, taskIds);
    return {
      taskIds,
      subtaskIds,
      timestamp: new Date().toISOString(),
    };
  }

  computeCascadeForTask(subtasks: Subtask[], taskId: string): CascadeResult {
    const subtaskIds = this.getCascadeSubtaskIdsForTask(subtasks, taskId);
    return {
      taskIds: [taskId],
      subtaskIds,
      timestamp: new Date().toISOString(),
    };
  }

  buildCascadeUpdates(cascade: CascadeResult, deletedAt: boolean): CascadeUpdate[] {
    const { taskIds, subtaskIds, timestamp } = cascade;
    const deletedValue = deletedAt ? timestamp : null;

    const updates: CascadeUpdate[] = [];

    taskIds.forEach((id) => {
      updates.push({ id, updates: { deleted_at: deletedValue, updated_at: timestamp } });
    });

    subtaskIds.forEach((id) => {
      updates.push({ id, updates: { deleted_at: deletedValue, updated_at: timestamp } });
    });

    return updates;
  }
}
