/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, map, catchError } from "rxjs/operators";

/* models */
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";

/* services */
import { ApiProvider } from "@providers/api.provider";
import { AdminDataService, AdminDataWithRelations } from "@services/core/admin-data.service";
import { BaseAdminStorageService } from "./base-admin-storage.service";

@Injectable({
  providedIn: "root",
})
export class AdminStorageService extends BaseAdminStorageService {
  private apiProvider = inject(ApiProvider);
  private adminDataService = inject(AdminDataService);

  /**
   * Load all admin data from backend
   * Only fetches if cache is expired or data is empty
   */
  loadAdminData(force: boolean = false): Observable<AdminDataWithRelations> {
    if (!this.hasData()) {
      force = true;
    }

    if (!force && this.isCacheValid()) {
      return of(this.getAdminDataWithRelations());
    }

    if (this.loadingSignal()) {
      return of(this.getAdminDataWithRelations());
    }

    this.loadingSignal.set(true);

    return this.adminDataService.loadAllAdminData().pipe(
      tap((data: AdminDataWithRelations) => {
        this.todosSignal.set(data["todos"] || []);
        this.tasksSignal.set(data["tasks"] || []);
        this.subtasksSignal.set(data["subtasks"] || []);
        this.commentsSignal.set(data["comments"] || []);
        this.chatsSignal.set(data["chats"] || []);
        this.categoriesSignal.set(data["categories"] || []);
        this.dailyActivitiesSignal.set(data["daily_activities"] || []);

        this.extractUsersAndProfiles(data);

        this.loadingSignal.set(false);
        this.loadedSignal.set(true);
        this.lastLoadedSignal.set(new Date());
      }),
      catchError((err) => {
        this.loadingSignal.set(false);
        return of(this.getAdminDataWithRelations());
      }),
      map(() => this.getAdminDataWithRelations())
    );
  }

  private getAdminDataWithRelations(): AdminDataWithRelations {
    return {
      todos: this.todos(),
      tasks: this.tasks(),
      subtasks: this.subtasks(),
      comments: this.comments(),
      chats: this.chats(),
      categories: this.categories(),
      daily_activities: this.dailyActivities(),
      users: this.users(),
      profiles: this.profiles(),
    };
  }

  /**
   * Remove todo with all related data (tasks, subtasks, comments, chats)
   */
  removeTodoWithCascade(todo_id?: string): void {
    if (!todo_id) return;
    const todo = this.todosSignal().find((t) => t.id === todo_id);
    if (!todo) return;

    const taskIds = todo.tasks?.map((t) => t.id) || [];
    const subtaskIds = todo.tasks?.flatMap((t) => t.subtasks?.map((s) => s.id) || []) || [];

    this.subtasksSignal.update((items) => items.filter((s) => !subtaskIds.includes(s.id)));

    this.tasksSignal.update((items) => items.filter((t) => t.todo_id !== todo_id));

    this.commentsSignal.update((items) =>
      items.filter((c) => {
        const isTodoComment = (c as any).todo_id === todo_id;
        const isTaskComment = c.task_id && taskIds.includes(c.task_id);
        const isSubtaskComment = c.subtask_id && subtaskIds.includes(c.subtask_id);
        return !isTodoComment && !isTaskComment && !isSubtaskComment;
      })
    );

    this.chatsSignal.update((items) => items.filter((c) => c.todo_id !== todo_id));

    this.todosSignal.update((items) => items.filter((t) => t.id !== todo_id));
  }

  /**
   * Restore todo with all related data
   */
  restoreTodoWithCascade(data: {
    todo: Todo;
    tasks: Task[];
    subtasks: Subtask[];
    comments: Comment[];
    chats: Chat[];
  }): void {
    this.todosSignal.set([data.todo, ...this.todosSignal()]);

    if (data.tasks?.length) {
      this.tasksSignal.set([...this.tasksSignal(), ...data.tasks]);
    }
    if (data.subtasks?.length) {
      this.subtasksSignal.set([...this.subtasksSignal(), ...data.subtasks]);
    }
    if (data.comments?.length) {
      this.commentsSignal.set([...this.commentsSignal(), ...data.comments]);
    }
    if (data.chats?.length) {
      this.chatsSignal.set([...this.chatsSignal(), ...data.chats]);
    }
  }

