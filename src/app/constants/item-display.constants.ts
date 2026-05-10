import { ItemDisplayConfig } from "@models/item-display.model";
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import {
  ActionColors,
  PRIORITY_COLORS,
  STATUS_COLORS,
  TABLE_ACTIONS,
} from "./table-field.constants";

export const DEFAULT_ACTIONS = [
  TABLE_ACTIONS.EDIT,
  TABLE_ACTIONS.DELETE,
  TABLE_ACTIONS.ARCHIVE,
  TABLE_ACTIONS.RESTORE,
];

export const TODO_CARD_CONFIG: ItemDisplayConfig[] = [
  { key: "drag-handle", type: "drag-handle", width: "32px", line: 1 },
  { key: "checkbox", type: "checkbox", width: "40px", line: 1 },
  {
    key: "title",
    type: "title",
    editable: true,
    getClass: () => "flex-1 min-w-0",
    line: 1,
  },
  {
    key: "priority-badge",
    type: "priority-badge",
    getValue: (item: Todo) => item.priority,
    getChipColor: (item: Todo) =>
      PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "",
    line: 2,
  },
  { key: "expand-toggle", type: "expand-toggle", width: "32px", line: 2 },
  {
    key: "menu",
    type: "menu",
    getClass: () => ActionColors.default,
    line: 1,
  },
];

export const TODO_TABLE_CONFIG: ItemDisplayConfig[] = [
  {
    key: "drag-handle",
    type: "drag-handle",
    width: "32px",
    showIf: () => false,
  },
  { key: "checkbox", type: "checkbox", width: "40px" },
  {
    key: "title",
    type: "title",
    sortable: true,
    getClass: () => "flex-1 min-w-0",
  },
  {
    key: "priority",
    type: "priority-badge",
    getChipColor: (item: Todo) =>
      PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "",
  },
  {
    key: "actions",
    type: "actions",
    getClass: () => ActionColors.default,
  },
];

export const TASK_CARD_CONFIG: ItemDisplayConfig[] = [
  { key: "drag-handle", type: "drag-handle", width: "32px", line: 1 },
  { key: "checkbox", type: "checkbox", width: "40px", line: 1 },
  {
    key: "title",
    type: "title",
    editable: true,
    getClass: (item: Task) =>
      item.status === TaskStatus.COMPLETED ? "line-through opacity-60" : "flex-1 min-w-0",
    line: 1,
  },
  {
    key: "status-badge",
    type: "status-badge",
    getValue: (item: Task) => item.status,
    getChipColor: (item: Task) => STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] || "",
    line: 2,
  },
  {
    key: "priority-badge",
    type: "priority-badge",
    getValue: (item: Task) => item.priority,
    getChipColor: (item: Task) =>
      PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "",
    line: 2,
  },
  { key: "comment-toggle", type: "comment-toggle", width: "32px", line: 2 },
  { key: "expand-toggle", type: "expand-toggle", width: "32px", line: 2 },
  {
    key: "menu",
    type: "menu",
    getClass: () => ActionColors.default,
    line: 1,
  },
];

export const TASK_TABLE_CONFIG: ItemDisplayConfig[] = [
  {
    key: "drag-handle",
    type: "drag-handle",
    width: "32px",
    getClass: () => ActionColors.dragHandle,
  },
  { key: "checkbox", type: "checkbox", width: "40px" },
  {
    key: "title",
    type: "title",
    sortable: true,
    getClass: (item: Task) =>
      item.status === TaskStatus.COMPLETED ? "line-through opacity-60" : "flex-1 min-w-0",
  },
  {
    key: "priority",
    type: "priority-badge",
    getChipColor: (item: Task) =>
      PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "",
  },
  {
    key: "status",
    type: "status-badge",
    getChipColor: (item: Task) => STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] || "",
  },
  {
    key: "subtasks-count",
    type: "number",
    getDisplayValue: (item: Task) =>
      `${item.subtasks?.filter((s: Subtask) => s.status === TaskStatus.COMPLETED).length || 0}/${item.subtasks?.length || 0}`,
  },
  {
    key: "actions",
    type: "actions",
    getClass: () => ActionColors.default,
  },
];

export const SUBTASK_CARD_CONFIG: ItemDisplayConfig[] = [
  { key: "drag-handle", type: "drag-handle", width: "32px", line: 1 },
  { key: "checkbox", type: "checkbox", width: "40px", line: 1 },
  {
    key: "title",
    type: "title",
    editable: true,
    getClass: (item: Subtask) =>
      [TaskStatus.COMPLETED, TaskStatus.SKIPPED, TaskStatus.FAILED].includes(item.status)
        ? "line-through opacity-60"
        : "flex-1 min-w-0",
    line: 1,
  },
  {
    key: "status-badge",
    type: "status-badge",
    getValue: (item: Subtask) => item.status,
    getChipColor: (item: Subtask) => STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] || "",
    line: 2,
  },
  {
    key: "priority-badge",
    type: "priority-badge",
    getValue: (item: Subtask) => item.priority,
    getChipColor: (item: Subtask) =>
      PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "",
    line: 2,
  },
  { key: "expand-toggle", type: "expand-toggle", width: "32px", line: 2 },
  {
    key: "menu",
    type: "menu",
    getClass: () => ActionColors.default,
    line: 1,
  },
];

