export const LOG_BUFFER_SIZE = 100;
export const LOG_FLUSH_INTERVAL = 5000;

export const SMILEYS_EMOJIS = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😆",
  "😅",
  "🤣",
  "😂",
  "🙂",
  "🙃",
  "😉",
  "😊",
  "😇",
  "🥰",
  "😍",
  "🤩",
  "😘",
  "😗",
  "☺️",
  "😚",
  "😋",
  "😛",
  "😜",
  "🤪",
  "😝",
  "🤑",
  "🤗",
  "🤭",
  "🤫",
  "🤔",
  "🤐",
  "🤨",
  "😐",
  "😑",
  "😶",
  "😏",
  "😒",
  "🙄",
  "😬",
  "🤥",
  "😌",
  "😔",
  "😪",
  "🤤",
  "😴",
  "😷",
  "🤒",
  "🤕",
];

export const GESTURES_EMOJIS = [
  "👋",
  "🤚",
  "🖐️",
  "✋",
  "🖖",
  "👌",
  "🤌",
  "🤏",
  "✌️",
  "🤞",
  "🤟",
  "🤘",
  "🤙",
  "👈",
  "👉",
  "👆",
  "🖕",
  "👇",
  "☝️",
  "👍",
  "👎",
  "✊",
  "👊",
  "🤛",
  "🤜",
  "👏",
  "🙌",
  "👐",
  "🤲",
  "🤝",
  "🙏",
  "✍️",
  "💅",
  "🤳",
  "💪",
  "🦾",
  "🦿",
  "🦵",
  "🦶",
  "👂",
  "🦻",
  "👃",
  "🧠",
  "🫀",
  "🫁",
  "🦷",
  "🦴",
  "👀",
  "👁️",
  "👅",
  "👄",
];

export const OBJECTS_EMOJIS = [
  "❤️",
  "🧡",
  "💛",
  "💚",
  "💙",
  "💜",
  "🖤",
  "🤍",
  "💔",
  "❣️",
  "💕",
  "💞",
  "💓",
  "💗",
  "💖",
  "💘",
  "💝",
  "💟",
  "😈",
  "👿",
  "💀",
  "☠️",
  "👻",
  "👽",
  "👾",
  "🤖",
  "💩",
  "😺",
  "😸",
  "😹",
  "😻",
  "😼",
  "😽",
  "🙀",
  "😿",
  "😾",
  "🙈",
  "🙉",
  "🙊",
  "💋",
  "💌",
  "💍",
  "💎",
  "👑",
  "🎮",
  "🎯",
  "🎲",
  "🧩",
  "♟️",
  "🏆",
  "🥇",
];

export const RECENT_EMOJIS_DEFAULT = [
  "😀",
  "😂",
  "😍",
  "🥰",
  "😊",
  "😎",
  "🤔",
  "😅",
  "😭",
  "👍",
  "❤️",
  "🔥",
  "✨",
  "🎉",
  "💯",
  "🙏",
];

import { FilterConfig } from "@entities/filter-config.model";

