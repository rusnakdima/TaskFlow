import { Injectable } from "@angular/core";
import { CdkDragDrop } from "@angular/cdk/drag-drop";
import { Task, TaskStatus, Todo } from "@entities/generated/api.types";
import { BaseKanbanHelper, KanbanColumn, KANBAN_COLUMNS } from "@helpers/base-kanban.helper";

@Injectable({ providedIn: "root" })
export class TasksKanbanHelper extends BaseKanbanHelper<Task> {
  getEntityName(): string {
    return "task";
  }

  getEntityNameForUpdate(): string {
    return "task";
  }

  getKanbanColumns(): KanbanColumn[] {
    return KANBAN_COLUMNS;
  }

  getColumns(): KanbanColumn[] {
    return this.getKanbanColumns();
  }

  getTasksByStatus(tasks: Task[], status: TaskStatus): Task[] {
    return this.getItemsByStatus(tasks, status);
  }

  onKanbanTaskDrop(
    event: CdkDragDrop<Task[]>,
    targetStatus: TaskStatus,
    _todo: Todo | null,
    updateTaskFn: (taskId: string, newStatus: TaskStatus) => void
  ): void {
    this.onKanbanItemDrop(event, targetStatus, _todo, updateTaskFn);
  }

  onKanbanTaskClick(task: Task, router: any, route: any): void {
    router.navigate([task.id, "subtasks"], { relativeTo: route });
  }

  isKanbanTaskSelected(taskId: string, selectedTasks: Set<string>): boolean {
    return super.isKanbanItemSelected(taskId, selectedTasks);
  }

  updateTaskStatus(
    taskId: string,
    newStatus: TaskStatus,
    todo: Todo | null,
    updateTasksFn: (updateFn: (tasks: Task[]) => Task[]) => void
  ): void {
    this.updateStatus(taskId, newStatus, todo, updateTasksFn);
  }

  updateStatus(
    taskId: string,
    newStatus: TaskStatus,
    todo: Todo | null,
    updateTasksFn: (updateFn: (tasks: Task[]) => Task[]) => void
  ): void {
    this.updateStatusInternal(taskId, newStatus, todo, updateTasksFn, "tasks");
  }
}
