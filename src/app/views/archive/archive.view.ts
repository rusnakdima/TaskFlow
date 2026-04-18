/* sys lib */
import { Component, OnInit, signal, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatMenuModule } from "@angular/material/menu";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatInputModule } from "@angular/material/input";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatDatepickerModule } from "@angular/material/datepicker";
import { MatNativeDateModule } from "@angular/material/core";

/* services */
import { DataLoaderService } from "@services/data/data-loader.service";
import { StorageService } from "@services/core/storage.service";

/* helpers */
import { BulkActionHelper } from "@helpers/bulk-action.helper";

/* base */
import { BaseAdminView } from "@views/base-admin.view";

/* components */
import { AdminDataTableComponent } from "@components/admin-records/admin-data-table.component";
import { BulkActionsComponent } from "@components/bulk-actions/bulk-actions.component";
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

/* models */
import { ResponseStatus } from "@models/response.model";
import { ArchiveDataMap, ArchiveRecord } from "@models/archive.model";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
import { from } from "rxjs";

const bulkActionHelper = new BulkActionHelper();

@Component({
  selector: "app-archive-view",
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatCardModule,
    MatButtonModule,
    MatChipsModule,
    MatMenuModule,
    MatCheckboxModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    FormsModule,
    AdminDataTableComponent,
    BulkActionsComponent,
    CheckboxComponent,
  ],
  templateUrl: "./archive.view.html",
})
export class ArchiveView extends BaseAdminView implements OnInit {
  private dataSyncService = inject(DataLoaderService);
  private storageService = inject(StorageService);

  archiveData = signal<ArchiveDataMap>({});

  ngOnInit(): void {
    this.loadArchiveData();

    this.shortcutService.refresh$.subscribe(() => {
      this.loadArchiveData();
      this.notifyService.showSuccess("Data refreshed");
    });
  }

