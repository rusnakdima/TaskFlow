/* sys lib */
import { Injectable, signal } from "@angular/core";
/* models */
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
import { TodoHandler } from "./entity-handlers/todo.handler";
import { NestedEntityHandler } from "./entity-handlers/nested-entity.handler";
import { CommentHandler } from "./entity-handlers/comment.handler";
import { ChatHandler } from "./entity-handlers/chat.handler";
import { CategoryHandler } from "./entity-handlers/category.handler";
import { Category } from "@models/category.model";

@Injectable({ providedIn: "root" })
export class StorageCascadeService {
  private readonly privateTodosSignal = signal<Todo[]>([]);
  private readonly sharedTodosSignal = signal<Todo[]>([]);
  private readonly categoriesSignal = signal<Category[]>([]);

  private readonly handlers = {
    todos: new TodoHandler(this.privateTodosSignal, this.sharedTodosSignal),
    tasks: new NestedEntityHandler<Task>(this.privateTodosSignal, this.sharedTodosSignal, "tasks", {
      getTodoIdForTask: () => null,
      getTaskIdForSubtask: () => null,
    }),
    subtasks: new NestedEntityHandler<Subtask>(
      this.privateTodosSignal,
      this.sharedTodosSignal,
      "subtasks",
      {
        getTodoIdForTask: () => null,
        getTaskIdForSubtask: () => null,
      }
    ),
    comments: new CommentHandler(this.privateTodosSignal, this.sharedTodosSignal),
    chats: new ChatHandler(signal<Map<string, Chat[]>>(new Map())),
    categories: new CategoryHandler(this.categoriesSignal),
  };

  setPrivateTodos(todos: Todo[]): void {
    this.privateTodosSignal.set(todos);
  }

  setSharedTodos(todos: Todo[]): void {
    this.sharedTodosSignal.set(todos);
  }

  setCategories(categories: Category[]): void {
    this.categoriesSignal.set(categories);
  }

  removeTodoWithCascade(todo_id?: string, getByIdFn?: (type: string, id: string) => any): void {
    if (!todo_id) return;
    const todo = getByIdFn ? getByIdFn("todos", todo_id) : null;
    if (!todo) return;

    const handler = this.handlers.todos as TodoHandler;
    const allTodos = [...this.privateTodosSignal(), ...this.sharedTodosSignal()];
    handler.removeWithCascade(todo_id, allTodos);
  }

  removeRecordWithCascade(
    table: string,
    id: string,
    getTasksFn?: () => Task[],
    getTodosFn?: () => Todo[]
  ): void {
    if (table === "todos") {
      this.removeTodoWithCascade(id);
    } else if (table === "tasks") {
      const taskHandler = this.handlers.tasks as NestedEntityHandler<Task>;
      const todoId = getTodosFn?.()?.find((t) => t.tasks?.some((task) => task.id === id))?.id;
      taskHandler.remove(id, todoId);
    } else if (table === "subtasks") {
      const subtaskHandler = this.handlers.subtasks as NestedEntityHandler<Subtask>;
      const taskId = getTasksFn?.()?.find((t) => t.subtasks?.some((s) => s.id === id))?.id;
      subtaskHandler.remove(id, taskId);
    } else if (table === "comments") {
      this.handlers.comments?.remove(id);
    } else if (table === "chats") {
      this.handlers.chats?.remove(id);
    } else if (table === "categories") {
      this.handlers.categories?.remove(id);
    }
  }

  restoreTodoWithCascade(data: {
    todo: Todo;
    tasks: Task[];
    subtasks: Subtask[];
    comments: Comment[];
    chats?: Chat[];
  }): void {
    const handler = this.handlers.todos as TodoHandler;
    handler.restoreWithCascade(data);
  }
}
