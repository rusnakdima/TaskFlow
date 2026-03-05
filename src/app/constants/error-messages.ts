/**
 * Error message constants for consistent error handling across the application
 * Eliminates duplicate error messages and ensures consistency
 */

export const ERROR_MESSAGES = {
  // Common errors
  REQUIRED_FIELDS: "Please fill in all required fields",
  NETWORK_ERROR: "Network error. Please try again.",
  UNAUTHORIZED: "Unauthorized. Please log in again.",
  FORBIDDEN: "You do not have permission to perform this action.",
  NOT_FOUND: "Resource not found.",
  SERVER_ERROR: "Server error. Please try again later.",

  // Todo errors
  TODO_LOAD: "Failed to load todos",
  TODO_CREATE: "Failed to create todo",
  TODO_UPDATE: "Failed to update todo",
  TODO_DELETE: "Failed to delete todo",

  // Task errors
  TASK_LOAD: "Failed to load tasks",
  TASK_CREATE: "Failed to create task",
  TASK_UPDATE: "Failed to update task",
  TASK_DELETE: "Failed to delete task",
  TASK_MOVE: "Failed to move task",

  // Subtask errors
  SUBTASK_LOAD: "Failed to load subtasks",
  SUBTASK_CREATE: "Failed to create subtask",
  SUBTASK_UPDATE: "Failed to update subtask",
  SUBTASK_DELETE: "Failed to delete subtask",

  // Category errors
  CATEGORY_LOAD: "Failed to load categories",
  CATEGORY_CREATE: "Failed to create category",
  CATEGORY_UPDATE: "Failed to update category",
  CATEGORY_DELETE: "Failed to delete category",

  // Profile errors
  PROFILE_LOAD: "Failed to load profile",
  PROFILE_CREATE: "Failed to create profile",
  PROFILE_UPDATE: "Failed to update profile",

  // Auth errors
  AUTH_LOGIN: "Login failed. Please check your credentials.",
  AUTH_REGISTER: "Registration failed. Please try again.",
  AUTH_LOGOUT: "Logout failed.",
  AUTH_PASSWORD_RESET: "Failed to reset password.",

  // Validation errors
  DATE_RANGE: "End date cannot be earlier than start date",
  INVALID_EMAIL: "Please enter a valid email address.",
  INVALID_PASSWORD: "Password must be at least 6 characters.",
  PASSWORD_MISMATCH: "Passwords do not match.",

  // Sync errors
  SYNC_LOAD: "Failed to sync data",
  SYNC_EXPORT: "Failed to export data",
  SYNC_IMPORT: "Failed to import data",

  // Statistics errors
  STATISTICS_LOAD: "Failed to load statistics",
} as const;

/**
 * Helper function to get error message with fallback
 * @param error - Error object or string
 * @param defaultMessage - Default message if error is undefined
 * @returns Error message string
 */
export function getErrorMessage(
  error: any,
  defaultMessage: string = ERROR_MESSAGES.SERVER_ERROR
): string {
  if (typeof error === "string") {
    return error;
  }
  if (error?.message) {
    return error.message;
  }
  return defaultMessage;
}

/**
 * Helper function to get user-friendly error message
 * Maps technical error messages to user-friendly ones
 * @param error - Error object or string
 * @returns User-friendly error message
 */
export function getUserFriendlyError(error: any): string {
  const message = getErrorMessage(error, "");

  // Map technical errors to user-friendly messages
  if (message.includes("network") || message.includes("fetch")) {
    return ERROR_MESSAGES.NETWORK_ERROR;
  }
  if (message.includes("unauthorized") || message.includes("401")) {
    return ERROR_MESSAGES.UNAUTHORIZED;
  }
  if (message.includes("forbidden") || message.includes("403")) {
    return ERROR_MESSAGES.FORBIDDEN;
  }
  if (message.includes("not found") || message.includes("404")) {
    return ERROR_MESSAGES.NOT_FOUND;
  }

  return message || ERROR_MESSAGES.SERVER_ERROR;
}
