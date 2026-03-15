import { WritableSignal } from "@angular/core";
import { EntityHandler } from "./entity-handler.base";
import { TodoUpdater } from "../todo-updater";
import { Todo } from "@models/todo.model";
import { Comment } from "@models/comment.model";

export class CommentHandler extends EntityHandler<Comment> {
  private todoUpdater: TodoUpdater;

  constructor(
    private privateSignal: WritableSignal<Todo[]>,
    private sharedSignal: WritableSignal<Todo[]>
  ) {
    super();
    this.todoUpdater = new TodoUpdater(privateSignal, sharedSignal);
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
    this.remove(id);
  }

  remove(id: string): void {
    this.todoUpdater.update(null, (todo) => ({
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

    this.todoUpdater.update(todoId, (todo) => {
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
