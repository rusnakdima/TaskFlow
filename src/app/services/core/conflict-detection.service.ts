/* sys lib */
import { Injectable, inject } from "@angular/core";
import { BehaviorSubject, Observable } from "rxjs";

/* services */
import { StorageService } from "@services/core/storage.service";
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
  private storageService = inject(StorageService);
  private notifyService = inject(NotifyService);

  private conflicts = new Map<string, Conflict>();
  private conflictsSubject = new BehaviorSubject<Conflict[]>([]);

  /**
   * Get all conflicts as observable
   */
  getConflicts$(): Observable<Conflict[]> {
    return this.conflictsSubject.asObservable();
  }

  /**
   * Get all conflicts synchronously
   */
  getConflicts(): Conflict[] {
    return Array.from(this.conflicts.values());
  }

  /**
   * Get conflict count
   */
  getConflictCount(): number {
    return this.conflicts.size;
  }

  /**
   * Check for conflicts when receiving remote update
   * Returns true if conflict detected, false otherwise
   */
  checkConflict<T extends { id: string; version?: number; updated_at?: string }>(
    entityType: "todos" | "tasks" | "subtasks" | "categories" | "comments",
    remoteData: T
  ): boolean {
    const entityId = remoteData.id;
    if (!entityId) return false;

    // Get local version
    let localData: any;
    let localVersion: number = 0;

    switch (entityType) {
      case "todos":
        localData = this.storageService.getById("todos", entityId);
        break;
      case "tasks":
        localData = this.storageService.getById("tasks", entityId);
        break;
      case "subtasks":
        localData = this.storageService.getById("subtasks", entityId);
        break;
      case "categories":
        localData = this.storageService.getById("categories", entityId);
        break;
      default:
        // For comments and other types, skip conflict detection for now
        return false;
    }

    if (!localData) return false; // No conflict if local doesn't exist

    localVersion = localData.version || 0;
    const remoteVersion = (remoteData as any).version || 0;

    // Check if remote is newer - no conflict, accept remote
    if (remoteVersion > localVersion) {
      return false;
    }

    // Check if local is newer - conflict!
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

    // Same version - check timestamp for concurrent edits
    const localTime = localData.updated_at ? new Date(localData.updated_at).getTime() : 0;
    const remoteTime = remoteData.updated_at ? new Date(remoteData.updated_at).getTime() : 0;

    // If both updated within 2 seconds, potential conflict
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

  /**
   * Resolve conflict by choosing which version to keep
   */
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
        // Accept remote changes
        this.storageService.updateItem(entityType as any, entityId, conflict.remoteData);
        break;

      case "local":
        // Keep local changes (already in storage, no action needed)
        break;

      case "merge":
        // Use merged data if provided
        if (mergedData) {
          this.storageService.updateItem(entityType as any, entityId, mergedData);
        } else {
          // Default: prefer local but update timestamp
          this.storageService.updateItem(entityType as any, entityId, {
            ...conflict.localData,
            updated_at: new Date().toISOString(),
          });
        }
        break;
    }

    // Mark as resolved and remove
    conflict.resolved = true;
    this.conflicts.delete(`${entityType}:${entityId}`);
    this.conflictsSubject.next(this.getConflicts());

    this.notifyService.showSuccess("Conflict resolved");
  }

  /**
   * Resolve all conflicts with specified strategy
   */
  resolveAllConflicts(resolution: ConflictResolution): void {
    const conflicts = this.getConflicts();
    conflicts.forEach((conflict) => {
      this.resolveConflict(conflict.entityType, conflict.entityId, resolution);
    });
  }

  /**
   * Clear all resolved conflicts
   */
  clearResolvedConflicts(): void {
    const conflicts = this.getConflicts();
    conflicts.forEach((conflict) => {
      if (conflict.resolved) {
        this.conflicts.delete(`${conflict.entityType}:${conflict.entityId}`);
      }
    });
    this.conflictsSubject.next(this.getConflicts());
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

    // Check if this is a private todo (safe to auto-resolve)
    const isPrivateTodo =
      conflict.entityType === "todos" && conflict.localData?.visibility === "private";

    if (isPrivateTodo) {
      // For private todos, auto-resolve is safe (no other users can edit)
      this.notifyService.showInfo(`Version conflict on ${entityName}. Your version will be kept.`);

      setTimeout(() => {
        const stillExists = this.conflicts.has(`${conflict.entityType}:${conflict.entityId}`);
        if (stillExists) {
          this.resolveConflict(conflict.entityType, conflict.entityId, "local");
        }
      }, 5000);
    } else {
      // For team todos and other shared data, require user decision
      this.notifyService.showWarning(
        `Conflict detected on ${entityName}. Your version is newer than the server. ` +
          `Please review in sync status.`
      );
      // NO auto-resolve for team data - user must decide
    }
  }

  /**
   * Check if specific entity has conflict
   */
  hasConflict(entityType: string, entityId: string): boolean {
    return this.conflicts.has(`${entityType}:${entityId}`);
  }

  /**
   * Get conflict for specific entity
   */
  getConflict(entityType: string, entityId: string): Conflict | undefined {
    return this.conflicts.get(`${entityType}:${entityId}`);
  }
}