  /**
   * Update record delete status with cascade (for soft delete/restore)
   */
  updateRecordDeleteStatusWithCascade(table: string, id: string, deletedAt: boolean): void {
    const timestamp = new Date().toISOString();

    if (table === "todos") {
      const todo = this.todosSignal().find((t) => t.id === id);
      if (todo) {
        const taskIds = todo.tasks?.map((t) => t.id) || [];

        this.tasksSignal.update((tasks) =>
          tasks.map((task) =>
            task.todo_id === id
              ? { ...task, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
              : task
          )
        );

        const subtaskIds = todo.tasks?.flatMap((t) => t.subtasks?.map((s) => s.id) || []) || [];
        this.subtasksSignal.update((subtasks) =>
          subtasks.map((subtask) =>
            subtaskIds.includes(subtask.id)
              ? { ...subtask, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
              : subtask
          )
        );

        this.commentsSignal.update((comments) =>
          comments.map((comment) => {
            const isRelated =
              (comment.task_id && taskIds.includes(comment.task_id)) ||
              (comment.subtask_id && subtaskIds.includes(comment.subtask_id));
            return isRelated
              ? { ...comment, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
              : comment;
          })
        );

        this.chatsSignal.update((chats) =>
          chats.map((chat) =>
            chat.todo_id === id
              ? { ...chat, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
              : chat
          )
        );
      }
      this.updateRecord(table, id, {
        deletedAt: deletedAt ? timestamp : null,
        updatedAt: timestamp,
      });
    } else if (table === "tasks") {
      const task = this.tasksSignal().find((t) => t.id === id);
      if (task) {
        const subtaskIds = task.subtasks?.map((s) => s.id) || [];

        this.subtasksSignal.update((subtasks) =>
          subtasks.map((subtask) =>
            subtaskIds.includes(subtask.id)
              ? { ...subtask, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
              : subtask
          )
        );

        this.commentsSignal.update((comments) =>
          comments.map((comment) => {
            const isRelated =
              comment.task_id === id ||
              (comment.subtask_id && subtaskIds.includes(comment.subtask_id));
            return isRelated
              ? { ...comment, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
              : comment;
          })
        );
      }
      this.updateRecord(table, id, {
        deletedAt: deletedAt ? timestamp : null,
        updatedAt: timestamp,
      });
    } else if (table === "subtasks") {
      this.commentsSignal.update((comments) =>
        comments.map((comment) =>
          comment.subtask_id === id
            ? { ...comment, deletedAt: deletedAt ? timestamp : null, updatedAt: timestamp }
            : comment
        )
      );
      this.updateRecord(table, id, {
        deletedAt: deletedAt ? timestamp : null,
        updatedAt: timestamp,
      });
    } else {
      this.updateRecord(table, id, {
        deletedAt: deletedAt ? timestamp : null,
        updatedAt: timestamp,
      });
    }
  }

  /**
   * Override to handle cascade for todos and tasks
   */
  override removeRecordWithCascade(table: string, id: string): void {
    if (table === "todos") {
      this.removeTodoWithCascade(id);
    } else if (table === "tasks") {
      const task = this.tasksSignal().find((t) => t.id === id);
      if (task) {
        const subtaskIds = task.subtasks?.map((s) => s.id) || [];
        this.subtasksSignal.set(this.subtasksSignal().filter((s) => !subtaskIds.includes(s.id)));
        this.commentsSignal.set(this.commentsSignal().filter((c) => c.task_id !== id));
        this.tasksSignal.set(this.tasksSignal().filter((t) => t.id !== id));
      }
    } else if (table === "subtasks") {
      this.commentsSignal.set(this.commentsSignal().filter((c) => c.subtask_id !== id));
      this.subtasksSignal.set(this.subtasksSignal().filter((s) => s.id !== id));
    } else {
      super.removeRecordWithCascade(table, id);
    }
  }

  /**
   * Update a record in the store
   */
  updateRecord(table: string, id: string, updates: any): void {
    const sig = this.signalMap[table];
    if (!sig) return;
    sig.update((items) => items.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }

  /**
   * Update all related records when parent is deleted/restored
   */
  updateRelatedRecords(parentTable: string, parentId: string, updates: any): void {
    if (parentTable === "todos") {
      this.tasksSignal.update((tasks) =>
        tasks.map((task) => (task.todo_id === parentId ? { ...task, ...updates } : task))
      );
    } else if (parentTable === "tasks") {
      this.subtasksSignal.update((subtasks) =>
        subtasks.map((subtask) =>
          subtask.task_id === parentId ? { ...subtask, ...updates } : subtask
        )
      );
    }
  }

  /**
   * Remove a record from the store
   */
  removeRecord(table: string, id: string): void {
    const sig = this.signalMap[table];
    if (!sig) return;
    sig.update((items) => items.filter((item) => item.id !== id));
    if (table === "todos") {
      this.tasksSignal.update((tasks) => tasks.filter((task) => task.todo_id !== id));
    } else if (table === "tasks") {
      this.subtasksSignal.update((subtasks) =>
        subtasks.filter((subtask) => subtask.task_id !== id)
      );
    }
  }

  /**
   * Update record delete status (for soft delete/restore)
   */
  updateRecordDeleteStatus(table: string, id: string, deletedAt: boolean): void {
    const timestamp = new Date().toISOString();
    this.updateRecord(table, id, {
      deletedAt: deletedAt ? timestamp : null,
      updatedAt: timestamp,
    });
  }
}
