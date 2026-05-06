import { TaskStatus } from "@models/task.model";

export const TableFieldColors = {
  boolean: {
    true: "text-green-600!",
    false: "text-gray-400!",
  },
  change: {
    positive: "bg-green-100! text-green-700! dark:bg-green-900/30! dark:text-green-300!",
    negative: "bg-red-100! text-red-700! dark:bg-red-900/30! dark:text-red-300!",
    neutral: "bg-gray-100! text-gray-700! dark:bg-gray-700! dark:text-gray-300!",
  },
} as const;

export const TableFieldIcons = {
  boolean: {
    true: "check_circle",
    false: "radio_button_unchecked",
  },
  change: {
    positive: "trending_up",
    negative: "trending_down",
    neutral: "trending_flat",
  },
} as const;

export const TableActionColors = {
  default: "text-gray-500! hover:text-gray-700! dark:text-gray-400! dark:hover:text-gray-200!",
  edit: "text-blue-600! hover:text-blue-700! dark:text-blue-400! dark:hover:text-blue-300!",
  delete: "text-red-600! hover:text-red-700! dark:text-red-400! dark:hover:text-red-300!",
  confirm: "text-green-600! hover:text-green-700! dark:text-green-400! dark:hover:text-green-300!",
  expand:
    "text-purple-600! hover:text-purple-700! dark:text-purple-400! dark:hover:text-purple-300!",
  archive:
    "text-yellow-600! hover:text-yellow-700! dark:text-yellow-400! dark:hover:text-yellow-300!",
  restore:
    "text-yellow-600! hover:text-yellow-700! dark:text-yellow-400! dark:hover:text-yellow-300!",
  view: "text-purple-600! hover:text-purple-700! dark:text-purple-400! dark:hover:text-purple-300!",
} as const;

export const PRIORITY_COLORS = {
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
} as const;

export const PRIORITY_ICONS = {
  low: "keyboard_arrow_down",
  medium: "remove",
  high: "keyboard_arrow_up",
} as const;

export const STATUS_COLORS = {
  [TaskStatus.PENDING]: "text-gray-400",
  [TaskStatus.COMPLETED]: "text-green-600 dark:text-green-400",
  [TaskStatus.SKIPPED]: "text-orange-600 dark:text-orange-400",
  [TaskStatus.FAILED]: "text-red-600 dark:text-red-400",
} as const;

export const STATUS_ICONS = {
  [TaskStatus.PENDING]: "radio_button_unchecked",
  [TaskStatus.COMPLETED]: "check_circle",
  [TaskStatus.SKIPPED]: "cancel",
  [TaskStatus.FAILED]: "dangerous",
} as const;

export const STATUS_COLUMN_COLORS = {
  [TaskStatus.PENDING]:
    "bg-linear-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700",
  [TaskStatus.COMPLETED]:
    "bg-linear-to-r from-green-500 to-green-600 dark:from-green-600 dark:to-green-700",
  [TaskStatus.SKIPPED]:
    "bg-linear-to-r from-yellow-500 to-yellow-600 dark:from-yellow-600 dark:to-yellow-700",
  [TaskStatus.FAILED]: "bg-linear-to-r from-red-500 to-red-600 dark:from-red-600 dark:to-red-700",
} as const;

export const STATUS_BG_COLORS = {
  [TaskStatus.PENDING]: "bg-blue-500",
  [TaskStatus.COMPLETED]: "bg-green-500",
  [TaskStatus.SKIPPED]: "bg-yellow-500",
  [TaskStatus.FAILED]: "bg-red-500",
} as const;

export const DELETED_CHIP_COLORS = {
  deleted: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
} as const;

export const TABLE_CARD_COLORS = {
  priority: PRIORITY_COLORS,
  priorityIcons: PRIORITY_ICONS,
  status: STATUS_COLORS,
  statusIcons: STATUS_ICONS,
  statusColumn: STATUS_COLUMN_COLORS,
  statusBg: STATUS_BG_COLORS,
} as const;