export const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: "deletedFilter",
    label: "Deleted Status",
    controlType: "select",
    options: [
      { value: "all", label: "All Records" },
      { value: "not_deleted", label: "Not Deleted" },
      { value: "deleted", label: "Deleted" },
    ],
  },
  {
    key: "titleFilter",
    label: "Title",
    controlType: "text",
    placeholder: "Search by title...",
    dataType: ["todos", "tasks", "subtasks", "categories"],
  },
  {
    key: "descriptionFilter",
    label: "Description",
    controlType: "text",
    placeholder: "Search by description...",
    dataType: ["todos", "tasks", "comments", "chats"],
  },
  {
    key: "priorityFilter",
    label: "Priority",
    controlType: "select",
    options: [
      { value: "", label: "All" },
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
      { value: "urgent", label: "Urgent" },
    ],
    dataType: ["todos", "tasks", "subtasks"],
  },
  {
    key: "statusFilter",
    label: "Status",
    controlType: "select",
    options: [
      { value: "all", label: "All" },
      { value: "active", label: "Active" },
      { value: "completed", label: "Completed" },
    ],
    dataType: ["todos"],
  },
  {
    key: "isCompletedFilter",
    label: "Completion",
    controlType: "select",
    options: [
      { value: "all", label: "All" },
      { value: "pending", label: "Pending" },
      { value: "in-progress", label: "In Progress" },
      { value: "completed", label: "Completed" },
      { value: "skipped", label: "Skipped" },
      { value: "failed", label: "Failed" },
      { value: "blocked", label: "Blocked" },
    ],
    dataType: ["tasks", "subtasks"],
  },
  {
    key: "visibilityFilter",
    label: "Visibility",
    controlType: "select",
    options: [
      { value: "all", label: "All" },
      { value: "private", label: "Private" },
      { value: "shared", label: "Shared" },
    ],
    dataType: ["todos"],
  },
  {
    key: "userFilter",
    label: "User",
    controlType: "select",
    dynamicListKey: "userList",
    dataType: ["todos", "tasks", "comments", "chats", "categories", "daily_activities"],
  },
  {
    key: "categoriesFilter",
    label: "Categories",
    controlType: "select",
    dynamicListKey: "categoryList",
    dataType: ["todos"],
  },
  {
    key: "todoIdFilter",
    label: "Project",
    controlType: "select",
    dynamicListKey: "todoList",
    dataType: ["tasks", "chats"],
  },
  {
    key: "taskIdFilter",
    label: "Task",
    controlType: "select",
    dynamicListKey: "taskList",
    dataType: ["subtasks", "comments"],
  },
  {
    key: "subtaskIdFilter",
    label: "Subtask",
    controlType: "select",
    dynamicListKey: "subtaskList",
    dataType: ["comments"],
  },
  {
    key: "startDateFilter",
    label: "Start Date",
    controlType: "date",
    dataType: ["todos", "tasks", "subtasks", "daily_activities"],
  },
  {
    key: "endDateFilter",
    label: "End Date",
    controlType: "date",
    dataType: ["todos", "tasks", "subtasks"],
  },
];

import { TaskStatus } from "@entities/generated/api.types";
import { TodoPermission } from "@core/services/permission.service";

export const TableFieldColors = {
  boolean: { true: "text-green-600!", false: "text-gray-400!" },
  change: {
    positive:
      "bg-transparent! text-green-600! border border-green-500! dark:text-green-400! dark:border-green-400/50!",
    negative:
      "bg-transparent! text-red-600! border border-red-500! dark:text-red-400! dark:border-red-400/50!",
    neutral:
      "bg-transparent! text-gray-600! border border-gray-400! dark:text-gray-400! dark:border-gray-400/50!",
  },
} as const;

export const TableFieldIcons = {
  boolean: { true: "check_circle", false: "radio_button_unchecked" },
  change: { positive: "trending_up", negative: "trending_down", neutral: "trending_flat" },
} as const;

