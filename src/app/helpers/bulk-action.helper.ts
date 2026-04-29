/* sys lib */
import { Injectable } from "@angular/core";
import { Observable, of, forkJoin } from "rxjs";
import { map, catchError } from "rxjs/operators";

import { StorageUpdateService } from "@services/core/storage-update.service";

/**
 * Bulk operation result interface
 */
export interface BulkOperationResult {
  successCount: number;
  errorCount: number;
  errors: Array<{ id: string; error: string }>;
}

/**
 * BulkActionHelper - Centralized bulk operations for all views
 *
 * Provides reusable methods for bulk update, delete, and status changes
 */
@Injectable({ providedIn: "root" })
export class BulkActionHelper {
  constructor(private storageUpdateService: StorageUpdateService) {}
  /**
   * Bulk update field for multiple items
   */
  bulkUpdateField<T>(
    items: T[],
    field: string,
    value: any,
    updateFn: (id: string, data: any) => Observable<any>
  ): Observable<BulkOperationResult> {
    if (items.length === 0) {
      return of({ successCount: 0, errorCount: 0, errors: [] });
    }

    const updateObservables = items.map((item: any) =>
      updateFn(item.id, { id: item.id, [field]: value }).pipe(
        map((result) => ({ success: true, id: item.id })),
        catchError((error) => of({ success: false, id: item.id, error: error.message }))
      )
    );

    return forkJoin(updateObservables).pipe(
      map((results) => {
        const successCount = results.filter((r) => r.success).length;
        const errors = results
          .filter((r): r is { success: false; id: string; error: string } => !r.success)
          .map((r) => ({ id: r.id, error: r.error }));

        return {
          successCount,
          errorCount: errors.length,
          errors,
        };
      })
    );
  }

  /**
   * Bulk delete multiple items
   */
  bulkDelete<T>(
    items: T[],
    deleteFn: (id: string) => Observable<any>
  ): Observable<BulkOperationResult> {
    if (items.length === 0) {
      return of({ successCount: 0, errorCount: 0, errors: [] });
    }

    const deleteObservables = items.map((item: any) =>
      deleteFn(item.id).pipe(
        map((result) => ({ success: true, id: item.id })),
        catchError((error) => of({ success: false, id: item.id, error: error.message }))
      )
    );

    return forkJoin(deleteObservables).pipe(
      map((results) => {
        const successCount = results.filter((r) => r.success).length;
        const errors = results
          .filter((r): r is { success: false; id: string; error: string } => !r.success)
          .map((r) => ({ id: r.id, error: r.error }));

        return {
          successCount,
          errorCount: errors.length,
          errors,
        };
      })
    );
  }

  /**
   * Bulk update status for multiple items
   */
  bulkUpdateStatus<T extends { id: string; status: string }>(
    items: T[],
    status: string,
    updateFn: (id: string, data: any) => Observable<any>
  ): Observable<BulkOperationResult> {
    return this.bulkUpdateField(items, "status", status, updateFn);
  }

  /**
   * Bulk update priority for multiple items
   */
  bulkUpdatePriority<T extends { id: string; priority: string }>(
    items: T[],
    priority: string,
    updateFn: (id: string, data: any) => Observable<any>
  ): Observable<BulkOperationResult> {
    return this.bulkUpdateField(items, "priority", priority, updateFn);
  }

  /**
   * Select all items
   */
  selectAll<T extends { id: string }>(items: T[]): Set<string> {
    return new Set(items.map((item) => item.id));
  }

  /**
   * Clear selection
   */
  clearSelection(): Set<string> {
    return new Set();
  }

  /**
   * Toggle selection
   */
  toggleSelection(selected: Set<string>, id: string): Set<string> {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    return newSelected;
  }

  /**
   * Check if all items are selected
   */
  isAllSelected<T extends { id: string }>(selected: Set<string>, items: T[]): boolean {
    return selected.size === items.length && items.length > 0;
  }
}
