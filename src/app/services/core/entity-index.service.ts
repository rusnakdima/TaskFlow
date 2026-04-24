/* sys lib */
import { Injectable, signal } from "@angular/core";
/* models */
import { Todo } from "@models/todo.model";

@Injectable({ providedIn: "root" })
export class EntityIndexService {
  private readonly taskToTodoIndex = new Map<string, string>();
  private readonly subtaskToTaskIndex = new Map<string, string>();

  getTodoIdForTask(taskId: string): string | null {
    return this.taskToTodoIndex.get(taskId) ?? null;
  }

  getTodoIdForSubtask(subtaskId: string): string | null {
    const taskId = this.subtaskToTaskIndex.get(subtaskId);
    return taskId ? (this.taskToTodoIndex.get(taskId) ?? null) : null;
  }

  getTaskIdForSubtask(subtaskId: string): string | null {
    return this.subtaskToTaskIndex.get(subtaskId) ?? null;
  }

  setTaskToTodoIndex(taskId: string, todoId: string): void {
    this.taskToTodoIndex.set(taskId, todoId);
  }

  setSubtaskToTaskIndex(subtaskId: string, taskId: string): void {
    this.subtaskToTaskIndex.set(subtaskId, taskId);
  }

  deleteTaskIndex(taskId: string): void {
    this.taskToTodoIndex.delete(taskId);
  }

  deleteSubtaskIndex(subtaskId: string): void {
    this.subtaskToTaskIndex.delete(subtaskId);
  }

  rebuildIndexes(privateTodos: Todo[], sharedTodos: Todo[]): void {
    this.taskToTodoIndex.clear();
    this.subtaskToTaskIndex.clear();
    const allTodos = [...privateTodos, ...sharedTodos];
    for (const todo of allTodos) {
      for (const task of todo.tasks || []) {
        if (task.id) {
          this.taskToTodoIndex.set(task.id, todo.id);
          for (const subtask of task.subtasks || []) {
            if (subtask.id) {
              this.subtaskToTaskIndex.set(subtask.id, task.id);
            }
          }
        }
      }
    }
  }

  clearIndexes(): void {
    this.taskToTodoIndex.clear();
    this.subtaskToTaskIndex.clear();
  }
}
