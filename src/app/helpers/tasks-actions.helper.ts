import { Injectable, inject } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { Task, TaskStatus, Todo } from "@models/generated/api.types";
import { ResponseStatus } from "@models/response.model";
import { ApiService, Visibility } from "@services/api.service";
import { AdminService } from "@services/data/admin.service";
import { BulkActionHelper, BulkOperationResult } from "@helpers/bulk-action.helper";
import { ConfirmDialogService } from "@services/core/confirm-dialog.service";

import { NotifyService } from "@services/notifications/notify.service";
import { GithubService } from "@services/github/github.service";
import { BaseItemHelper } from "@helpers/base-item.helper";
import { TABLE_ACTIONS } from "@constants/table-field.constants";
import { TableFieldActionButton } from "@models/table-field.model";

@Injectable({ providedIn: "root" })
export class TasksActionsHelper {
  private requestService = inject(ApiService);
  private apiService = inject(ApiService);
  private adminService = inject(AdminService);
  private bulkActionHelper = inject(BulkActionHelper);
  private confirmDialogService = inject(ConfirmDialogService);
  private notifyService = inject(NotifyService);
  private githubService = inject(GithubService);

  taskActions = [TABLE_ACTIONS.EDIT, TABLE_ACTIONS.ARCHIVE];

  async deleteTask(
    taskId: string,
    todoId: string | null,
    updateTasksFn: (updateFn: (tasks: Task[]) => Task[]) => void,
    visibility?: string
  ): Promise<void> {
    if (!todoId || !taskId) return;

    const confirmed = await this.confirmDialogService.confirm({
      title: "Delete Task",
      message: "Are you sure you want to delete this task?",
      confirmText: "Delete",
      confirmClass: "bg-red-600 hover:bg-red-700",
    });
    if (!confirmed) return;

    this.apiService.tasks.delete(taskId, { visibility }).subscribe({
      next: () => {
        this.notifyService.showSuccess("Task deleted successfully");
        updateTasksFn((tasks) => tasks.filter((t) => t.id !== taskId));
      },
    });
  }

  async archiveTask(
    taskId: string,
    todoId: string | null,
    todo: Todo | null,
    updateTasksFn: (updateFn: (tasks: Task[]) => Task[]) => void,
    isOfflineFn: () => boolean,
    visibility?: string
  ): Promise<void> {
    if (!todoId || !taskId) return;

    const confirmed = await this.confirmDialogService.confirm({
      title: "Archive Task",
      message: "Are you sure you want to archive this task?",
      confirmText: "Archive",
      confirmClass: "bg-orange-600 hover:bg-orange-700",
    });
    if (!confirmed) return;

    if (isOfflineFn()) {
      const response = await this.adminService.toggleDeleteStatusLocal("tasks", taskId);
      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Task archived successfully");
        updateTasksFn((tasks) => tasks.filter((t) => t.id !== taskId));
      } else {
        this.notifyService.showError(response.message || "Failed to archive task");
      }
      return;
    }

