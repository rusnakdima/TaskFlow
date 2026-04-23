import { WritableSignal, Signal } from "@angular/core";
import { EntityHandler } from "./entity-handler.base";
import { AddOperation, UpdateOperation, RemoveOperation } from "../operations/operation.interface";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Todo } from "@models/todo.model";

type NestedEntity = Task | Subtask;

export class NestedEntityHandler<T extends NestedEntity> extends EntityHandler<T> {
  constructor(
    private privateSignal: WritableSignal<Todo[]>,
    private sharedSignal: WritableSignal<Todo[]>,
    private entityType: "tasks" | "subtasks",
    private storageService?: {
      getTodoIdForTask: (taskId: string) => string | null;
      getTaskIdForSubtask: (subtaskId: string) => string | null;
    }
  ) {
    super();
  }

  /**
   * Update a todo in both private and shared signals
   */
  private updateTodo(updater: (todo: Todo) => Todo, todo_id?: string): void {
    if (!todo_id) {
      this.updateSignal(this.privateSignal, updater);
      this.updateSignal(this.sharedSignal, updater);
      return;
    }
    const privateHasTodo = this.privateSignal().some((t) => t.id === todo_id);
    const sharedHasTodo = this.sharedSignal().some((t) => t.id === todo_id);

    if (privateHasTodo) {
      this.updateSignal(this.privateSignal, updater, todo_id);
    }
    if (sharedHasTodo) {
      this.updateSignal(this.sharedSignal, updater, todo_id);
    }
  }

  private updateSignal(
    signal: WritableSignal<Todo[]>,
    updater: (todo: Todo) => Todo,
    todo_id?: string
  ): void {
    signal.update((todos) => {
      if (!todo_id) return todos;
      const hasTodo = todos.some((todo) => todo.id === todo_id);
      if (!hasTodo) return todos;
      return todos.map((todo) => (todo.id === todo_id ? updater(todo) : todo));
    });
  }

  add(data: T): void {
    const parentId = this.getParentId(data);
    if (!parentId) return;

    // For subtasks, resolve taskId to todoId
    let todo_id: string | null = parentId;
    if (this.entityType === "subtasks") {
      todo_id = this.lookupTodoId(parentId);
      if (!todo_id) {
        return;
      }
    }

    this.updateTodo((todo) => {
      if (this.entityType === "tasks") {
        const operation = new AddOperation<Task>(data as Task);
        return {
          ...todo,
          tasks: operation.execute(todo.tasks || []),
          updatedAt: new Date().toISOString(),
        };
      } else {
        // For subtasks, find the task and add to its subtasks
        const updatedTasks = todo.tasks?.map((task) => {
          if (task.id !== parentId) return task;
          const operation = new AddOperation<Subtask>(data as Subtask);
          return { ...task, subtasks: operation.execute(task.subtasks || []) };
        });
        return { ...todo, tasks: updatedTasks || [], updatedAt: new Date().toISOString() };
      }
    }, todo_id);
  }

  update(id: string, updates: Partial<T>, _resolvers?: Record<string, any>): void {
    let entityId: string | null =
      this.entityType === "tasks"
        ? (updates as any).todo_id || this.lookupTodoId(id)
        : (updates as any).task_id || this.lookupTaskId(id);

    let todo_id: string | null = entityId;
    if (this.entityType === "subtasks") {
      todo_id = entityId ? this.lookupTodoId(entityId) : null;
    }

    if (!todo_id) {
      this.applyUpdateByScanning(id, updates);
      return;
    }

    this.updateTodoAtId(id, updates, todo_id, entityId);
  }

  private applyUpdateByScanning(id: string, updates: Partial<T>): void {
    const privateResult = this.scanForEntityInSignal(this.privateSignal(), id);
    if (privateResult.found && privateResult.todoId) {
      this.applyUpdateToSignal(
        this.privateSignal,
        id,
        updates,
        privateResult.todoId,
        privateResult.taskId || undefined
      );
    }

    const sharedResult = this.scanForEntityInSignal(this.sharedSignal(), id);
    if (sharedResult.found && sharedResult.todoId) {
      this.applyUpdateToSignal(
        this.sharedSignal,
        id,
        updates,
        sharedResult.todoId,
        sharedResult.taskId || undefined
      );
    }
  }