export const SUBTASK_TABLE_CONFIG: ItemDisplayConfig[] = [
  { key: "checkbox", type: "checkbox", width: "40px" },
  {
    key: "title",
    type: "title",
    sortable: true,
    getClass: (item: Subtask) =>
      [TaskStatus.COMPLETED, TaskStatus.SKIPPED, TaskStatus.FAILED].includes(item.status)
        ? "line-through opacity-60"
        : "flex-1 min-w-0",
  },
  {
    key: "priority",
    type: "priority-badge",
    getChipColor: (item: Subtask) =>
      PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "",
  },
  {
    key: "status",
    type: "status-badge",
    getChipColor: (item: Subtask) => STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] || "",
  },
  {
    key: "actions",
    type: "actions",
    getClass: () => ActionColors.default,
  },
];

export const KANBAN_TASK_CONFIG: ItemDisplayConfig[] = [
  { key: "checkbox", type: "checkbox", width: "40px", line: 1 },
  {
    key: "title",
    type: "title",
    editable: true,
    getClass: (item: Task) =>
      [TaskStatus.COMPLETED, TaskStatus.SKIPPED, TaskStatus.FAILED].includes(item.status)
        ? "line-through opacity-60 text-gray-500 dark:text-gray-400"
        : "line-clamp-2 text-sm font-medium",
    line: 1,
  },
  {
    key: "priority-badge",
    type: "priority-badge",
    getValue: (item: Task) => item.priority,
    getChipColor: (item: Task) =>
      PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "",
    line: 2,
  },
  {
    key: "status-badge",
    type: "status-badge",
    getValue: (item: Task) => item.status,
    getChipColor: (item: Task) => STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] || "",
    line: 2,
  },
  {
    key: "subtasks-count",
    type: "number",
    getDisplayValue: (item: Task) => {
      const total = item.subtasks?.length || 0;
      const completed =
        item.subtasks?.filter((s: Subtask) => s.status === TaskStatus.COMPLETED).length || 0;
      return `${completed}/${total}`;
    },
    line: 2,
  },
  { key: "expand-toggle", type: "expand-toggle", width: "32px", line: 2 },
  {
    key: "menu",
    type: "menu",
    getClass: () => ActionColors.default,
    line: 1,
  },
];

export const CATEGORY_CARD_CONFIG: ItemDisplayConfig[] = [
  { key: "drag-handle", type: "drag-handle", width: "32px", line: 1 },
  { key: "checkbox", type: "checkbox", width: "40px", line: 1 },
  {
    key: "title",
    type: "title",
    editable: true,
    getClass: () => "flex-1 min-w-0",
    line: 1,
  },
  {
    key: "menu",
    type: "menu",
    getClass: () => ActionColors.default,
    line: 1,
  },
];

export const CATEGORY_TABLE_CONFIG: ItemDisplayConfig[] = [
  { key: "checkbox", type: "checkbox", width: "40px" },
  {
    key: "title",
    type: "title",
    sortable: true,
    getClass: () => "flex-1 min-w-0",
    line: 1,
  },
  {
    key: "menu",
    type: "menu",
    getClass: () => ActionColors.default,
    line: 1,
  },
];

export const ADMIN_CARD_CONFIG: ItemDisplayConfig[] = [
  { key: "checkbox", type: "checkbox", width: "40px", line: 1 },
  {
    key: "title",
    type: "title",
    getClass: () => "flex-1 min-w-0",
    line: 1,
  },
  {
    key: "menu",
    type: "menu",
    getClass: () => ActionColors.default,
    line: 1,
  },
  {
    key: "priority-badge",
    type: "priority-badge",
    getValue: (item: any) => item.priority,
    getChipColor: (item: any) =>
      item.priority ? PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "" : "",
    line: 2,
  },
  {
    key: "status-badge",
    type: "status-badge",
    getValue: (item: any) => item.status,
    getChipColor: () => "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    line: 2,
  },
  {
    key: "deleted-badge",
    type: "deleted-badge",
    line: 2,
  },
  {
    key: "badge-group",
    type: "badge-group",
    line: 2,
  },
  { key: "expand-toggle", type: "expand-toggle", width: "32px", line: 2 },
];