export const ActionColors = {
  default: "text-gray-500! hover:text-gray-700! dark:text-gray-400! dark:hover:text-gray-200!",
  default_disabled: "text-gray-400! dark:text-gray-500!",
  edit: "text-blue-600! hover:text-blue-700! dark:text-blue-400! dark:hover:text-blue-300!",
  edit_disabled: "text-gray-400! dark:text-gray-500!",
  delete: "text-red-600! hover:text-red-700! dark:text-red-400! dark:hover:text-red-300!",
  delete_disabled: "text-gray-400! dark:text-gray-500!",
  confirm: "text-green-600! hover:text-green-700! dark:text-green-400! dark:hover:text-green-300!",
  confirm_disabled: "text-gray-400! dark:text-gray-500!",
  expand:
    "text-purple-600! hover:text-purple-700! dark:text-purple-400! dark:hover:text-purple-300!",
  expand_disabled: "text-gray-400! dark:text-gray-500!",
  archive:
    "text-yellow-600! hover:text-yellow-700! dark:text-yellow-400! dark:hover:text-yellow-300!",
  archive_disabled: "text-yellow-400! dark:text-gray-500!",
  restore:
    "text-yellow-600! hover:text-yellow-700! dark:text-yellow-400! dark:hover:text-yellow-300!",
  restore_disabled: "text-yellow-400! dark:text-gray-500!",
  view: "text-purple-600! hover:text-purple-700! dark:text-purple-400! dark:hover:text-purple-300!",
  view_disabled: "text-gray-400! dark:text-gray-500!",
  github_issue: "text-gray-600! hover:text-gray-700! dark:text-gray-400! dark:hover:text-gray-300!",
  github_issue_disabled: "text-gray-400! dark:text-gray-500!",
  blueprint: "text-teal-600! hover:text-teal-700! dark:text-teal-400! dark:hover:text-teal-300!",
  blueprint_disabled: "text-teal-400! dark:text-gray-500!",
  toggleDelete:
    "text-yellow-600! hover:text-yellow-700! dark:text-yellow-400! dark:hover:text-yellow-300!",
  toggleDelete_disabled: "text-gray-400! dark:text-gray-500!",
  delete_forever: "text-red-600! hover:text-red-700! dark:text-red-400! dark:hover:text-red-300!",
  delete_forever_disabled: "text-gray-400! dark:text-gray-500!",
  toggleComplete:
    "text-blue-600! hover:text-blue-700! dark:text-blue-400! dark:hover:text-blue-300!",
  toggleComplete_disabled: "text-gray-400! dark:text-gray-500!",
  dragHandle: "text-gray-400! hover:text-gray-600! dark:text-gray-500! dark:hover:text-gray-300!",
  moveColumn: "text-gray-500! hover:text-gray-700! dark:text-gray-400! dark:hover:text-gray-200!",
  addSubtask:
    "text-green-600! hover:text-green-700! dark:text-green-400! dark:hover:text-green-300!",
  addSubtask_disabled: "text-gray-400! dark:text-gray-500!",
  viewAllSubtasks:
    "text-purple-600! hover:text-purple-700! dark:text-purple-400! dark:hover:text-purple-300!",
  viewAllSubtasks_disabled: "text-gray-400! dark:text-gray-500!",
  comments: "text-gray-500! hover:text-gray-700! dark:text-gray-400! dark:hover:text-gray-200!",
  comments_disabled: "text-gray-400! dark:text-gray-500!",
  subtaskToggle:
    "text-blue-600! hover:text-blue-700! dark:text-blue-400! dark:hover:text-blue-300!",
  subtaskToggle_disabled: "text-gray-400! dark:text-gray-500!",
  toggleDetails:
    "text-gray-500! hover:text-gray-700! dark:text-gray-400! dark:hover:text-gray-200!",
  toggleDetails_disabled: "text-gray-400! dark:text-gray-500!",
} as const;

export const TABLE_ACTIONS = {
  EDIT: { key: "edit", icon: "edit", label: "Edit", permission: TodoPermission.EDITOR },
  DELETE: { key: "delete", icon: "delete", label: "Delete", permission: TodoPermission.OWNER },
  ARCHIVE: {
    key: "archive",
    icon: "archive",
    label: "Archive",
    permission: TodoPermission.MODERATOR,
  },
  RESTORE: { key: "restore", icon: "restore", label: "Restore", permission: TodoPermission.OWNER },
  BLUEPRINT: {
    key: "blueprint",
    icon: "account_tree",
    label: "Save as Blueprint",
    permission: TodoPermission.OWNER,
  },
  GITHUB_ISSUE: {
    key: "github_issue",
    icon: "bug_report",
    label: "GitHub Issue",
    permission: TodoPermission.EDITOR,
  },
  TOGGLE_DELETE: {
    key: "toggleDelete",
    icon: "archive",
    label: "Archive",
    permission: TodoPermission.OWNER,
  },
  DELETE_FOREVER: {
    key: "delete_forever",
    icon: "delete_forever",
    label: "Permanent Delete",
    permission: TodoPermission.OWNER,
  },
} as const;

