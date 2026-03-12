/**
 * Pending operation for optimistic updates
 * Used to track operations that are in progress
 */
export interface PendingOperation {
  id: string;
  type: "create" | "update" | "delete";
  entityType: string;
  entityId: string;
  originalData?: any;
  newData?: any;
  tempId?: string; // For creates, maps temp ID to real ID
  timestamp: number;
}
