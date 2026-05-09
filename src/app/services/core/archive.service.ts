import { Injectable, inject } from "@angular/core";
import { StorageService } from "@services/storage.service";

@Injectable({
  providedIn: "root",
})
export class ArchiveService {
  private storageService = inject(StorageService);

  archiveTodoWithCascade(todo_id?: string, isTeam: boolean = false): void {
    if (!todo_id) return;
    const todo = this.storageService.todoMap().get(todo_id);
    if (!todo) return;

    const deletedAt = new Date().toISOString();
    const itemsToUpdate: { id: string; updates: Partial<any> }[] = [
      { id: todo_id, updates: { deleted_at: deletedAt } },
    ];

    todo.tasks?.forEach((task) => {
      itemsToUpdate.push({ id: task.id, updates: { deleted_at: deletedAt } });

      task.subtasks?.forEach((subtask) => {
        itemsToUpdate.push({ id: subtask.id, updates: { deleted_at: deletedAt } });
        subtask.comments?.forEach((comment) => {
          itemsToUpdate.push({ id: comment.id, updates: { deleted_at: deletedAt } });
        });
      });

      task.comments?.forEach((comment) => {
        itemsToUpdate.push({ id: comment.id, updates: { deleted_at: deletedAt } });
      });
    });

    itemsToUpdate.forEach((item) =>
      this.storageService.modify("todos", "update", { id: item.id, ...item.updates })
    );
    this.storageService.clearChatsByTodo(todo_id);
  }
}
