export const TableFieldColors = {
  boolean: {
    true: "!text-green-600",
    false: "!text-gray-400",
  },
  change: {
    positive: "!bg-green-100 !text-green-700 dark:!bg-green-900/30 dark:!text-green-300",
    negative: "!bg-red-100 !text-red-700 dark:!bg-red-900/30 dark:!text-red-300",
    neutral: "!bg-gray-100 !text-gray-700 dark:!bg-gray-700 dark:!text-gray-300",
  },
} as const;

export const TableFieldIcons = {
  boolean: {
    true: "!text-green-600",
    false: "!text-gray-400",
  },
  change: {
    positive: "!text-green-600",
    negative: "!text-red-600",
    neutral: "!text-gray-500",
  },
} as const;

export const TableActionColors = {
  default: "!text-gray-500 hover:!text-gray-700 dark:!text-gray-400 dark:hover:!text-gray-200",
  edit: "!text-blue-600 hover:!text-blue-700 dark:!text-blue-400 dark:hover:!text-blue-300",
  delete: "!text-red-600 hover:!text-red-700 dark:!text-red-400 dark:hover:!text-red-300",
  confirm: "!text-green-600 hover:!text-green-700 dark:!text-green-400 dark:hover:!text-green-300",
  expand:
    "!text-purple-600 hover:!text-purple-700 dark:!text-purple-400 dark:hover:!text-purple-300",
  archive:
    "!text-yellow-600 hover:!text-yellow-700 dark:!text-yellow-400 dark:hover:!text-yellow-300",
  restore:
    "!text-yellow-600 hover:!text-yellow-700 dark:!text-yellow-400 dark:hover:!text-yellow-300",
  view: "!text-purple-600 hover:!text-purple-700 dark:!text-purple-400 dark:hover:!text-purple-300",
} as const;
