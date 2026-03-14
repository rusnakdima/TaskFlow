/* sys lib */
import { Injectable } from "@angular/core";
import { CdkDragDrop, moveItemInArray, transferArrayItem } from "@angular/cdk/drag-drop";

/* models */
import { Task, TaskStatus } from "@models/task.model";

/**
 * KanbanDragDropService - Handles drag-drop operations for Kanban board
 * Extracted from KanbanView to reduce component complexity
 */
@Injectable({
  providedIn: "root",
})
export class KanbanDragDropService {
  /**
   * Handle task drop event on Kanban board
   * @param event - CDK drag-drop event
   * @param targetStatus - The status of the target column
   * @param isUpdatingOrder - Signal indicating if an order update is in progress
   * @param onMoveTask - Callback to move task to new status
   * @returns Object with updated containers and task to move (if any)
   */
  handleTaskDrop(
    event: CdkDragDrop<Task[]>,
    targetStatus: TaskStatus,
    isUpdatingOrder: boolean,
    onMoveTask: (taskId: string, newStatus: TaskStatus) => void
  ): {
    moved: boolean;
    task?: Task;
    newStatus?: TaskStatus;
  } {
    if (isUpdatingOrder) {
      return { moved: false };
    }

    const task = event.item.data as Task;

    if (event.previousContainer === event.container) {
      // Reordering within the same column - just visual reordering
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      return { moved: false };
    } else {
      // Moving to a different column
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );

      // Update the task status in backend
      onMoveTask(task.id, targetStatus);
      return { moved: true, task, newStatus: targetStatus };
    }
  }

  /**
   * Get connected drop lists for CDK drag-drop
   * @param currentColumnId - Current column ID
   * @param columns - Array of column definitions
   * @returns Array of connected drop list IDs
   */
  getConnectedDropLists(currentColumnId: string, columns: any[]): string[] {
    return columns
      .filter((col) => col.id !== currentColumnId)
      .map((col) => "cdk-drop-list-" + col.id);
  }

  /**
   * Handle task drop event in a simple list view
   * @param event - CDK drag-drop event
   * @param list - The current list of tasks
   * @param isUpdatingOrder - Signal indicating if an order update is in progress
   * @returns Object with updated tasks and IDs of tasks that changed order
   */
  handleListDrop(
    event: CdkDragDrop<Task[]>,
    list: Task[],
    isUpdatingOrder: boolean
  ): {
    updated: boolean;
    prevTask?: Task;
    currentTask?: Task;
  } {
    if (isUpdatingOrder) return { updated: false };
    if (event.previousIndex === event.currentIndex) return { updated: false };

    const tasks = [...list];
    const prevTask = { ...tasks[event.previousIndex] };
    const currentTask = { ...tasks[event.currentIndex] };

    const tempOrder = prevTask.order;
    prevTask.order = currentTask.order;
    currentTask.order = tempOrder;

    return {
      updated: true,
      prevTask,
      currentTask,
    };
  }
}
