export const TableFieldColors = {
  boolean: {
    true: "text-green-600",
    false: "text-gray-400",
  },
  change: {
    positive: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    negative: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    neutral: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  },
} as const;

export const TableFieldIcons = {
  boolean: {
    true: "check_circle",
    false: "cancel",
  },
  change: {
    positive: "trending_up",
    negative: "trending_down",
    neutral: "remove",
  },
} as const;

export const TableActionColors = {
  default: "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700",
  edit: "text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30",
  delete: "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30",
  confirm: "text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/30",
  expand: "text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/30",
  archive: "text-yellow-600 hover:bg-yellow-50 dark:text-yellow-400 dark:hover:bg-yellow-900/30",
} as const;