export const TABLE_COLUMNS = {
  todos: [
    { key: "title", label: "Title", type: "text", sortable: true },
    { key: "user_id", label: "User", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "description", label: "Description", type: "text", sortable: true },
    { key: "start_date", label: "Start Date", type: "date", sortable: true },
    { key: "end_date", label: "End Date", type: "date", sortable: true },
    { key: "visibility", label: "Visibility", type: "chip", sortable: true },
    { key: "categories", label: "Categories", type: "array-count", sortable: false },
    {
      key: "deleted_at",
      label: "Status",
      type: "chip",
      sortable: true,
      getChipColor: () => "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      getChipText: (item: any) => (item?.deleted_at ? "DELETED" : ""),
    },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
  tasks: [
    { key: "title", label: "Title", type: "text", sortable: true },
    { key: "todo_id", label: "Todo", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "status", label: "Status", type: "status", sortable: true },
    { key: "description", label: "Description", type: "text", sortable: true },
    { key: "start_date", label: "Start Date", type: "date", sortable: true },
    { key: "end_date", label: "End Date", type: "date", sortable: true },
    {
      key: "deleted_at",
      label: "Status",
      type: "chip",
      sortable: true,
      getChipColor: () => "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      getChipText: (item: any) => (item?.deleted_at ? "DELETED" : ""),
    },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
  subtasks: [
    { key: "title", label: "Title", type: "text", sortable: true },
    { key: "task_id", label: "Task", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "status", label: "Status", type: "status", sortable: true },
    { key: "description", label: "Description", type: "text", sortable: true },
    { key: "start_date", label: "Start Date", type: "date", sortable: true },
    { key: "end_date", label: "End Date", type: "date", sortable: true },
    {
      key: "deleted_at",
      label: "Status",
      type: "chip",
      sortable: true,
      getChipColor: () => "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      getChipText: (item: any) => (item?.deleted_at ? "DELETED" : ""),
    },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
  comments: [
    { key: "content", label: "Content", type: "text", sortable: true },
    { key: "user_id", label: "User", type: "text", sortable: true },
    { key: "task_id", label: "Task", type: "text", sortable: true },
    { key: "subtask_id", label: "Subtask", type: "text", sortable: true },
    {
      key: "deleted_at",
      label: "Status",
      type: "chip",
      sortable: true,
      getChipColor: () => "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      getChipText: (item: any) => (item?.deleted_at ? "DELETED" : ""),
    },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
  chats: [
    { key: "content", label: "Message", type: "text", sortable: true },
    { key: "user_id", label: "User", type: "text", sortable: true },
    { key: "todo_id", label: "Todo", type: "text", sortable: true },
    { key: "read_by", label: "Read By", type: "array-count", sortable: false },
    {
      key: "deleted_at",
      label: "Status",
      type: "chip",
      sortable: true,
      getChipColor: () => "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      getChipText: (item: any) => (item?.deleted_at ? "DELETED" : ""),
    },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
  categories: [
    { key: "title", label: "Title", type: "text", sortable: true },
    { key: "user_id", label: "User", type: "text", sortable: true },
    {
      key: "deleted_at",
      label: "Status",
      type: "chip",
      sortable: true,
      getChipColor: () => "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      getChipText: (item: any) => (item?.deleted_at ? "DELETED" : ""),
    },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
  daily_activities: [
    { key: "date", label: "Date", type: "date", sortable: true },
    { key: "user_id", label: "User", type: "text", sortable: true },
    { key: "todos_created", label: "Todos Created", type: "number", sortable: true },
    { key: "tasks_completed", label: "Tasks Done", type: "number", sortable: true },
    { key: "productivity_score", label: "Score", type: "number", sortable: true },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
} as const;

export const ARCHIVE_COLUMNS = {
  todos: [
    { key: "title", label: "Title", type: "text", sortable: true },
    { key: "user_id", label: "User", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "description", label: "Description", type: "text", sortable: true },
    { key: "start_date", label: "Start Date", type: "date", sortable: true },
    { key: "end_date", label: "End Date", type: "date", sortable: true },
    { key: "visibility", label: "Visibility", type: "chip", sortable: true },
    { key: "categories", label: "Categories", type: "array-count", sortable: false },
    { key: "deleted_at", label: "Deleted At", type: "datetime", sortable: true },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
  tasks: [
    { key: "title", label: "Title", type: "text", sortable: true },
    { key: "todo_id", label: "Todo", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "status", label: "Status", type: "status", sortable: true },
    { key: "description", label: "Description", type: "text", sortable: true },
    { key: "start_date", label: "Start Date", type: "date", sortable: true },
    { key: "end_date", label: "End Date", type: "date", sortable: true },
    { key: "deleted_at", label: "Deleted At", type: "datetime", sortable: true },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
  subtasks: [
    { key: "title", label: "Title", type: "text", sortable: true },
    { key: "task_id", label: "Task", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "status", label: "Status", type: "status", sortable: true },
    { key: "description", label: "Description", type: "text", sortable: true },
    { key: "start_date", label: "Start Date", type: "date", sortable: true },
    { key: "end_date", label: "End Date", type: "date", sortable: true },
    { key: "deleted_at", label: "Deleted At", type: "datetime", sortable: true },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
  comments: [
    { key: "content", label: "Content", type: "text", sortable: true },
    { key: "user_id", label: "User", type: "text", sortable: true },
    { key: "task_id", label: "Task", type: "text", sortable: true },
    { key: "subtask_id", label: "Subtask", type: "text", sortable: true },
    { key: "deleted_at", label: "Deleted At", type: "datetime", sortable: true },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
  chats: [
    { key: "content", label: "Message", type: "text", sortable: true },
    { key: "user_id", label: "User", type: "text", sortable: true },
    { key: "todo_id", label: "Todo", type: "text", sortable: true },
    { key: "read_by", label: "Read By", type: "array-count", sortable: false },
    { key: "deleted_at", label: "Deleted At", type: "datetime", sortable: true },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
  categories: [
    { key: "title", label: "Title", type: "text", sortable: true },
    { key: "user_id", label: "User", type: "text", sortable: true },
    { key: "deleted_at", label: "Deleted At", type: "datetime", sortable: true },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
  daily_activities: [
    { key: "date", label: "Date", type: "date", sortable: true },
    { key: "user_id", label: "User", type: "text", sortable: true },
    { key: "todos_created", label: "Todos Created", type: "number", sortable: true },
    { key: "tasks_completed", label: "Tasks Done", type: "number", sortable: true },
    { key: "productivity_score", label: "Score", type: "number", sortable: true },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
} as const;

export const TABLE_BUTTON_COLORS = {
  restore:
    "text-yellow-600! hover:text-yellow-700! dark:text-yellow-400! dark:hover:text-yellow-300!",
  archive:
    "text-yellow-600! hover:text-yellow-700! dark:text-yellow-400! dark:hover:text-yellow-300!",
  delete: "text-red-600! hover:text-red-700! dark:text-red-400! dark:hover:text-red-300!",
  default: "text-gray-500! hover:text-gray-700! dark:text-gray-400! dark:hover:text-gray-200!",
} as const;
