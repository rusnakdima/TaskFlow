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
import { AdminService } from "@services/data/admin.service";
import { ApiProvider } from "@providers/api.provider";
import { AdminDataService, AdminDataWithRelations } from "@services/core/admin-data.service";
import { BaseAdminStorageService } from "./base-admin-storage.service";
import { CascadeService } from "./cascade.service";

@Injectable({
  providedIn: "root",
})
export class AdminStorageService extends BaseAdminStorageService {
  private apiProvider = inject(ApiProvider);
  private adminService = inject(AdminService);
  private adminDataService = inject(AdminDataService);
  private cascadeService = inject(CascadeService);

  /**
   * Load initial paginated data for a specific type
   */
  loadInitialData(type: string, limit: number): Observable<any> {
    return new Observable((subscriber) => {
      this.adminService.getAdminDataPaginated(type, 0, limit).subscribe({
        next: (response) => {
          if (response.status === "Success" && response.data) {
            subscriber.next(response.data);
            subscriber.complete();
          } else {
            subscriber.error(new Error(response.message || "Failed to load data"));
          }
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  /**
   * Load more paginated data for a specific type
   */
  loadMoreData(type: string, skip: number): Observable<any> {
    return new Observable((subscriber) => {
      this.adminService.getAdminDataPaginated(type, skip, 10).subscribe({
        next: (response) => {
          if (response.status === "Success" && response.data) {
            subscriber.next(response.data);
            subscriber.complete();
          } else {
            subscriber.error(new Error(response.message || "Failed to load more data"));
          }
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  /**
   * Load all admin data from backend
   * Updates SingleDataStore and local signals
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

    const { taskIds, subtaskIds } = this.cascadeService.computeCascadeForTodo(
      this.tasksSignal(),
      this.subtasksSignal(),
      todo_id
    );

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
      const { taskIds, subtaskIds } = this.cascadeService.computeCascadeForTodo(
        this.tasksSignal(),
        this.subtasksSignal(),
        id
      );

      this.tasksSignal.update((tasks) =>
        tasks.map((task) =>
          task.todo_id === id
            ? { ...task, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : task
        )
      );

      this.subtasksSignal.update((subtasks) =>
        subtasks.map((subtask) =>
          subtaskIds.includes(subtask.id)
            ? { ...subtask, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : subtask
        )
      );

      this.commentsSignal.update((comments) =>
        comments.map((comment) => {
          const isRelated =
            (comment.task_id && taskIds.includes(comment.task_id)) ||
            (comment.subtask_id && subtaskIds.includes(comment.subtask_id));
          return isRelated
            ? { ...comment, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : comment;
        })
      );

      this.chatsSignal.update((chats) =>
        chats.map((chat) =>
          chat.todo_id === id
            ? { ...chat, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : chat
        )
      );

      this.todosSignal.update((todos) =>
        todos.map((todo) =>
          todo.id === id
            ? { ...todo, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : todo
        )
      );
    } else if (table === "tasks") {
      const { subtaskIds } = this.cascadeService.computeCascadeForTask(this.subtasksSignal(), id);

      this.subtasksSignal.update((subtasks) =>
        subtasks.map((subtask) =>
          subtaskIds.includes(subtask.id)
            ? { ...subtask, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : subtask
        )
      );

      this.commentsSignal.update((comments) =>
        comments.map((comment) => {
          const isRelated =
            comment.task_id === id ||
            (comment.subtask_id && subtaskIds.includes(comment.subtask_id));
          return isRelated
            ? { ...comment, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : comment;
        })
      );

      this.tasksSignal.update((tasks) =>
        tasks.map((task) =>
          task.id === id
            ? { ...task, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : task
        )
      );
    } else if (table === "subtasks") {
      this.commentsSignal.update((comments) =>
        comments.map((comment) =>
          comment.subtask_id === id
            ? { ...comment, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : comment
        )
      );

      this.subtasksSignal.update((subtasks) =>
        subtasks.map((subtask) =>
          subtask.id === id
            ? { ...subtask, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : subtask
        )
      );
    }
  }

  /**
   * Override to handle cascade for todos and tasks
   */
  override removeRecordWithCascade(table: string, id: string): void {
    if (table === "todos") {
      this.removeTodoWithCascade(id);
    } else if (table === "tasks") {
      const subtaskIds = this.subtasksSignal()
        .filter((s) => s.task_id === id)
        .map((s) => s.id);
      this.subtasksSignal.set(this.subtasksSignal().filter((s) => !subtaskIds.includes(s.id)));
      this.commentsSignal.set(this.commentsSignal().filter((c) => c.task_id !== id));
      this.tasksSignal.set(this.tasksSignal().filter((t) => t.id !== id));
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
      deleted_at: deletedAt ? timestamp : null,
      updated_at: timestamp,
    });
  }
}
