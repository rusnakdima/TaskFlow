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
    true: "text-green-600!",
    false: "text-gray-400!",
  },
  change: {
    positive: "text-green-600!",
    negative: "text-red-600!",
    neutral: "text-gray-500!",
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

export const TABLE_COLUMNS = {
  todos: [
    { key: "title", label: "Title", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "status", label: "Status", type: "status", sortable: true },
    { key: "visibility", label: "Visibility", type: "chip", sortable: true },
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
  tasks: [
    { key: "title", label: "Title", type: "text", sortable: true },
    { key: "todo_id", label: "Todo", type: "text", sortable: true },
    { key: "priority", label: "Priority", type: "priority", sortable: true },
    { key: "status", label: "Status", type: "status", sortable: true },
    { key: "visibility", label: "Visibility", type: "chip", sortable: true },
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
  subtasks: [
    { key: "title", label: "Title", type: "text", sortable: true },
    { key: "task_id", label: "Task", type: "text", sortable: true },
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
    { key: "commentable_type", label: "Type", type: "text", sortable: true },
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
  chats: [
    { key: "title", label: "Title", type: "text", sortable: true },
    { key: "message_count", label: "Messages", type: "text", sortable: true },
    { key: "last_message_at", label: "Last Message", type: "datetime", sortable: true },
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
  categories: [
    { key: "name", label: "Name", type: "text", sortable: true },
    { key: "color", label: "Color", type: "chip", sortable: true },
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
  daily_activities: [
    { key: "activity_type", label: "Activity", type: "text", sortable: true },
    { key: "description", label: "Description", type: "text", sortable: true },
    { key: "user_id", label: "User", type: "text", sortable: true },
    { key: "subject_type", label: "Subject", type: "text", sortable: true },
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
