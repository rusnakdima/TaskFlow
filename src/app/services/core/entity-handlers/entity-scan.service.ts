import { WritableSignal } from "@angular/core";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Todo } from "@models/todo.model";

type NestedEntity = Task | Subtask;

export interface ScanResult {
  found: boolean;
  todoId: string | null;
  taskId: string | null;
}

export class EntityScanService {
  constructor(
    private privateSignal: WritableSignal<Todo[]>,
    private sharedSignal: WritableSignal<Todo[]>,
    private entityType: "tasks" | "subtasks"
  ) {}

  scanForEntityInSignal(todos: Todo[], id: string): ScanResult {
    for (const todo of todos) {
      if (this.entityType === "tasks" && todo.tasks?.some((t) => t.id === id)) {
        return { found: true, todoId: todo.id, taskId: null };
      }
      if (this.entityType === "subtasks") {
        for (const task of todo.tasks || []) {
          if (task.subtasks?.some((s) => s.id === id)) {
            return { found: true, todoId: todo.id, taskId: task.id };
          }
        }
      }
    }
    return { found: false, todoId: null, taskId: null };
  }
}