export const PRIORITY_COLORS = {
  low: "bg-transparent text-blue-600 border border-blue-500 dark:text-blue-400 dark:border-blue-400/50",
  medium:
    "bg-transparent text-yellow-600 border border-yellow-500 dark:text-yellow-400 dark:border-yellow-400/50",
  high: "bg-transparent text-red-600 border border-red-500 dark:text-red-400 dark:border-red-400/50",
} as const;

export const PRIORITY_ICONS = {
  low: "keyboard_arrow_down",
  medium: "remove",
  high: "keyboard_arrow_up",
} as const;

export const STATUS_COLORS = {
  [TaskStatus.PENDING]: "text-gray-400!",
  [TaskStatus.COMPLETED]: "text-green-600! dark:text-green-400!",
  [TaskStatus.SKIPPED]: "text-orange-600! dark:text-orange-400!",
  [TaskStatus.FAILED]: "text-red-600! dark:text-red-400!",
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

export const STATUS_BUTTON_COLORS = {
  [TaskStatus.PENDING]:
    "bg-transparent text-blue-500 border border-blue-500 hover:bg-blue-500/10 dark:text-blue-400 dark:border-blue-400/50 dark:hover:bg-blue-400/10",
  [TaskStatus.COMPLETED]:
    "bg-transparent text-green-600 border border-green-500 hover:bg-green-500/10 dark:text-green-400 dark:border-green-400/50 dark:hover:bg-green-400/10",
  [TaskStatus.SKIPPED]:
    "bg-transparent text-orange-600 border border-orange-500 hover:bg-orange-500/10 dark:text-orange-400 dark:border-orange-400/50 dark:hover:bg-orange-400/10",
  [TaskStatus.FAILED]:
    "bg-transparent text-red-600 border border-red-500 hover:bg-red-500/10 dark:text-red-400 dark:border-red-400/50 dark:hover:bg-red-400/10",
} as const;

export const STATUS_BUTTON_ICONS = {
  [TaskStatus.PENDING]: "radio_button_unchecked",
  [TaskStatus.COMPLETED]: "check_circle",
  [TaskStatus.SKIPPED]: "cancel",
  [TaskStatus.FAILED]: "dangerous",
} as const;

export const DELETED_CHIP_COLORS = {
  deleted:
    "bg-transparent text-red-600 border border-red-500 dark:text-red-400 dark:border-red-400/50",
  active:
    "bg-transparent text-green-600 border border-green-500 dark:text-green-400 dark:border-green-400/50",
} as const;

export const VISIBILITY_COLORS = {
  private:
    "bg-transparent text-red-600 border border-red-500 dark:text-red-400 dark:border-red-400/50",
  shared:
    "bg-transparent text-yellow-600 border border-yellow-500 dark:text-yellow-400 dark:border-yellow-400/50",
  public:
    "bg-transparent text-green-600 border border-green-500 dark:text-green-400 dark:border-green-400/50",
} as const;

export const TABLE_CARD_COLORS = {
  priority: PRIORITY_COLORS,
  priorityIcons: PRIORITY_ICONS,
  status: STATUS_COLORS,
  statusIcons: STATUS_ICONS,
  statusColumn: STATUS_COLUMN_COLORS,
  statusBg: STATUS_BG_COLORS,
  visibility: VISIBILITY_COLORS,
} as const;

export const TABLE_COLUMNS = {
  todos: [
    { key: "title", label: "Title", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "visibility", label: "Visibility", type: "chip", sortable: true },
    {
      key: "deleted_at",
      label: "Deleted",
      type: "chip",
      sortable: true,
      getChipColor: (item: any) =>
        item?.deleted_at
          ? "bg-transparent text-red-600 border border-red-500 dark:text-red-400 dark:border-red-400/50"
          : "bg-transparent text-green-600 border border-green-500 dark:text-green-400 dark:border-green-400/50",
      getChipText: (item: any) => (item?.deleted_at ? "Yes" : "No"),
    },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
  tasks: [
    { key: "title", label: "Title", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "status", label: "Status", type: "status", sortable: true },
    {
      key: "deleted_at",
      label: "Deleted",
      type: "chip",
      sortable: true,
      getChipColor: (item: any) =>
        item?.deleted_at
          ? "bg-transparent text-red-600 border border-red-500 dark:text-red-400 dark:border-red-400/50"
          : "bg-transparent text-green-600 border border-green-500 dark:text-green-400 dark:border-green-400/50",
      getChipText: (item: any) => (item?.deleted_at ? "Yes" : "No"),
    },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
  subtasks: [
    { key: "title", label: "Title", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "status", label: "Status", type: "status", sortable: true },
    {
      key: "deleted_at",
      label: "Deleted",
      type: "chip",
      sortable: true,
      getChipColor: (item: any) =>
        item?.deleted_at
          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      getChipText: (item: any) => (item?.deleted_at ? "Yes" : "No"),
    },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
  comments: [
    { key: "content", label: "Content", type: "text", sortable: true },
    { key: "user_id", label: "User", type: "text", sortable: true },
    {
      key: "deleted_at",
      label: "Deleted",
      type: "chip",
      sortable: true,
      getChipColor: (item: any) =>
        item?.deleted_at
          ? "bg-transparent text-red-600 border border-red-500 dark:text-red-400 dark:border-red-400/50"
          : "bg-transparent text-green-600 border border-green-500 dark:text-green-400 dark:border-green-400/50",
      getChipText: (item: any) => (item?.deleted_at ? "Yes" : "No"),
    },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
  chats: [
    { key: "content", label: "Message", type: "text", sortable: true },
    { key: "user_id", label: "User", type: "text", sortable: true },
    {
      key: "deleted_at",
      label: "Deleted",
      type: "chip",
      sortable: true,
      getChipColor: (item: any) =>
        item?.deleted_at
          ? "bg-transparent text-red-600 border border-red-500 dark:text-red-400 dark:border-red-400/50"
          : "bg-transparent text-green-600 border border-green-500 dark:text-green-400 dark:border-green-400/50",
      getChipText: (item: any) => (item?.deleted_at ? "Yes" : "No"),
    },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
  categories: [
    { key: "title", label: "Title", type: "text", sortable: true },
    {
      key: "deleted_at",
      label: "Deleted",
      type: "chip",
      sortable: true,
      getChipColor: (item: any) =>
        item?.deleted_at
          ? "bg-transparent text-red-600 border border-red-500 dark:text-red-400 dark:border-red-400/50"
          : "bg-transparent text-green-600 border border-green-500 dark:text-green-400 dark:border-green-400/50",
      getChipText: (item: any) => (item?.deleted_at ? "Yes" : "No"),
    },
    { key: "created_at", label: "Created", type: "datetime", sortable: true },
    { key: "expand", label: "", type: "expand" },
  ],
  daily_activities: [
    { key: "date", label: "Date", type: "date", sortable: true },
    { key: "user_id", label: "User", type: "text", sortable: true },
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

import { ItemDisplayConfig } from "@entities/item-display.model";
import { Todo, Task, Subtask } from "@entities/generated/api.types";

export const DEFAULT_ACTIONS = [
  TABLE_ACTIONS.EDIT,
  TABLE_ACTIONS.DELETE,
  TABLE_ACTIONS.ARCHIVE,
  TABLE_ACTIONS.RESTORE,
];

export const TODO_CARD_CONFIG: ItemDisplayConfig[] = [
  { key: "drag-handle", type: "drag-handle", width: "32px", line: 1 },
  { key: "checkbox", type: "checkbox", width: "40px", line: 1 },
  { key: "title", type: "title", editable: true, getClass: () => "flex-1 min-w-0", line: 1 },
  {
    key: "priority-badge",
    type: "priority-badge",
    getValue: (item: Todo) => item.priority,
    getChipColor: (item: Todo) =>
      PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "",
    line: 2,
  },
  { key: "progress-bar", type: "progress-bar", line: 2, size: "sm" as const },
  { key: "expand-toggle", type: "expand-toggle", width: "32px", line: 3 },
  { key: "menu", type: "menu", getClass: () => ActionColors.default, line: 1 },
];

export const TODO_TABLE_CONFIG: ItemDisplayConfig[] = [
  { key: "drag-handle", type: "drag-handle", width: "32px", showIf: () => false },
  { key: "checkbox", type: "checkbox", width: "40px" },
  { key: "title", type: "title", sortable: true, getClass: () => "flex-1 min-w-0" },
  {
    key: "priority",
    type: "priority-badge",
    getChipColor: (item: Todo) =>
      PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "",
  },
  { key: "actions", type: "actions", getClass: () => ActionColors.default },
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
  { key: "status-toggle", type: "status-toggle", width: "32px", line: 1 },
  { key: "progress-bar", type: "progress-bar", line: 2, size: "sm" as const },
  { key: "comment-toggle", type: "comment-toggle", width: "32px", line: 3 },
  { key: "expand-toggle", type: "expand-toggle", width: "32px", line: 3 },
  { key: "menu", type: "menu", getClass: () => ActionColors.default, line: 3 },
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
  { key: "actions", type: "actions", getClass: () => ActionColors.default },
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
  { key: "status-toggle", type: "status-toggle", width: "32px", line: 1 },
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
  { key: "comment-toggle", type: "comment-toggle", width: "32px", line: 3 },
  { key: "expand-toggle", type: "expand-toggle", width: "32px", line: 3 },
  { key: "menu", type: "menu", getClass: () => ActionColors.default, line: 3 },
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
  { key: "actions", type: "actions", getClass: () => ActionColors.default },
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
    getValue: (item: Subtask) =>
      PRIORITY_COLORS[item.priority as keyof typeof PRIORITY_COLORS] || "",
    line: 2,
  },
  { key: "comment-toggle", type: "comment-toggle", width: "32px", line: 3 },
  { key: "expand-toggle", type: "expand-toggle", width: "32px", line: 3 },
  { key: "menu", type: "menu", getClass: () => ActionColors.default, line: 3 },
];

export const CATEGORY_CARD_CONFIG: ItemDisplayConfig[] = [
  { key: "drag-handle", type: "drag-handle", width: "32px", line: 1 },
  { key: "checkbox", type: "checkbox", width: "40px", line: 1 },
  { key: "title", type: "title", editable: true, getClass: () => "flex-1 min-w-0", line: 1 },
  { key: "menu", type: "menu", getClass: () => ActionColors.default, line: 1 },
  { key: "expand-toggle", type: "expand-toggle", width: "32px", line: 3 },
];

export const CATEGORY_TABLE_CONFIG: ItemDisplayConfig[] = [
  { key: "checkbox", type: "checkbox", width: "40px" },
  { key: "title", type: "title", sortable: true, getClass: () => "flex-1 min-w-0", line: 1 },
  { key: "menu", type: "menu", getClass: () => ActionColors.default, line: 1 },
];

export const ADMIN_CARD_CONFIG: ItemDisplayConfig[] = [
  { key: "checkbox", type: "checkbox", width: "40px", line: 1 },
  { key: "title", type: "title", getClass: () => "flex-1 min-w-0", line: 1 },
  { key: "menu", type: "menu", getClass: () => ActionColors.default, line: 1 },
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
    getChipColor: () =>
      "bg-transparent text-blue-600 border border-blue-500 dark:text-blue-400 dark:border-blue-400/50",
    line: 2,
  },
  { key: "deleted-badge", type: "deleted-badge", line: 2 },
  { key: "badge-group", type: "badge-group", line: 2 },
  { key: "expand-toggle", type: "expand-toggle", width: "32px", line: 2 },
];
