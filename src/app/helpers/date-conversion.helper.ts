/**
 * Helper functions for handling date conversions in forms
 * Ensures that date fields are empty strings instead of null when cleared
 */

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
