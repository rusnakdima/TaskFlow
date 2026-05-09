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
  { key: "drag-handle", type: "drag-handle", width: "32px" },
  { key: "checkbox", type: "checkbox", width: "40px" },
  {
    key: "title",
    type: "title",
    editable: true,
    getClass: () => "flex-1 min-w-0",
  },
  {
    key: "status-badge",
    type: "status-badge",
    getChipColor: () => "",
  },
  {
    key: "priority-badge",
    type: "priority-badge",
    getChipColor: (item: Todo) =>
      PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "",
  },
  { key: "expand-toggle", type: "expand-toggle", width: "32px" },
  {
    key: "menu",
    type: "menu",
    getClass: () => ActionColors.default,
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
  { key: "drag-handle", type: "drag-handle", width: "32px" },
  { key: "checkbox", type: "checkbox", width: "40px" },
  {
    key: "title",
    type: "title",
    editable: true,
    getClass: (item: Task) =>
      item.status === TaskStatus.COMPLETED ? "line-through opacity-60" : "flex-1 min-w-0",
  },
  {
    key: "status-badge",
    type: "status-badge",
    getChipColor: (item: Task) => STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] || "",
  },
  {
    key: "priority-badge",
    type: "priority-badge",
    getChipColor: (item: Task) =>
      PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "",
  },
  { key: "expand-toggle", type: "expand-toggle", width: "32px" },
  {
    key: "menu",
    type: "menu",
    getClass: () => ActionColors.default,
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
  { key: "drag-handle", type: "drag-handle", width: "32px" },
  { key: "checkbox", type: "checkbox", width: "40px" },
  {
    key: "title",
    type: "title",
    editable: true,
    getClass: (item: Subtask) =>
      [TaskStatus.COMPLETED, TaskStatus.SKIPPED, TaskStatus.FAILED].includes(item.status)
        ? "line-through opacity-60"
        : "flex-1 min-w-0",
  },
  {
    key: "status-badge",
    type: "status-badge",
    getChipColor: (item: Subtask) => STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] || "",
  },
  {
    key: "priority-badge",
    type: "priority-badge",
    getChipColor: (item: Subtask) =>
      PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "",
  },
  { key: "expand-toggle", type: "expand-toggle", width: "32px" },
  {
    key: "menu",
    type: "menu",
    getClass: () => ActionColors.default,
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
  { key: "checkbox", type: "checkbox", width: "40px" },
  {
    key: "title",
    type: "title",
    editable: true,
    getClass: (item: Task) =>
      [TaskStatus.COMPLETED, TaskStatus.SKIPPED, TaskStatus.FAILED].includes(item.status)
        ? "line-through opacity-60 text-gray-500 dark:text-gray-400"
        : "line-clamp-2 text-sm font-medium",
  },
  {
    key: "priority-badge",
    type: "priority-badge",
    getChipColor: (item: Task) =>
      PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "",
  },
  {
    key: "status-badge",
    type: "status-badge",
    getChipColor: (item: Task) => STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] || "",
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
  },
  {
    key: "menu",
    type: "menu",
    getClass: () => ActionColors.default,
  },
];

export const CATEGORY_CARD_CONFIG: ItemDisplayConfig[] = [
  { key: "drag-handle", type: "drag-handle", width: "32px" },
  { key: "checkbox", type: "checkbox", width: "40px" },
  {
    key: "title",
    type: "title",
    editable: true,
    getClass: () => "flex-1 min-w-0",
  },
  {
    key: "menu",
    type: "menu",
    getClass: () => ActionColors.default,
  },
];

export const CATEGORY_TABLE_CONFIG: ItemDisplayConfig[] = [
  { key: "checkbox", type: "checkbox", width: "40px" },
  {
    key: "title",
    type: "title",
    sortable: true,
    getClass: () => "flex-1 min-w-0",
  },
  {
    key: "created_at",
    type: "date",
    label: "Created",
    sortable: true,
  },
  {
    key: "updated_at",
    type: "date",
    label: "Updated",
    sortable: true,
  },
  {
    key: "actions",
    type: "actions",
    getClass: () => ActionColors.default,
  },
];