  loadArchiveData() {
    this.loading.set(true);

    this.adminService.getAllDataForArchive().subscribe({
      next: (response) => {
        const data = response.data as ArchiveDataMap;

        const allTodos = data["todos"] || [];
        const privateTodos = allTodos.filter((todo: Todo) => todo.visibility === "private");

        const archiveData: ArchiveDataMap = {
          todos: privateTodos,
          tasks: data["tasks"] || [],
          subtasks: data["subtasks"] || [],
          comments: data["comments"] || [],
          categories: data["categories"] || [],
          chats: data["chats"] || [],
        };

        this.archiveData.set(archiveData);

        this.dataTypes.forEach((type) => {
          const tableData = archiveData[type.id];
          type.count = tableData ? tableData.length : 0;
        });

        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  getCurrentData(): ArchiveRecord[] {
    return this.buildFilteredData(this.archiveData()[this.selectedType()] || []) as ArchiveRecord[];
  }

  async deleteRecord(record: ArchiveRecord) {
    const typeSingular = this.selectedType().slice(0, -1);
    const table = this.selectedType();

    const confirmMessage = `WARNING: This will permanently delete this ${typeSingular} and ALL related data (tasks, subtasks, comments, chats). This action cannot be undone. Are you sure?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const response = await this.adminService.permanentlyDeleteRecordLocal(table, record.id);

      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Record permanently deleted from local database");
        this.adminStorageService.removeRecordWithCascade(table, record.id);
        this.storageService.removeRecordWithCascade(table, record.id);

        // In-place update without full reload
        this.archiveData.update((data) =>
          bulkActionHelper.removeRecordWithCascade(data, table, record.id)
        );

        // Update counts
        this.dataTypes.forEach((type) => {
          const tableData = this.archiveData()[type.id];
          type.count = tableData ? tableData.length : 0;
        });
      } else {
        this.notifyService.showError(response.message || "Failed to delete record");
      }
    } catch (error) {
      this.notifyService.showError("Error deleting record: " + error);
    }
  }

  async toggleDeleteStatus(record: ArchiveRecord) {
    try {
      const response = await this.adminService.toggleDeleteStatusLocal(
        this.selectedType(),
        record.id
      );

      if (response.status === ResponseStatus.SUCCESS) {
        this.notifyService.showSuccess("Record status updated");
        const deleted_at = response.data === true;
        if (this.selectedType() === "todos") {
          if (deleted_at) {
            this.storageService.removeTodoWithCascade(record.id);
          } else {
            // Restore: re-fetch from backend and restore in-place
            this.adminService.getAllDataForArchive().subscribe({
              next: (archiveResponse) => {
                const data = archiveResponse.data as ArchiveDataMap;
                const restoredTodo = data["todos"]?.find((t: Todo) => t.id === record.id);
                if (restoredTodo) {
                  const taskIds = restoredTodo.tasks?.map((t: Task) => t.id) || [];
                  const subtaskIds =
                    restoredTodo.tasks?.flatMap(
                      (t: Task) => t.subtasks?.map((s: Subtask) => s.id) || []
                    ) || [];

                  const relatedTasks =
                    data["tasks"]?.filter((t: Task) => taskIds.includes(t.id)) || [];
                  const relatedSubtasks =
                    data["subtasks"]?.filter((s: Subtask) => subtaskIds.includes(s.id)) || [];
                  const relatedComments =
                    data["comments"]?.filter(
                      (c: Comment) =>
                        c.taskId === record.id ||
                        taskIds.includes(c.taskId) ||
                        subtaskIds.includes(c.subtaskId)
                    ) || [];
                  const relatedChats =
                    data["chats"]?.filter((c: Chat) => c.todoId === record.id) || [];

                  this.adminStorageService.restoreTodoWithCascade({
                    todo: restoredTodo,
                    tasks: relatedTasks,
                    subtasks: relatedSubtasks,
                    comments: relatedComments,
                    chats: relatedChats,
                  });

                  this.storageService.restoreTodoWithCascade({
                    todo: restoredTodo,
                    tasks: relatedTasks,
                    subtasks: relatedSubtasks,
                    comments: relatedComments,
                  });
                }
              },
            });
          }
        } else {
          this.storageService.updateItem(this.selectedType() as any, record.id, { deleted_at });
        }
      } else {
        this.notifyService.showError(response.message || "Failed to update record status");
      }
    } catch (error: unknown) {
      const errorMsg =
        error instanceof Error ? error.message : (typeof error === "object" ? JSON.stringify(error) : String(error));
      this.notifyService.showError("Error updating record status: " + errorMsg);
    }
  }

  async toggleArchiveStatus(): Promise<void> {
    const count = this.selectedRecords().size;
    if (count === 0) return;

    const typeSingular = this.selectedType().slice(0, -1).toLowerCase();
    const plural = count > 1 ? "records" : "record";

    if (
      !confirm(
        `Are you sure you want to toggle archive status for ${count} ${typeSingular} ${plural}?`
      )
    ) {
      return;
    }

    const table = this.selectedType();
    const currentData = this.getCurrentData();
    const selectedItems = currentData.filter((item) => this.isSelected(item.id));

    this.bulkActionService
      .bulkDelete(selectedItems, (id: string) =>
        from(this.adminService.toggleDeleteStatusLocal(table, id))
      )
      .subscribe((result) => {
        this.clearSelection();
        if (result.successCount > 0) {
          selectedItems.forEach((item) => {
            const newdeleted_at = !item.deleted_at;

            this.adminStorageService.updateRecordDeleteStatusWithCascade(
              table,
              item.id,
              newdeleted_at
            );

            if (table === "todos") {
              if (newdeleted_at) {
                this.storageService.removeTodoWithCascade(item.id);
              } else {
                // Restore: re-fetch from backend and restore in-place
                this.adminService.getAllDataForArchive().subscribe({
                  next: (archiveResponse) => {
                    const data = archiveResponse.data as ArchiveDataMap;
                    const restoredTodo = data["todos"]?.find((t: Todo) => t.id === item.id);
                    if (restoredTodo) {
                      const taskIds = restoredTodo.tasks?.map((t: Task) => t.id) || [];
                      const subtaskIds =
                        restoredTodo.tasks?.flatMap(
                          (t: Task) => t.subtasks?.map((s: Subtask) => s.id) || []
                        ) || [];

                      const relatedTasks =
                        data["tasks"]?.filter((t: Task) => taskIds.includes(t.id)) || [];
                      const relatedSubtasks =
                        data["subtasks"]?.filter((s: Subtask) => subtaskIds.includes(s.id)) || [];
                      const relatedComments =
                        data["comments"]?.filter(
                          (c: Comment) =>
                            c.taskId === item.id ||
                            taskIds.includes(c.taskId) ||
                            subtaskIds.includes(c.subtaskId)
                        ) || [];
                      const relatedChats =
                        data["chats"]?.filter((c: Chat) => c.todoId === item.id) || [];

                      this.adminStorageService.restoreTodoWithCascade({
                        todo: restoredTodo,
                        tasks: relatedTasks,
                        subtasks: relatedSubtasks,
                        comments: relatedComments,
                        chats: relatedChats,
                      });

                      this.storageService.restoreTodoWithCascade({
                        todo: restoredTodo,
                        tasks: relatedTasks,
                        subtasks: relatedSubtasks,
                        comments: relatedComments,
                      });
                    }
                  },
                });
              }
            } else {
              this.storageService.updateItem(table as any, item.id, { deleted_at: newdeleted_at });
            }
          });

          this.notifyService.showSuccess(
            `${result.successCount} ${result.successCount === 1 ? "record" : "records"} status toggled`
          );
        }

        if (result.errorCount > 0) {
          this.notifyService.showError(
            `Failed to toggle ${result.errorCount} ${result.errorCount === 1 ? "record" : "records"}`
          );
        }
      });
  }

  async deleteSelected(): Promise<void> {
    const count = this.selectedRecords().size;
    if (count === 0) return;

    const typeSingular = this.selectedType().slice(0, -1).toLowerCase();
    const plural = count > 1 ? "records" : "record";
    const table = this.selectedType();

    const confirmMessage = `WARNING: This will permanently delete ${count} ${typeSingular} ${plural} and ALL related data (tasks, subtasks, comments, chats). This action cannot be undone. Are you sure?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    const currentData = this.getCurrentData();
    const selectedItems = currentData.filter((item) => this.isSelected(item.id));

    const deleteObservable = this.bulkActionService.bulkDelete(selectedItems, (id: string) =>
      from(this.adminService.permanentlyDeleteRecordLocal(table, id))
    );

    deleteObservable.subscribe((result) => {
      if (result.successCount > 0) {
        this.archiveData.update((data) => {
          const updated = { ...data };
          selectedItems.forEach((item) => {
            if (updated[table]) {
              updated[table] = updated[table].filter((record: any) => record.id !== item.id);
            }

            if (table === "todos") {
              if (updated["tasks"]) {
                const todoTasks = updated["tasks"].filter((t: any) => t.todoId === item.id);
                const todoTaskIds = todoTasks.map((t: any) => t.id);
                updated["tasks"] = updated["tasks"].filter((t: any) => t.todoId !== item.id);

                if (updated["subtasks"]) {
                  updated["subtasks"] = updated["subtasks"].filter(
                    (s: any) => !todoTaskIds.includes(s.taskId)
                  );
                }
              }
              if (updated["comments"]) {
                updated["comments"] = updated["comments"].filter((c: any) => c.todoId !== item.id);
              }
              if (updated["chats"]) {
                updated["chats"] = updated["chats"].filter((c: any) => c.todoId !== item.id);
              }
            } else if (table === "tasks") {
              if (updated["subtasks"]) {
                updated["subtasks"] = updated["subtasks"].filter((s: any) => s.taskId !== item.id);
              }
              if (updated["comments"]) {
                updated["comments"] = updated["comments"].filter((c: any) => c.taskId !== item.id);
              }
            } else if (table === "subtasks") {
              if (updated["comments"]) {
                updated["comments"] = updated["comments"].filter(
                  (c: any) => c.subtaskId !== item.id
                );
              }
            }
          });
          return updated;
        });

        selectedItems.forEach((item) => {
          this.adminStorageService.removeRecordWithCascade(table, item.id);
          this.storageService.removeRecordWithCascade(table, item.id);
        });

        this.clearSelection();
        this.notifyService.showSuccess(
          `${result.successCount} ${result.successCount === 1 ? "record" : "records"} permanently deleted`
        );
        this.dataTypes.forEach((type) => {
          const tableData = this.archiveData()[type.id];
          type.count = tableData ? tableData.length : 0;
        });
      }

      if (result.errorCount > 0) {
        this.notifyService.showError(
          `Failed to delete ${result.errorCount} ${result.errorCount === 1 ? "record" : "records"}`
        );
      }
    });
  }
}
