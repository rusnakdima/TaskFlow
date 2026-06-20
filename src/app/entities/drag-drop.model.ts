import { Task, TaskStatus } from "./generated/api.types";
export interface KanbanColumn {
  id: string;
  title: string;
  status: TaskStatus;
  colorClass: string;
  tasks: Task[];
}
export interface Orderable {
  id: string;
  order: number;
  parentId?: string;
}
export interface ReorderResult<T> {
  items?: T[];
  updated?: T[];
  moved?: string[];
  itemsToUpdate?: T[];
  movedItemId?: string;
  oldIndex?: number;
  newIndex?: number;
}
export interface DragDropHandlers<T> {
  onDragStart?: (item: T) => void;
  onDragEnd?: (item: T) => void;
  onDrop?: (item: T, target: T) => void;
}
