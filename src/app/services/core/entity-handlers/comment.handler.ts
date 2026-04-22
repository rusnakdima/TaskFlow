import { WritableSignal } from "@angular/core";
import { EntityHandler } from "./entity-handler.base";
import { Todo } from "@models/todo.model";
import { Comment } from "@models/comment.model";

export class CommentHandler extends EntityHandler<Comment> {
  constructor(
    private privateSignal: WritableSignal<Todo[]>,
    private sharedSignal: WritableSignal<Todo[]>
  ) {
    super();
  }

  /**
   * Update a todo in both private and shared signals
   */
  private updateTodo(updater: (todo: Todo) => Todo, todo_id?: string | null): void {
    if (!todo_id) {
      // Update all todos
      this.updateAll(updater);
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
      const hasTodo = todos.some((todo) => todo.id === todo_id);
      if (!hasTodo) return todos;
      return todos.map((todo) => (todo.id === todo_id ? updater(todo) : todo));
    });
  }

  private updateAll(updater: (todo: Todo) => Todo): void {
    this.privateSignal.update((todos) => todos.map(updater));
    this.sharedSignal.update((todos) => todos.map(updater));
  }

  add(data: Comment): void {
    if (!data.id) return;

    if (data.task_id) {
      this.addCommentToEntity(data.task_id, data, "tasks");
    } else if (data.subtask_id) {
      this.addCommentToEntity(data.subtask_id, data, "subtasks");
    }
  }

  update(id: string, updates: Partial<Comment>, _resolvers?: Record<string, any>): void {
    this.updateTodo((todo) => ({
      ...todo,
      tasks: todo.tasks?.map((task) => ({
        ...task,
        comments: task.comments?.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        subtasks: task.subtasks?.map((subtask) => ({
          ...subtask,
          comments: subtask.comments?.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        })),
      })),
      updatedAt: new Date().toISOString(),
    }), null);
  }

remove(id: string): void {
    this.updateTodo((todo) => ({
      ...todo,
      tasks: todo.tasks?.map((task) => ({
        ...task,
        comments: task.comments?.filter((c) => c.id !== id),
        subtasks: task.subtasks?.map((subtask) => ({
          ...subtask,
          comments: subtask.comments?.filter((c) => c.id !== id),
        })),
      })),
      updatedAt: new Date().toISOString(),
    }), null);
  }

  getById(id: string): Comment | undefined {
    const todos = [...this.privateSignal(), ...this.sharedSignal()];
    for (const todo of todos) {
      for (const task of todo.tasks || []) {
        const comment = task.comments?.find((c) => c.id === id);
        if (comment) return comment;
        for (const subtask of task.subtasks || []) {
          const comment = subtask.comments?.find((c) => c.id === id);
          if (comment) return comment;
        }
      }
    }
    return undefined;
  }

  private addCommentToEntity(
    entityId: string,
    comment: Comment,
    entityType: "tasks" | "subtasks"
  ): void {
    const todoId = this.resolveTodoId(entityId, entityType);
    if (!todoId) return;

    this.updateTodo((todo) => {
      if (entityType === "tasks") {
        const updatedTasks = todo.tasks?.map((task) => {
          if (task.id !== entityId) return task;
          return {
            ...task,
            comments: [...(task.comments || []), comment],
          };
        });
        return { ...todo, tasks: updatedTasks || [], updatedAt: new Date().toISOString() };
      } else {
        const updatedTasks = todo.tasks?.map((task) => {
          const updatedSubtasks = task.subtasks?.map((subtask) => {
            if (subtask.id !== entityId) return subtask;
            return {
              ...subtask,
              comments: [...(subtask.comments || []), comment],
            };
          });
          return { ...task, subtasks: updatedSubtasks || [] };
        });
        return { ...todo, tasks: updatedTasks || [], updatedAt: new Date().toISOString() };
      }
    }, todoId);
  }

  private resolveTodoId(entityId: string, entityType: "tasks" | "subtasks"): string | null {
    const todos = [...this.privateSignal(), ...this.sharedSignal()];

    for (const todo of todos) {
      if (entityType === "tasks" && todo.tasks?.some((t) => t.id === entityId)) {
        return todo.id;
      }

      if (entityType === "subtasks") {
        for (const task of todo.tasks || []) {
          if (task.subtasks?.some((s) => s.id === entityId)) {
            return todo.id;
          }
        }
      }
    }
    return null;
  }
}
