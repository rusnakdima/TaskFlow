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
  private updateTodo(todoId: string | null, updater: (todo: Todo) => Todo): void {
    if (!todoId) {
      // Update all todos
      this.updateAll(updater);
      return;
    }
    this.updateSignal(this.privateSignal, todoId, updater);
    this.updateSignal(this.sharedSignal, todoId, updater);
  }

  private updateSignal(
    signal: WritableSignal<Todo[]>,
    todoId: string,
    updater: (todo: Todo) => Todo
  ): void {
    signal.update((todos) => {
      const hasTodo = todos.some((todo) => todo.id === todoId);
      if (!hasTodo) return todos;
      return todos.map((todo) => (todo.id === todoId ? updater(todo) : todo));
    });
  }

  private updateAll(updater: (todo: Todo) => Todo): void {
    this.privateSignal.update((todos) => todos.map(updater));
    this.sharedSignal.update((todos) => todos.map(updater));
  }

  add(data: Comment): void {
    if (!data.id) return;

    if (data.taskId) {
      this.addCommentToEntity(data.taskId, data, "tasks");
    } else if (data.subtaskId) {
      this.addCommentToEntity(data.subtaskId, data, "subtasks");
    }
  }

  update(id: string, updates: Partial<Comment>): void {
    this.updateTodo(null, (todo) => ({
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
    }));
  }

  remove(id: string): void {
    this.updateTodo(null, (todo) => ({
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
    }));
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

    this.updateTodo(todoId, (todo) => {
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
    });
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
