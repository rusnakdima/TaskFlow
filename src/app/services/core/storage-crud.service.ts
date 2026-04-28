/* sys lib */
import { Injectable, inject, Signal, WritableSignal } from "@angular/core";
/* models */
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
/* handlers */
import { TodoHandler } from "./entity-handlers/todo.handler";
import { NestedEntityHandler } from "./entity-handlers/nested-entity.handler";
import { CommentHandler } from "./entity-handlers/comment.handler";
import { CategoryHandler } from "./entity-handlers/category.handler";
import { ProfileHandler } from "./entity-handlers/profile.handler";
import { ChatHandler } from "./entity-handlers/chat.handler";
/* services */
import { EntityIndexService } from "./entity-index.service";

export type StorageEntity = keyof EntityMap;

interface EntityMap {
  todos: Todo;
  tasks: Task;
  subtasks: Subtask;
  categories: Category;
  profiles: Profile;
  chats: Chat;
  comments: Comment;
}

@Injectable({ providedIn: "root" })
export class StorageCrudService {
  private entityIndexService = inject(EntityIndexService);

  private privateTodosSignal!: WritableSignal<Todo[]>;
  private sharedTodosSignal!: WritableSignal<Todo[]>;
  private categoriesSignal!: WritableSignal<Category[]>;
  private profileSignal!: WritableSignal<Profile | null>;
  private profilesSignal!: WritableSignal<Profile[]>;
  private chatsByTodoSignal!: WritableSignal<Map<string, Chat[]>>;

  private handlers!: {
    todos: TodoHandler;
    tasks: NestedEntityHandler<Task>;
    subtasks: NestedEntityHandler<Subtask>;
    categories: CategoryHandler;
    profiles: ProfileHandler;
    chats: ChatHandler;
    comments: CommentHandler;
  };

  init(
    privateTodosSignal: WritableSignal<Todo[]>,
    sharedTodosSignal: WritableSignal<Todo[]>,
    categoriesSignal: WritableSignal<Category[]>,
    profileSignal: WritableSignal<Profile | null>,
    profilesSignal: WritableSignal<Profile[]>,
    chatsByTodoSignal: WritableSignal<Map<string, Chat[]>>
  ): void {
    this.privateTodosSignal = privateTodosSignal;
    this.sharedTodosSignal = sharedTodosSignal;
    this.categoriesSignal = categoriesSignal;
    this.profileSignal = profileSignal;
    this.profilesSignal = profilesSignal;
    this.chatsByTodoSignal = chatsByTodoSignal;

    this.handlers = {
      todos: new TodoHandler(this.privateTodosSignal, this.sharedTodosSignal),
      tasks: new NestedEntityHandler<Task>(
        this.privateTodosSignal,
        this.sharedTodosSignal,
        "tasks",
        {
          getTodoIdForTask: (id: string) => this.entityIndexService.getTodoIdForTask(id),
          getTaskIdForSubtask: (id: string) => this.entityIndexService.getTaskIdForSubtask(id),
        }
      ),
      subtasks: new NestedEntityHandler<Subtask>(
        this.privateTodosSignal,
        this.sharedTodosSignal,
        "subtasks",
        {
          getTodoIdForTask: (id: string) => this.entityIndexService.getTodoIdForTask(id),
          getTaskIdForSubtask: (id: string) => this.entityIndexService.getTaskIdForSubtask(id),
        }
      ),
      categories: new CategoryHandler(this.categoriesSignal),
      profiles: new ProfileHandler(this.profileSignal),
      chats: new ChatHandler(this.chatsByTodoSignal),
      comments: new CommentHandler(this.privateTodosSignal, this.sharedTodosSignal),
    };
  }

  addItem(type: StorageEntity, data: any, options?: { isPrivate?: boolean }): void {
    this.updateIndexesForEntity(type, data);
    this.handlers[type]?.add(data);
  }

  private updateIndexesForEntity(type: StorageEntity, data: any): void {
    if (type === "todos" && data.id) {
      data.tasks?.forEach((task: Task) => {
        if (task.id) {
          this.entityIndexService.setTaskToTodoIndex(task.id, data.id);
          task.subtasks?.forEach((sub: Subtask) => {
            if (sub.id) this.entityIndexService.setSubtaskToTaskIndex(sub.id, task.id);
          });
        }
      });
    } else if (type === "tasks" && data.id && data.todo_id) {
      this.entityIndexService.setTaskToTodoIndex(data.id, data.todo_id);
    } else if (type === "subtasks" && data.id && data.task_id) {
      this.entityIndexService.setSubtaskToTaskIndex(data.id, data.task_id);
    }
  }

  updateItem(
    type: StorageEntity,
    id: string,
    updates: Partial<any>,
    options?: { isPrivate?: boolean }
  ): void {
    this.batchUpdate(type, [{ id, updates }], options);
  }

  batchUpdate(
    type: StorageEntity,
    items: { id: string; updates: Partial<any> }[],
    options?: { isPrivate?: boolean }
  ): void {
    for (const { id, updates } of items) {
      if (updates["deleted_at"]) {
        const existing: any = this.getById(type, id);
        if (existing?.["deleted_at"]) continue;
      }

      if (type === "todos" && updates["tasks"]) {
        this.updateIndexesForEntity("todos", { id, ...updates });
      }

      if (type === "todos") {
        const categoriesSignal = this.categoriesSignal;
        this.handlers[type]?.update(id, updates, {
          getCategoryById: (catId: string) => categoriesSignal().find((c) => c.id === catId),
        });
      } else {
        this.handlers[type]?.update(id, updates);
      }
    }
  }

  removeItem(type: StorageEntity, id: string, parentId?: string, isTeam: boolean = false): void {
    if (type === "tasks") {
      this.entityIndexService.deleteTaskIndex(id);
    } else if (type === "subtasks") {
      this.entityIndexService.deleteSubtaskIndex(id);
    }
    this.handlers[type]?.remove(id, parentId);
  }

  getById<T extends keyof EntityMap>(type: T, id: string): EntityMap[T] | undefined {
    return this.handlers[type]?.getById(id) as EntityMap[T] | undefined;
  }

  get handlersMap() {
    return this.handlers;
  }
}
