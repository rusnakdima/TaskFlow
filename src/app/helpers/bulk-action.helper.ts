/* sys lib */
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

export interface ArchiveDataMap {
  [table: string]: any[];
}

/**
 * BulkActionHelper - Centralized bulk operations for all views
 *
 * Provides reusable methods for bulk update, delete, and status changes
 */
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

  /**
   * Remove record with cascade from data map
   */
  removeRecordWithCascade(data: ArchiveDataMap, table: string, recordId: string): ArchiveDataMap {
    const updated = { ...data };
    const tableData = updated[table] || [];
    updated[table] = tableData.filter((r: any) => r.id !== recordId);

    if (table === "todos") {
      const todoTasks = tableData.filter((t: any) => t.todo_id === recordId);
      const todoTaskIds = todoTasks.map((t: any) => t.id);
      updated["tasks"] = (updated["tasks"] || []).filter((t: any) => t.todo_id !== recordId);
      updated["subtasks"] = (updated["subtasks"] || []).filter(
        (s: any) => !todoTaskIds.includes(s.task_id)
      );
      updated["comments"] = (updated["comments"] || []).filter(
        (c: any) => c.todo_id !== recordId && !todoTaskIds.includes(c.task_id)
      );
      updated["chats"] = (updated["chats"] || []).filter((c: any) => c.todo_id !== recordId);
    } else if (table === "tasks") {
      updated["subtasks"] = (updated["subtasks"] || []).filter((s: any) => s.task_id !== recordId);
      updated["comments"] = (updated["comments"] || []).filter((c: any) => c.task_id !== recordId);
    } else if (table === "subtasks") {
      updated["comments"] = (updated["comments"] || []).filter(
        (c: any) => c.subtask_id !== recordId
      );
    }

    return updated;
  }

  /**
   * Get cascade child IDs for restore operation
   */
  getCascadeChildIds(restoredRecord: any): { taskIds: string[]; subtaskIds: string[] } {
    const taskIds = restoredRecord.tasks?.map((t: any) => t.id) || [];
    const subtaskIds =
      restoredRecord.tasks?.flatMap((t: any) => t.subtasks?.map((s: any) => s.id) || []) || [];
    return { taskIds, subtaskIds };
  }

  /**
   * Restore record with cascade in data map
   */
  restoreRecordWithCascade(
    data: ArchiveDataMap,
    table: string,
    restoredRecord: any,
    recordId: string
  ): ArchiveDataMap {
    const updated = { ...data };
    const tableData = updated[table] || [];
    updated[table] = tableData.map((r: any) => (r.id === recordId ? restoredRecord : r));

    if (table === "todos") {
      const { taskIds, subtaskIds } = this.getCascadeChildIds(restoredRecord);
      const existingTasks = data["tasks"] || [];
      const existingSubtasks = data["subtasks"] || [];
      const existingComments = data["comments"] || [];
      const existingChats = data["chats"] || [];

      const newTasks = restoredRecord.tasks || [];
      const newSubtasks = newTasks.flatMap((t: any) => t.subtasks || []);
      const newComments = newSubtasks.flatMap((s: any) => s.comments || []);

      updated["tasks"] = [
        ...existingTasks.filter((t: any) => !taskIds.includes(t.id)),
        ...newTasks,
      ];
      updated["subtasks"] = [
        ...existingSubtasks.filter((s: any) => !subtaskIds.includes(s.id)),
        ...newSubtasks,
      ];
      updated["comments"] = [
        ...existingComments.filter(
          (c: any) => c.todo_id !== recordId && !taskIds.includes(c.task_id)
        ),
        ...newComments,
      ];
      updated["chats"] = [...existingChats.filter((c: any) => c.todo_id !== recordId)];
    }

    return updated;
  }
}