  private scanForEntityInSignal(
    todos: Todo[],
    id: string
  ): { found: boolean; todoId: string | null; taskId: string | null } {
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

  private applyUpdateToSignal(
    signal: WritableSignal<Todo[]>,
    id: string,
    updates: Partial<T>,
    todoId: string,
    taskId?: string
  ): void {
    this.updateSignal(
      signal,
      (t) => ({
        ...t,
        tasks:
          this.entityType === "tasks"
            ? (t.tasks?.map((task) => (task.id === id ? { ...task, ...updates } : task)) ?? [])
            : (t.tasks?.map((tk) =>
                tk.id === taskId
                  ? {
                      ...tk,
                      subtasks: tk.subtasks?.map((s) => (s.id === id ? { ...s, ...updates } : s)),
                    }
                  : tk
              ) ?? []),
        updatedAt: new Date().toISOString(),
      }),
      todoId
    );
  }

  private updateTodoAtId(
    id: string,
    updates: Partial<T>,
    todoId: string,
    entityId: string | null
  ): void {
    this.updateTodo((todo) => {
      if (this.entityType === "tasks") {
        const operation = new UpdateOperation<Task>(id, updates);
        return {
          ...todo,
          tasks: operation.execute(todo.tasks || []),
          updatedAt: new Date().toISOString(),
        };
      } else {
        const updatedTasks = todo.tasks?.map((task) => {
          if (task.id !== entityId) return task;
          const operation = new UpdateOperation<Subtask>(id, updates);
          return { ...task, subtasks: operation.execute(task.subtasks || []) };
        });
        return { ...todo, tasks: updatedTasks || [], updatedAt: new Date().toISOString() };
      }
    }, todoId);
  }

  remove(id: string, parentId?: string): void {
    const entityId = parentId || this.lookupEntityId(id);
    if (!entityId) return;

    // For subtasks, resolve taskId to todoId
    let todo_id: string | null = entityId;
    if (this.entityType === "subtasks") {
      todo_id = this.lookupTodoId(entityId);
      if (!todo_id) {
        return;
      }
    }

    this.updateTodo((todo) => {
      if (this.entityType === "tasks") {
        const operation = new RemoveOperation<Task>(id);
        return {
          ...todo,
          tasks: operation.execute(todo.tasks || []),
          updatedAt: new Date().toISOString(),
        };
      } else {
        const updatedTasks = todo.tasks?.map((task) => {
          if (task.id !== entityId) return task;
          const operation = new RemoveOperation<Subtask>(id);
          return { ...task, subtasks: operation.execute(task.subtasks || []) };
        });
        return { ...todo, tasks: updatedTasks || [], updatedAt: new Date().toISOString() };
      }
    }, todo_id);
  }

  getById(id: string): T | undefined {
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

  private findEntityInTodo(todo: Todo, id: string): T | undefined {
    if (this.entityType === "tasks") {
      return todo.tasks?.find((t) => t.id === id) as T;
    } else {
      for (const task of todo.tasks || []) {
        const found = task.subtasks?.find((s) => s.id === id) as T;
        if (found) return found;
      }
    }
    return undefined;
  }

  private getParentId(data: T): string | null {
    if (this.entityType === "tasks") {
      return (data as any).todo_id || null;
    } else {
      return (data as any).task_id || null;
    }
  }

  private lookupTodoId(task_id?: string): string | null {
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

  private lookupTaskId(subtask_id?: string): string | null {
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

  private lookupEntityId(id: string): string | null {
    if (this.entityType === "tasks") {
      return this.lookupTodoId(id);
    } else {
      return this.lookupTaskId(id);
    }
  }
}
