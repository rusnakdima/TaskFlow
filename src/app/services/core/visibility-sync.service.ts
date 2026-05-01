import { Injectable, Injector, inject } from "@angular/core";
import { Observable, from, of, firstValueFrom } from "rxjs";
import { tap, catchError } from "rxjs/operators";
import { Response, ResponseStatus } from "@models/response.model";
import { RelationObj } from "@models/relation-obj.model";
import { SyncMetadata } from "@models/sync-metadata";
import { Todo } from "@models/todo.model";
import { StorageService } from "@services/core/storage.service";
import { SyncProgressService } from "@services/core/sync-progress.service";
import { ApiProvider } from "@providers/api.provider";

const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000;

@Injectable({
  providedIn: "root",
})
export class VisibilitySyncService {
  private injector = inject(Injector);
  private storageService = inject(StorageService);
  private syncProgressService = inject(SyncProgressService);

  private get apiProvider(): ApiProvider {
    return this.injector.get(ApiProvider);
  }

  async syncSingleTodoVisibilityChange(
    newVisibility: "private" | "team",
    todo_id?: string
  ): Promise<void> {
    if (!todo_id) return;
    const todo = this.storageService.getById("todos", todo_id);
    if (!todo) {
      throw new Error(`Todo with id ${todo_id} not found`);
    }

    const currentVisibility = todo.visibility;
    const isPrivateToTeam = currentVisibility === "private" && newVisibility === "team";
    const isTeamToPrivate = currentVisibility === "team" && newVisibility === "private";

    if (!isPrivateToTeam && !isTeamToPrivate) {
      await this.importTodoToLocalDb(todo_id);
      return;
    }

    this.syncProgressService.startSync(
      "visibility_change",
      `Syncing todo to ${newVisibility}...`,
      10
    );

    try {
      await this.syncTodoVisibility(todo, newVisibility);
      this.syncProgressService.endSync();
    } catch (error) {
      this.syncProgressService.reset();
      throw error;
    }
  }

  private async syncTodoVisibility(
    todo: Todo,
    targetVisibility: "private" | "team"
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        this.syncProgressService.updateProgress(0, `Syncing todo to ${targetVisibility}...`);

        await this.withRetry(
          () => this.exportTodoToStorage(todo, targetVisibility === "private"),
          attempt,
          `Exporting todo to ${targetVisibility === "private" ? "local storage" : "MongoDB"}`
        );

        this.syncProgressService.updateProgress(this.countTodoChildren(todo), "Importing...");

        await this.importTodoToLocalDb(todo.id);
        return;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (attempt < MAX_RETRIES - 1) {
          const delay = Math.pow(2, attempt) * RETRY_DELAY_BASE;
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error(`Failed to sync todo after retries`);
  }

  private countTodoChildren(todo: Todo): number {
    let count = 0;
    todo.tasks?.forEach((task) => {
      count++;
      task.subtasks?.forEach(() => {
        count++;
      });
      count++;
    });
    return count;
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    attempt: number,
    operationName: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (attempt < 2) {
        const delay = Math.pow(2, attempt) * RETRY_DELAY_BASE;
        this.syncProgressService.setMessage(`${operationName} failed, retrying...`);
        await this.sleep(delay);
        return await operation();
      }
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async exportTodoToStorage(todo: Todo, isPrivate: boolean): Promise<void> {
    const visibility = isPrivate ? "private" : "team";
    const todoWithoutRelations = this.stripRelations(todo);

    await firstValueFrom(
      this.apiProvider
        .crud<Todo>("update", "todos", {
          id: todo.id,
          data: { ...todoWithoutRelations, visibility },
          visibility,
        })
        .pipe(
          catchError((error) => {
            console.error("[VisibilitySync] Error:", error);
            return of(null);
          })
        )
    );
  }

  private stripRelations(todo: Todo): Partial<Todo> {
    const { tasks, user, categories, ...rest } = todo;
    return rest;
  }

  private async importTodoToLocalDb(todo_id?: string): Promise<void> {
    return;
  }
}
