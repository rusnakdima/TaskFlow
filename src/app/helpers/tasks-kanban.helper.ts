import { Injectable, inject, signal } from "@angular/core";
import { CdkDragDrop } from "@angular/cdk/drag-drop";
import { Task, TaskStatus } from "@models/task.model";
import { Todo } from "@models/todo.model";
import { BaseItemHelper } from "@helpers/base-item.helper";
import { REQUEST_SERVICE, Visibility } from "@services/api.service";
import { NotifyService } from "@services/notifications/notify.service";
import { KanbanDragDropService } from "@services/ui/kanban-drag-drop.service";
import { STATUS_ICONS } from "@constants/table-field.constants";

export interface KanbanColumn {
  id: TaskStatus;
  label: string;
  color: string;
  icon: string;
  iconBgClass: string;
}

@Injectable({ providedIn: "root" })
export class TasksKanbanHelper {
  private requestService = inject(REQUEST_SERVICE);
  private notifyService = inject(NotifyService);
  private kanbanDragDropService = inject(KanbanDragDropService);

  private _isUpdatingKanban = signal(false);

  getColumnColorClass = BaseItemHelper.getColumnColorClass;

  getKanbanColumns(): KanbanColumn[] {
    return [
      {
        id: TaskStatus.PENDING,
        label: "To Do",
        color: "bg-yellow-500",
        icon: STATUS_ICONS[TaskStatus.PENDING],
        iconBgClass: "bg-yellow-500/20 text-yellow-400",
      },
      {
        id: TaskStatus.COMPLETED,
        label: "Done",
        color: "bg-green-500",
        icon: STATUS_ICONS[TaskStatus.COMPLETED],
        iconBgClass: "bg-green-500/20 text-green-400",
      },
      {
        id: TaskStatus.SKIPPED,
        label: "Skipped",
        color: "bg-orange-500",
        icon: STATUS_ICONS[TaskStatus.SKIPPED],
        iconBgClass: "bg-orange-500/20 text-orange-400",
      },
      {
        id: TaskStatus.FAILED,
        label: "Failed",
        color: "bg-red-500",
        icon: STATUS_ICONS[TaskStatus.FAILED],
        iconBgClass: "bg-red-500/20 text-red-400",
      },
    ];
  }

  getTasksByStatus(tasks: Task[], status: TaskStatus): Task[] {
    return tasks.filter((t) => t.status === status);
  }

  getConnectedKanbanDropLists(currentStatus: TaskStatus): string[] {
    return this.kanbanDragDropService.getConnectedDropLists(
      currentStatus,
      this.getKanbanColumns() as any
    );
  }

  onKanbanTaskDrop(
    event: CdkDragDrop<Task[]>,
    targetStatus: TaskStatus,
    _todo: Todo | null,
    updateTaskFn: (taskId: string, newStatus: TaskStatus) => void
  ): void {
    this.kanbanDragDropService.handleTaskDrop(
      event,
      targetStatus,
      this._isUpdatingKanban(),
      (newStatus, taskId) => {
        if (taskId) {
          updateTaskFn(taskId, newStatus);
        }
      }
    );
  }

  onKanbanStatusCycle(
    task: Task,
    updateTaskFn: (taskId: string, newStatus: TaskStatus) => void
  ): void {
    const newStatus = BaseItemHelper.getNextStatus(task.status);
    updateTaskFn(task.id, newStatus);
  }

  onKanbanTaskClick(task: Task, router: any, route: any): void {
    router.navigate([task.id, "subtasks"], { relativeTo: route });
  }

  onKanbanSelectionChange(
    taskId: string,
    isSelected: boolean,
    toggleTaskSelectionFn: (event: { id: string; selected: boolean }) => void
  ): void {
    toggleTaskSelectionFn({ id: taskId, selected: isSelected });
  }

  isKanbanTaskSelected(taskId: string, selectedTasks: Set<string>): boolean {
    return selectedTasks.has(taskId);
  }

  updateTaskStatus(
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
