/* sys lib */
import { Injectable } from "@angular/core";
import { Observable, of, forkJoin } from "rxjs";
import { map, catchError } from "rxjs/operators";
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
        map((_result) => ({ success: true, id: item.id })),
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
    deleteFn: (id: string, options?: any) => Observable<any>,
    options?: any
  ): Observable<BulkOperationResult> {
    if (items.length === 0) {
      return of({ successCount: 0, errorCount: 0, errors: [] });
    }
    const deleteObservables = items.map((item: any) =>
      deleteFn(item.id, options).pipe(
        map((_result) => ({ success: true, id: item.id })),
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
   * Bulk permanent delete multiple items (hard delete)
   */
  bulkPermanentDelete<T>(
    items: T[],
    permanentDeleteFn: (id: string, options?: any) => Observable<any>,
    options?: any
  ): Observable<BulkOperationResult> {
    if (items.length === 0) {
      return of({ successCount: 0, errorCount: 0, errors: [] });
    }
    const deleteObservables = items.map((item: any) =>
      permanentDeleteFn(item.id, options).pipe(
        map((_result) => ({ success: true, id: item.id })),
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
}
