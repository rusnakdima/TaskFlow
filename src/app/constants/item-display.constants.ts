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
  { key: "checkbox", type: "checkbox", width: "40px" },
  {
    key: "title",
    type: "title",
    editable: true,
    getClass: () => "flex-1 min-w-0",
  },
  {
    key: "description",
    type: "description",
    getClass: () => "text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1",
  },
  {
    key: "priority",
    type: "priority-badge",
    getChipColor: (item: Todo) =>
      PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "",
  },
  { key: "end_date", type: "date" },
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
  { key: "checkbox", type: "checkbox", width: "40px" },
  {
    key: "title",
    type: "title",
    editable: true,
    getClass: (item: Task) =>
      item.status === TaskStatus.COMPLETED ? "line-through opacity-60" : "flex-1 min-w-0",
  },
  {
    key: "description",
    type: "description",
    getClass: () => "text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1",
  },
  {
    key: "priority",
    type: "priority-badge",
    getChipColor: (item: Task) =>
      PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "",
  },
  {
    key: "status",
    type: "status-toggle",
    toggleable: true,
    getChipColor: (item: Task) => STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] || "",
  },
  {
    key: "blocked",
    type: "chip",
    showIf: (item: Task) => !!item.depends_on?.length,
    getChipColor: () => "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    getDisplayValue: () => "Blocked",
  },
  {
    key: "subtasks",
    type: "subtasks-count",
    getDisplayValue: (item: Task) => {
      if (!item.subtasks?.length) return "No subtasks";
      const completed = item.subtasks.filter(
        (s: Subtask) => s.status === TaskStatus.COMPLETED
      ).length;
      return `${completed}/${item.subtasks.length} subtasks`;
    },
  },
  { key: "end_date", type: "date" },
  { key: "expand-toggle", type: "expand-toggle", width: "32px" },
  {
    key: "github-issue",
    type: "actions",
    showIf: () => false,
    getClass: () => ActionColors.github_issue,
  },
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
    key: "priority",
    type: "priority-badge",
    getChipColor: (item: Subtask) =>
      PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "",
  },
  {
    key: "status",
    type: "status-toggle",
    toggleable: true,
    getChipColor: (item: Subtask) => STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] || "",
  },
  { key: "start_date", type: "date" },
  { key: "end_date", type: "date" },
  {
    key: "actions",
    type: "actions",
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
    key: "description",
    type: "description",
    getClass: () => "text-xs line-clamp-2 mt-1",
  },
  {
    key: "priority",
    type: "priority-badge",
    getChipColor: (item: Task) =>
      PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "",
  },
  {
    key: "due-date",
    type: "date",
    getValue: (item: Task) => item.end_date,
    showIf: (item: Task) => !!item.end_date,
  },
  {
    key: "subtasks-count",
    type: "subtasks-count",
    getDisplayValue: (item: Task) => {
      const total = item.subtasks?.length || 0;
      const completed =
        item.subtasks?.filter((s: Subtask) => s.status === TaskStatus.COMPLETED).length || 0;
      return `${completed}/${total}`;
    },
  },
  {
    key: "status-toggle",
    type: "status-toggle",
    toggleable: true,
    getChipColor: (item: Task) => STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] || "",
  },
];

export const CATEGORY_CARD_CONFIG: ItemDisplayConfig[] = [
  { key: "checkbox", type: "checkbox", width: "40px" },
  {
    key: "title",
    type: "title",
    editable: true,
    getClass: () => "flex-1 min-w-0",
  },
  {
    key: "created_at",
    type: "date",
    label: "Created",
  },
  {
    key: "updated_at",
    type: "date",
    label: "Updated",
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
