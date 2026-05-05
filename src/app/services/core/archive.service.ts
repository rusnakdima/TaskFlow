import { Injectable, inject } from "@angular/core";
import { DataService } from "@services/core/data.service";

@Injectable({
  providedIn: "root",
})
export class ArchiveService {
  private dataService = inject(DataService);

  archiveTodoWithCascade(todo_id?: string, isTeam: boolean = false): void {
    if (!todo_id) return;
    const todo = this.dataService.getTodo(todo_id);
    if (!todo) return;

    const options = { isPrivate: !isTeam };
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

    this.dataService.batchUpdate(itemsToUpdate, options);
    this.dataService.clearChatsByTodo(todo_id);
  }
}
