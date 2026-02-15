/**
 * Helper functions for handling date conversions in forms
 * Ensures that date fields are empty strings instead of null when cleared
 */

/**
 * Converts a UTC ISO string to local time string
 * @param utcString ISO 8601 UTC string (e.g., "2024-01-15T10:30:00Z")
 * @returns Local date string in ISO format without timezone
 */
export function convertUtcToLocal(utcString: string): string {
  if (!utcString) return "";
  const date = new Date(utcString);
  if (isNaN(date.getTime())) return "";
  return date.toISOString().replace("Z", "").split(".")[0];
}

/**
 * Converts a UTC ISO string to local Date object
 * @param utcString ISO 8601 UTC string
 * @returns Date object in local time
 */
export function utcToLocalDate(utcString: string): Date | null {
  if (!utcString) return null;
  const date = new Date(utcString);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Ensures date fields in a form value object are empty strings instead of null
 * @param formValue The form value object that may contain date fields
 * @param dateFieldNames Array of date field names to normalize
 * @returns A new object with date fields normalized to empty strings when they are null/undefined
 */
export function normalizeDateFields<T extends Record<string, any>>(
  formValue: T,
  dateFieldNames: string[] = ["startDate", "endDate"]
): T {
  const normalizedValue = { ...formValue } as Record<string, any>;

  for (const fieldName of dateFieldNames) {
    if (fieldName in normalizedValue) {
      const fieldValue = normalizedValue[fieldName];
      if (fieldValue === null || fieldValue === undefined) {
        normalizedValue[fieldName] = "";
      }
    }
  }

  return normalizedValue as T;
}

/**
 * Normalizes date fields specifically for Task objects
 */
export function normalizeTaskDates<T extends { startDate?: any; endDate?: any }>(task: T): T {
  return normalizeDateFields(task, ["startDate", "endDate"]);
}

/**
 * Normalizes date fields specifically for Todo objects
 */
export function normalizeTodoDates<T extends { startDate?: any; endDate?: any }>(todo: T): T {
  return normalizeDateFields(todo, ["startDate", "endDate"]);
}
