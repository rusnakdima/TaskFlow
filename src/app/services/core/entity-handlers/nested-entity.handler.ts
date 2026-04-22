import { WritableSignal } from "@angular/core";
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
    private entityType: "tasks" | "subtasks"
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
    this.updateSignal(this.privateSignal, updater, todo_id);
    this.updateSignal(this.sharedSignal, updater, todo_id);
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

    // For subtasks, resolve taskId to todoId
    let todo_id: string | null = entityId;
    if (this.entityType === "subtasks") {
      todo_id = entityId ? this.lookupTodoId(entityId) : null;
    }

    // If we still can't locate the parent, scan all todos and apply the update wherever
    // the entity is found (M-2: handles the case where the signal hasn't propagated yet)
    if (!todo_id) {
      const todos = [...this.privateSignal(), ...this.sharedSignal()];
      for (const todo of todos) {
        if (this.entityType === "tasks" && todo.tasks?.some((t) => t.id === id)) {
          this.updateSignal(this.privateSignal, (t) => ({
            ...t,
            tasks: t.tasks?.map((task) => (task.id === id ? { ...task, ...updates } : task)) ?? [],
            updatedAt: new Date().toISOString(),
          }), todo.id);
          this.updateSignal(this.sharedSignal, (t) => ({
            ...t,
            tasks: t.tasks?.map((task) => (task.id === id ? { ...task, ...updates } : task)) ?? [],
            updatedAt: new Date().toISOString(),
          }), todo.id);
          return;
        }
        if (this.entityType === "subtasks") {
          for (const task of todo.tasks || []) {
            if (task.subtasks?.some((s) => s.id === id)) {
              this.updateSignal(this.privateSignal, (t) => ({
                ...t,
                tasks:
                  t.tasks?.map((tk) =>
                    tk.id === task.id
                      ? {
                          ...tk,
                          subtasks: tk.subtasks?.map((s) =>
                            s.id === id ? { ...s, ...updates } : s
                          ),
                        }
                      : tk
                  ) ?? [],
                updatedAt: new Date().toISOString(),
              }), todo.id);
              this.updateSignal(this.sharedSignal, (t) => ({
                ...t,
                tasks:
                  t.tasks?.map((tk) =>
                    tk.id === task.id
                      ? {
                          ...tk,
                          subtasks: tk.subtasks?.map((s) =>
                            s.id === id ? { ...s, ...updates } : s
                          ),
                        }
                      : tk
                  ) ?? [],
                updatedAt: new Date().toISOString(),
              }));
              return;
            }
          }
        }
      }
      return;
    }

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
    }, todo_id);
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
    const todos = [...this.privateSignal(), ...this.sharedSignal()];
    const uniqueTodos = new Map(todos.map((t) => [t.id, t]));

    for (const todo of uniqueTodos.values()) {
      if (this.entityType === "tasks") {
        const entity = todo.tasks?.find((t: Task) => t.id === id) as T;
        if (entity) return entity;
      } else {
        for (const task of todo.tasks || []) {
          const entity = task.subtasks?.find((s: Subtask) => s.id === id) as T;
          if (entity) return entity;
        }
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
    const todos = [...this.privateSignal(), ...this.sharedSignal()];
    for (const todo of todos) {
      if (todo.tasks?.some((t: Task) => t.id === task_id)) {
        return todo.id;
      }
    }
    return null;
  }

  private lookupTaskId(subtask_id?: string): string | null {
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