    const vis = visibility || todo?.visibility || "private";
    this.apiService.tasks.delete(taskId, { visibility: vis }).subscribe({
      next: () => {
        this.notifyService.showSuccess("Task archived successfully");
        updateTasksFn((tasks) => tasks.filter((t) => t.id !== taskId));
      },
    });
  }

  toggleTaskCompletion(
    task: Task,
    todo: Todo | null,
    updateTasksFn: (updateFn: (tasks: Task[]) => Task[]) => void,
    checkDependenciesCompletedFn: (dependsOn: string[]) => boolean
  ): void {
    if (!todo) return;

    if (
      task.status === TaskStatus.PENDING &&
      !checkDependenciesCompletedFn(task.depends_on || [])
    ) {
      this.notifyService.showError("Cannot complete task: waiting for dependencies");
      return;
    }

    const newStatus = BaseItemHelper.getNextStatus(task.status);

    this.requestService
      .update<Task>(
        "tasks",
        task.id,
        { status: newStatus },
        { visibility: (todo.visibility || "private") as Visibility, offline: true }
      )
      .subscribe({
        next: () => {
          updateTasksFn((tasks) =>
            tasks.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
          );
        },
        error: () => {
          this.notifyService.showError("Failed to update task status");
        },
      });
  }

  cycleStatus(
    task: Task,
    todo: Todo | null,
    updateTasksFn: (updateFn: (tasks: Task[]) => Task[]) => void,
    checkDependenciesCompletedFn: (dependsOn: string[]) => boolean
  ): void {
    this.toggleTaskCompletion(task, todo, updateTasksFn, checkDependenciesCompletedFn);
  }

  onTaskTableAction(
    event: { action: string; item: Task },
    todo: Todo | null,
    updateTasksFn: (updateFn: (tasks: Task[]) => Task[]) => void,
    checkDependenciesCompletedFn: (dependsOn: string[]) => boolean,
    router: any,
    route: any,
    deleteTaskFn: (taskId: string, visibility?: string) => Promise<void>,
    archiveTaskFn: (taskId: string, visibility?: string) => Promise<void>,
    createOrUpdateGithubIssueFromTaskFn: (task: Task) => void
  ): void {
    const visibility = todo?.visibility;
    switch (event.action) {
      case "edit":
        router.navigate([event.item.id, "edit_task"], {
          relativeTo: route,
          queryParams: { visibility },
        });
        break;
      case "delete":
        deleteTaskFn(event.item.id, visibility);
        break;
      case "archive":
        archiveTaskFn(event.item.id, visibility);
        break;
      case "toggle":
      case "toggle_status":
        this.toggleTaskCompletion(event.item, todo, updateTasksFn, checkDependenciesCompletedFn);
        break;
      case "github_issue":
        createOrUpdateGithubIssueFromTaskFn(event.item);
        break;
    }
  }

  onTaskItemAction(_event: { action: string; item: Task }): void {}

  getTaskTableActions(todo: Todo | null): TableFieldActionButton[] {
    const actions: TableFieldActionButton[] = [TABLE_ACTIONS.EDIT, TABLE_ACTIONS.ARCHIVE];
    if (todo?.github_repo_name) {
      actions.unshift(TABLE_ACTIONS.GITHUB_ISSUE);
    }
    return actions;
  }

  getTaskCardActions(): TableFieldActionButton[] {
    return this.taskActions;
  }

  createOrUpdateGithubIssueFromTask(task: Task, todo: Todo | null): void {
    if (!todo?.github_repo_name) {
      this.notifyService.showError("Project is not linked to a GitHub repository");
      return;
    }

    const [owner, repo] = todo.github_repo_name.split("/");
    if (!owner || !repo) {
      this.notifyService.showError("Invalid GitHub repository configuration");
      return;
    }

    const issueBody = `**Task Details**

**Description:** ${task.description || "N/A"}
**Priority:** ${task.priority || "medium"}
**Due Date:** ${task.end_date || "N/A"}
**Created in:** TaskFlow

---
[View in TaskFlow](taskflow://tasks/${task.id})`;

    if (task.github_issue_id) {
      this.githubService
        .updateIssue(owner, repo, task.github_issue_number!, task.title, issueBody)
        .subscribe({
          next: (result) => {
            this.notifyService.showSuccess("GitHub issue updated");
            this.requestService
              .update<Task>("tasks", task.id, { github_issue_url: result.html_url })
              .subscribe();
          },
          error: (err) => {
            this.notifyService.showError("Failed to update GitHub issue: " + (err.message || err));
          },
        });
    } else if (task.publish_to_github) {
      this.githubService.createIssue(owner, repo, task.title, issueBody).subscribe({
        next: (result) => {
          this.notifyService.showSuccess(`GitHub issue created: ${result.html_url}`);
          this.requestService
            .update<Task>("tasks", task.id, {
              github_issue_id: String(result.id),
              github_issue_number: result.number,
              github_issue_url: result.html_url,
            })
            .subscribe();
        },
        error: (err) => {
          this.notifyService.showError("Failed to create GitHub issue: " + (err.message || err));
        },
      });
    }
  }

  bulkUpdatePriority(
    selectedIds: Set<string>,
    priority: string,
    clearSelectionFn: () => void,
    notifyFn: (message: string) => void,
    updateTaskFn: (id: string, data: any) => any
  ): void {
    const selectedIdsArr = Array.from(selectedIds);
    this.bulkActionHelper
      .bulkUpdateField(
        selectedIdsArr.map((id) => ({ id })),
        "priority",
        priority,
        (id, data) => updateTaskFn(id, data)
      )
      .subscribe({
        next: (result: BulkOperationResult) => {
          clearSelectionFn();
          if (result.errorCount > 0) {
            notifyFn(`Updated ${result.successCount} tasks, ${result.errorCount} failed.`);
          } else {
            notifyFn(`Updated ${result.successCount} tasks.`);
          }
        },
      });
  }

  async bulkUpdateStatus(
    selectedIds: Set<string>,
    status: string,
    todo: Todo | null,
    clearSelectionFn: () => void,
    notifyFn: (message: string) => void,
    updateTaskFn: (id: string, data: any, options?: any) => any
  ): Promise<void> {
    const selectedIdsArr = Array.from(selectedIds);
    if (selectedIdsArr.length === 0) return;

    const visibility = todo?.visibility || "private";

    const updatePromises = selectedIdsArr.map((id) =>
      firstValueFrom(
        this.bulkActionHelper.bulkUpdateStatus([{ id, status: "" }], status, (_id, _data) =>
          updateTaskFn(
            id,
            { status: status as TaskStatus },
            { visibility: visibility as string as Visibility }
          )
        )
      )
    );

    try {
      await Promise.all(updatePromises);
      clearSelectionFn();
      notifyFn(`${selectedIdsArr.length} task(s) updated`);
    } catch {
      this.notifyService.showError("Failed to update tasks");
    }
  }

  async bulkDelete(
    selectedIds: Set<string>,
    clearSelectionFn: () => void,
    notifyFn: (message: string) => void,
    deleteTaskFn: (id: string) => any
  ): Promise<void> {
    const selectedIdsArr = Array.from(selectedIds);
    if (selectedIdsArr.length === 0) return;

    const confirmed = await this.confirmDialogService.confirm({
      title: "Delete Tasks",
      message: `Are you sure you want to delete ${selectedIdsArr.length} task(s)?`,
      confirmText: "Delete",
    });
    if (!confirmed) return;

    this.bulkActionHelper
      .bulkDelete(
        selectedIdsArr.map((id) => ({ id })),
        (id) => deleteTaskFn(id)
      )
      .subscribe({
        next: (result) => {
          clearSelectionFn();
          if (result.errorCount > 0) {
            notifyFn(`Deleted ${result.successCount} tasks, ${result.errorCount} failed.`);
          } else {
            notifyFn(`Deleted ${result.successCount} tasks.`);
          }
        },
      });
  }

  async bulkArchive(
    selectedIds: Set<string>,
    listTasksFn: () => Task[],
    clearSelectionFn: () => void,
    notifyFn: (message: string) => void,
    loadInitialTasksFn: (forceRefresh: boolean) => void
  ): Promise<void> {
    const selectedIdsArr = Array.from(selectedIds);
    if (selectedIdsArr.length === 0) return;

    const allTasks = listTasksFn();
    const allSelected = allTasks.filter((t) => selectedIdsArr.includes(t.id));
    const allArchived = allSelected.every((t) => t.deleted_at);

    if (allArchived) {
      await this.bulkRestoreTasks(selectedIdsArr, clearSelectionFn, notifyFn, loadInitialTasksFn);
      return;
    }

    const confirmed = await this.confirmDialogService.confirm({
      title: "Archive Tasks",
      message: `Are you sure you want to archive ${selectedIdsArr.length} task(s)?`,
      confirmText: "Archive All",
      confirmClass: "bg-orange-600 hover:bg-orange-700",
    });
    if (!confirmed) return;

    let successCount = 0;
    let errorCount = 0;

    for (const taskId of selectedIdsArr) {
      const response = await this.adminService.toggleDeleteStatusLocal("tasks", taskId);
      if (response.status === ResponseStatus.SUCCESS) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    clearSelectionFn();
    if (errorCount > 0) {
      notifyFn(`Archived ${successCount} tasks, ${errorCount} failed.`);
    } else {
      notifyFn(`Archived ${successCount} tasks.`);
    }
    loadInitialTasksFn(true);
  }

  async bulkRestoreTasks(
    selectedIds: string[],
    clearSelectionFn: () => void,
    notifyFn: (message: string) => void,
    loadInitialTasksFn: (forceRefresh: boolean) => void
  ): Promise<void> {
    const confirmed = await this.confirmDialogService.confirm({
      title: "Restore Tasks",
      message: `Are you sure you want to restore ${selectedIds.length} task(s)?`,
      confirmText: "Restore All",
      confirmClass: "bg-green-600 hover:bg-green-700",
    });
    if (!confirmed) return;

    let successCount = 0;
    let errorCount = 0;

    for (const taskId of selectedIds) {
      const response = await this.adminService.toggleDeleteStatusLocal("tasks", taskId);
      if (response.status === ResponseStatus.SUCCESS) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    clearSelectionFn();
    if (errorCount > 0) {
      notifyFn(`Restored ${successCount} tasks, ${errorCount} failed.`);
    } else {
      notifyFn(`Restored ${successCount} tasks.`);
    }
    loadInitialTasksFn(true);
  }

  isAllSelectedArchivedTasks(selectedIds: Set<string>, listTasksFn: () => Task[]): boolean {
    const selectedIdsArr = Array.from(selectedIds);
    if (selectedIdsArr.length === 0) return false;
    const allTasks = listTasksFn();
    const allSelected = allTasks.filter((t) => selectedIdsArr.includes(t.id));
    return allSelected.length > 0 && allSelected.every((t) => t.deleted_at);
  }

  async onBulkAction(
    actionId: string,
    promptDialogFn: (options: any) => Promise<string | null>,
    bulkDeleteFn: () => Promise<void>,
    bulkUpdatePriorityFn: (priority: string) => void,
    bulkUpdateStatusFn: (status: string) => Promise<void>
  ): Promise<void> {
    if (actionId === "delete") {
      await bulkDeleteFn();
    } else {
      const val = await promptDialogFn({
        title: `Enter new ${actionId}`,
        message: `Enter value for ${actionId}:`,
        required: true,
        validateFn: (v: string) => {
          if (!v.trim()) return "Value is required";
          return null;
        },
      });
      if (val) {
        actionId === "priority" ? bulkUpdatePriorityFn(val) : await bulkUpdateStatusFn(val);
      }
    }
  }
}
