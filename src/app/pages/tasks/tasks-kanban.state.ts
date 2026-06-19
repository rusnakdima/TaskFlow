import { inject } from "@angular/core";
import { CdkDragDrop } from "@angular/cdk/drag-drop";
import { Task, TaskStatus, Todo } from "@entities/generated/api.types";
import { TasksKanbanHelper } from "@helpers/tasks-kanban.helper";

export class TasksKanbanState {
  kanbanHelper = inject(TasksKanbanHelper);

  getKanbanColumns() {
    return this.kanbanHelper.getKanbanColumns();
  }

  getColumnColorClass = this.kanbanHelper.getColumnColorClass;

  getTasksByStatus(tasks: Task[], status: TaskStatus): Task[] {
    return this.kanbanHelper.getTasksByStatus(tasks, status);
  }

  getConnectedKanbanDropLists(currentStatus: TaskStatus): string[] {
    return this.kanbanHelper.getConnectedKanbanDropLists(currentStatus);
  }

  onKanbanTaskDrop(
    event: CdkDragDrop<Task[]>,
    targetStatus: TaskStatus,
    todo: Todo | null,
    updateTaskStatusFn: (taskId: string, newStatus: TaskStatus) => void
  ): void {
    this.kanbanHelper.onKanbanTaskDrop(event, targetStatus, todo, updateTaskStatusFn);
  }

  onKanbanStatusCycle(
    task: Task,
    canEditTask: (task: Task) => boolean,
    notifyService: { showError: (msg: string) => void },
    updateTaskStatusFn: (taskId: string, newStatus: TaskStatus) => void
  ): void {
    if (!canEditTask(task)) {
      notifyService.showError("You don't have permission to change task status");
      return;
    }
    this.kanbanHelper.onKanbanStatusCycle(task, updateTaskStatusFn);
  }

  onKanbanTaskClick(task: Task, router: any, route: any): void {
    this.kanbanHelper.onKanbanTaskClick(task, router, route);
  }

  onKanbanSelectionChange(
    taskId: string,
    isSelected: boolean,
    toggleTaskSelectionFn: (event: { id: string; selected: boolean }) => void
  ): void {
    this.kanbanHelper.onKanbanSelectionChange(taskId, isSelected, toggleTaskSelectionFn);
  }

  isKanbanTaskSelected(taskId: string, selectedTasks: Set<string>): boolean {
    return this.kanbanHelper.isKanbanTaskSelected(taskId, selectedTasks);
  }

  updateTaskStatus(
    taskId: string,
    newStatus: TaskStatus,
    todo: Todo | null,
    updateTasksFn: (fn: (tasks: Task[]) => Task[]) => void
  ): void {
    this.kanbanHelper.updateTaskStatus(taskId, newStatus, todo, updateTasksFn);
  }
}
