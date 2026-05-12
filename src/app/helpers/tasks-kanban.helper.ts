import { Injectable, inject } from "@angular/core";
import { CdkDragDrop } from "@angular/cdk/drag-drop";
import { Task, TaskStatus, Todo } from "@models/generated/api.types";
import { BaseKanbanHelper, KanbanColumn } from "@helpers/base-kanban.helper";
import { REQUEST_SERVICE, Visibility } from "@services/api.service";

@Injectable({ providedIn: "root" })
export class TasksKanbanHelper extends BaseKanbanHelper<Task> {
  private requestService = inject(REQUEST_SERVICE);

  getEntityName(): string {
    return "task";
  }

  getKanbanColumns(): KanbanColumn[] {
    return [
      {
        id: TaskStatus.PENDING,
        label: "To Do",
        color: "bg-yellow-500",
        icon: "circle",
        iconBgClass: "bg-yellow-500/20 text-yellow-400",
      },
      {
        id: TaskStatus.COMPLETED,
        label: "Done",
        color: "bg-green-500",
        icon: "check-circle",
        iconBgClass: "bg-green-500/20 text-green-400",
      },
      {
        id: TaskStatus.SKIPPED,
        label: "Skipped",
        color: "bg-orange-500",
        icon: "skip-forward",
        iconBgClass: "bg-orange-500/20 text-orange-400",
      },
      {
        id: TaskStatus.FAILED,
        label: "Failed",
        color: "bg-red-500",
        icon: "x-circle",
        iconBgClass: "bg-red-500/20 text-red-400",
      },
    ];
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

  override onKanbanSelectionChange(
    taskId: string,
    isSelected: boolean,
    toggleTaskSelectionFn: (event: { id: string; selected: boolean }) => void
  ): void {
    super.onKanbanSelectionChange(taskId, isSelected, toggleTaskSelectionFn);
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
    if (this._isUpdatingKanban()) {
      this.notifyService.showWarning("Please wait for previous operation to complete");
      return;
    }

    this._isUpdatingKanban.set(true);

    const visibility = todo?.visibility || "private";

    this.requestService
      .update<Task>(
        "tasks",
        taskId,
        { status: newStatus },
        { visibility: visibility as Visibility }
      )
      .subscribe({
        next: () => {
          updateTasksFn((tasks) =>
            tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
          );
          this._isUpdatingKanban.set(false);
          this.notifyService.showSuccess(`Task moved to ${newStatus}`);
        },
        error: (err) => {
          this._isUpdatingKanban.set(false);
          this.notifyService.showError(err.message || "Failed to update task");
        },
      });
  }
}
