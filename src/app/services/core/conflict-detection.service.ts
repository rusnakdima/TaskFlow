/* sys lib */
import { Injectable, inject } from "@angular/core";
import { BehaviorSubject, Observable } from "rxjs";

/* services */
import { StorageService } from "@services/storage.service";
import { NotifyService } from "@services/notifications/notify.service";

/* models */
import { Conflict, ConflictResolution, ConflictDetectionStats } from "@models/conflict.model";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

const CONFLICT_TTL_MS = 10 * 60 * 1000;
const MAX_CONFLICTS_SIZE = 100;

@Injectable({
  providedIn: "root",
})
export class ConflictDetectionService {
  private storageService = inject(StorageService);
  private notifyService = inject(NotifyService);

  private conflicts = new Map<string, Conflict>();
  private conflictTimestamps = new Map<string, number>();
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
        localData = this.storageService.todoMap().get(entityId);
        break;
      case "tasks":
        localData = this.storageService.taskMap().get(entityId);
        break;
      case "subtasks":
        localData = this.storageService.subtaskMap().get(entityId);
        break;
      case "categories":
        localData = this.storageService.get("categories", entityId);
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
      this.enforceConflictLimits();
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
      this.conflictTimestamps.set(`${entityType}:${entityId}`, Date.now());
      this.conflictsSubject.next(this.getConflicts());
      this.notifyUserOfConflict(conflict);
      return true;
    }

    const localTime = localData.updatedAt ? new Date(localData.updatedAt).getTime() : 0;
    const remoteTime = remoteData.updatedAt ? new Date(remoteData.updatedAt).getTime() : 0;

    if (Math.abs(localTime - remoteTime) < 2000 && localTime !== remoteTime) {
      this.enforceConflictLimits();
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
      this.conflictTimestamps.set(`${entityType}:${entityId}`, Date.now());
      this.conflictsSubject.next(this.getConflicts());
      this.notifyUserOfConflict(conflict);
      return true;
    }

    return false;
  }

  private enforceConflictLimits(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.conflictTimestamps.entries()) {
      if (now - timestamp > CONFLICT_TTL_MS) {
        this.conflicts.delete(key);
        this.conflictTimestamps.delete(key);
      }
    }
    if (this.conflicts.size >= MAX_CONFLICTS_SIZE) {
      const sortedKeys = Array.from(this.conflictTimestamps.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(0, this.conflicts.size - MAX_CONFLICTS_SIZE + 1)
        .map(([key]) => key);
      for (const key of sortedKeys) {
        this.conflicts.delete(key);
        this.conflictTimestamps.delete(key);
      }
    }
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
    this.conflictTimestamps.delete(`${entityType}:${entityId}`);
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
        this.conflictTimestamps.delete(`${conflict.entityType}:${conflict.entityId}`);
      }
    });
    this.conflictsSubject.next(this.getConflicts());
  }

  private updateEntity(entityType: string, entityId: string, data: any): void {
    this.storageService.modify(entityType as any, "update", { id: entityId, ...data });
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
