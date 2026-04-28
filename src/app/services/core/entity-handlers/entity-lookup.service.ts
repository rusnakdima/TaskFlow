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

export class EntityLookupService {
  constructor(
    private privateSignal: WritableSignal<Todo[]>,
    private sharedSignal: WritableSignal<Todo[]>,
    private entityType: "tasks" | "subtasks",
    private storageService?: {
      getTodoIdForTask: (taskId: string) => string | null;
      getTaskIdForSubtask: (subtaskId: string) => string | null;
    }
  ) {}

  lookupTodoId(task_id?: string): string | null {
    if (this.storageService && task_id) {
      return this.storageService.getTodoIdForTask(task_id);
    }
    const todos = [...this.privateSignal(), ...this.sharedSignal()];
    for (const todo of todos) {
      if (todo.tasks?.some((t: Task) => t.id === task_id)) {
        return todo.id;
      }
    }
    return null;
  }

  lookupTaskId(subtask_id?: string): string | null {
    if (this.storageService && subtask_id) {
      return this.storageService.getTaskIdForSubtask(subtask_id);
    }
    const todos = [...this.privateSignal(), ...this.sharedSignal()];
    for (const todo of todos) {
      for (const task of todo.tasks || []) {
        if (task.subtasks?.some((s: Subtask) => s.id === subtask_id)) {
          return task.id;
        }
      }
    }
    return null;
  }

  lookupEntityId(id: string): string | null {
    if (this.entityType === "tasks") {
      return this.lookupTodoId(id);
    } else {
      return this.lookupTaskId(id);
    }
  }

  getEntityById(id: string): NestedEntity | undefined {
    for (const todo of this.privateSignal()) {
      const found = this.findEntityInTodo(todo, id);
      if (found) return found;
    }
    for (const todo of this.sharedSignal()) {
      const found = this.findEntityInTodo(todo, id);
      if (found) return found;
    }
    return undefined;
  }

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

  private findEntityInTodo(todo: Todo, id: string): NestedEntity | undefined {
    if (this.entityType === "tasks") {
      return todo.tasks?.find((t) => t.id === id) as NestedEntity;
    } else {
      for (const task of todo.tasks || []) {
        const found = task.subtasks?.find((s) => s.id === id) as NestedEntity;
        if (found) return found;
      }
    }
    return undefined;
  }
}
