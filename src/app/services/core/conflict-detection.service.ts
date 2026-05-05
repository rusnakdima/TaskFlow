/* sys lib */
import { Injectable, inject } from "@angular/core";
import { BehaviorSubject, Observable } from "rxjs";

/* services */
import { DataService } from "@services/core/data.service";
import { NotifyService } from "@services/notifications/notify.service";

/* models */
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

export interface Conflict {
  entityType: string;
  entityId: string;
  localVersion: number;
  remoteVersion: number;
  localData: any;
  remoteData: any;
  timestamp: string;
  resolved: boolean;
}

export type ConflictResolution = "local" | "remote" | "merge";

@Injectable({
  providedIn: "root",
})
export class ConflictDetectionService {
  private dataService = inject(DataService);
  private notifyService = inject(NotifyService);

  private conflicts = new Map<string, Conflict>();
  private conflictsSubject = new BehaviorSubject<Conflict[]>([]);

  getConflicts$(): Observable<Conflict[]> {
    return this.conflictsSubject.asObservable();
  }

  getConflicts(): Conflict[] {
    return Array.from(this.conflicts.values());
  }

  getConflictCount(): number {
    return this.conflicts.size;
  }

  checkConflict<T extends { id: string; version?: number; updatedAt?: string }>(
    entityType: "todos" | "tasks" | "subtasks" | "categories" | "comments",
    remoteData: T
  ): boolean {
    const entityId = remoteData.id;
    if (!entityId) return false;

    let localData: any;
    let localVersion: number = 0;

    switch (entityType) {
      case "todos":
        localData = this.dataService.getTodo(entityId);
        break;
      case "tasks":
        localData = this.dataService.getTask(entityId);
        break;
      case "subtasks":
        localData = this.dataService.getSubtask(entityId);
        break;
      case "categories":
        localData = this.dataService.getCategory(entityId);
        break;
      default:
        return false;
    }

    if (!localData) return false;

    localVersion = localData.version || 0;
    const remoteVersion = (remoteData as any).version || 0;

    if (remoteVersion > localVersion) {
      return false;
    }

    if (remoteVersion < localVersion) {
      const conflict: Conflict = {
        entityType,
        entityId,
        localVersion,
        remoteVersion,
        localData,
        remoteData,
        timestamp: new Date().toISOString(),
        resolved: false,
      };

      this.conflicts.set(`${entityType}:${entityId}`, conflict);
      this.conflictsSubject.next(this.getConflicts());
      this.notifyUserOfConflict(conflict);
      return true;
    }

    const localTime = localData.updatedAt ? new Date(localData.updatedAt).getTime() : 0;
    const remoteTime = remoteData.updatedAt ? new Date(remoteData.updatedAt).getTime() : 0;

    if (Math.abs(localTime - remoteTime) < 2000 && localTime !== remoteTime) {
      const conflict: Conflict = {
        entityType,
        entityId,
        localVersion,
        remoteVersion,
        localData,
        remoteData,
        timestamp: new Date().toISOString(),
        resolved: false,
      };

      this.conflicts.set(`${entityType}:${entityId}`, conflict);
      this.conflictsSubject.next(this.getConflicts());
      this.notifyUserOfConflict(conflict);
      return true;
    }

    return false;
  }

  resolveConflict(
    entityType: string,
    entityId: string,
    resolution: ConflictResolution,
    mergedData?: any
  ): void {
    const conflict = this.conflicts.get(`${entityType}:${entityId}`);
    if (!conflict) return;

    switch (resolution) {
      case "remote":
        this.updateEntity(entityType, entityId, conflict.remoteData);
        break;

      case "local":
        break;

      case "merge":
        if (mergedData) {
          this.updateEntity(entityType, entityId, mergedData);
        } else {
          this.updateEntity(entityType, entityId, {
            ...conflict.localData,
            updatedAt: new Date().toISOString(),
          });
        }
        break;
    }

    conflict.resolved = true;
    this.conflicts.delete(`${entityType}:${entityId}`);
    this.conflictsSubject.next(this.getConflicts());

    this.notifyService.showSuccess("Conflict resolved");
  }

  resolveAllConflicts(resolution: ConflictResolution): void {
    const conflicts = this.getConflicts();
    conflicts.forEach((conflict) => {
      this.resolveConflict(conflict.entityType, conflict.entityId, resolution);
    });
  }

  clearResolvedConflicts(): void {
    const conflicts = this.getConflicts();
    conflicts.forEach((conflict) => {
      if (conflict.resolved) {
        this.conflicts.delete(`${conflict.entityType}:${conflict.entityId}`);
      }
    });
    this.conflictsSubject.next(this.getConflicts());
  }

  private updateEntity(entityType: string, entityId: string, data: any): void {
    switch (entityType) {
      case "todos":
        this.dataService.updateTodo(entityId, data);
        break;
      case "tasks":
        this.dataService.updateTask(entityId, data);
        break;
      case "subtasks":
        this.dataService.updateSubtask(entityId, data);
        break;
      case "categories":
        this.dataService.updateCategory(entityId, data);
        break;
    }
  }

  private notifyUserOfConflict(conflict: Conflict): void {
    const entityNames: Record<string, string> = {
      todos: "project",
      tasks: "task",
      subtasks: "subtask",
      categories: "category",
      comments: "comment",
    };

    const entityName = entityNames[conflict.entityType] || conflict.entityType;

    const isPrivateTodo =
      conflict.entityType === "todos" && conflict.localData?.visibility === "private";

    if (isPrivateTodo) {
      this.notifyService.showInfo(`Version conflict on ${entityName}. Your version will be kept.`);

      setTimeout(() => {
        const stillExists = this.conflicts.has(`${conflict.entityType}:${conflict.entityId}`);
        if (stillExists) {
          this.resolveConflict(conflict.entityType, conflict.entityId, "local");
        }
      }, 5000);
    } else {
      this.notifyService.showWarning(
        `Conflict detected on ${entityName}. Your version is newer than the server. ` +
          `Please review in sync status.`
      );
    }
  }

  hasConflict(entityType: string, entityId: string): boolean {
    return this.conflicts.has(`${entityType}:${entityId}`);
  }

  getConflict(entityType: string, entityId: string): Conflict | undefined {
    return this.conflicts.get(`${entityType}:${entityId}`);
  }
}
