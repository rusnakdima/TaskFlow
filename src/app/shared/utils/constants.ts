/* app:models */
import { TaskStatus } from "@entities/generated/api.types";

/**
 * Status display colors for task status badges
 */
export const STATUS_COLORS = {
  [TaskStatus.PENDING]: "text-gray-400!",
  [TaskStatus.COMPLETED]: "text-green-600! dark:text-green-400!",
  [TaskStatus.SKIPPED]: "text-orange-600! dark:text-orange-400!",
  [TaskStatus.FAILED]: "text-red-600! dark:text-red-400!",
} as const;

/**
 * Status icons for task status badges
 */
export const STATUS_ICONS = {
  [TaskStatus.PENDING]: "radio_button_unchecked",
  [TaskStatus.COMPLETED]: "check_circle",
  [TaskStatus.SKIPPED]: "cancel",
  [TaskStatus.FAILED]: "dangerous",
} as const;

/**
 * Kanban column background gradient colors by status
 */
export const STATUS_COLUMN_COLORS = {
  [TaskStatus.PENDING]:
    "bg-linear-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700",
  [TaskStatus.COMPLETED]:
    "bg-linear-to-r from-green-500 to-green-600 dark:from-green-600 dark:to-green-700",
  [TaskStatus.SKIPPED]:
    "bg-linear-to-r from-yellow-500 to-yellow-600 dark:from-yellow-600 dark:to-yellow-700",
  [TaskStatus.FAILED]: "bg-linear-to-r from-red-500 to-red-600 dark:from-red-600 dark:to-red-700",
} as const;

/**
 * Priority display colors for priority badges
 */
export const PRIORITY_COLORS = {
  low: "bg-transparent text-blue-600 border border-blue-500 dark:text-blue-400 dark:border-blue-400/50",
  medium:
    "bg-transparent text-yellow-600 border border-yellow-500 dark:text-yellow-400 dark:border-yellow-400/50",
  high: "bg-transparent text-red-600 border border-red-500 dark:text-red-400 dark:border-red-400/50",
} as const;
