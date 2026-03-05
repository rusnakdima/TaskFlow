/* sys lib */
import { Injectable } from "@angular/core";

/* models */
import { SyncMetadata } from "@models/sync-metadata";

/**
 * PermissionContext - Unified permission checking helper
 * Eliminates repetitive { isOwner, isPrivate } pattern (89 occurrences)
 */
@Injectable({
  providedIn: "root",
})
export class PermissionContext {
  constructor(
    public readonly isOwner: boolean,
    public readonly isPrivate: boolean
  ) {}

  /**
   * Convert to SyncMetadata format
   */
  toSyncMetadata(): SyncMetadata {
    return {
      isOwner: this.isOwner,
      isPrivate: this.isPrivate,
    };
  }

  /**
   * Check if user can edit the resource
   */
  canEdit(): boolean {
    return this.isOwner || !this.isPrivate;
  }

  /**
   * Check if user can delete the resource
   */
  canDelete(): boolean {
    return this.isOwner;
  }

  /**
   * Create PermissionContext from todo/resource data
   * @param userId - Current user's ID
   * @param resourceUserId - Resource owner's userId
   * @param visibility - Resource visibility ("private" or "public")
   */
  static fromResource(
    userId: string,
    resourceUserId: string,
    visibility: "private" | "public"
  ): PermissionContext {
    const isOwner = userId === resourceUserId;
    const isPrivate = visibility === "private";
    return new PermissionContext(isOwner, isPrivate);
  }

  /**
   * Create PermissionContext from todo object
   * @param userId - Current user's ID
   * @param todo - Todo object with userId and visibility
   */
  static fromTodo(
    userId: string,
    todo: { userId: string; visibility: "private" | "public" }
  ): PermissionContext {
    return this.fromResource(userId, todo.userId, todo.visibility);
  }
}
