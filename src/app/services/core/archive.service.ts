import { Injectable, inject } from "@angular/core";
import { StorageService } from "@services/core/storage.service";

@Injectable({
  providedIn: "root",
})
export class ArchiveService {
  private storageService = inject(StorageService);

  archiveTodoWithCascade(todo_id?: string, isTeam: boolean = false): void {
    if (!todo_id) return;
    const todo = this.storageService.getById("todos", todo_id);
    if (!todo) return;

    const options = { isPrivate: !isTeam };

    this.storageService.updateItem(
      "todos",
      todo_id,
      { deleted_at: new Date().toISOString() },
      options
    );

    todo.tasks?.forEach((task) => {
      this.storageService.updateItem(
        "tasks",
        task.id,
        { deleted_at: new Date().toISOString() },
        options
      );

      task.subtasks?.forEach((subtask) => {
        this.storageService.updateItem(
          "subtasks",
          subtask.id,
          { deleted_at: new Date().toISOString() },
          options
        );

        subtask.comments?.forEach((comment) => {
          this.storageService.updateItem(
            "comments",
            comment.id,
            { deleted_at: new Date().toISOString() },
            options
          );
        });
      });

      task.comments?.forEach((comment) => {
        this.storageService.updateItem(
          "comments",
          comment.id,
          { deleted_at: new Date().toISOString() },
          options
        );
      });
    });

    this.storageService.clearChatsByTodo(todo_id);
  }
}
