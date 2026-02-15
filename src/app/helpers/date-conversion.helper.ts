/**
 * Helper functions for handling date conversions in forms
 * Ensures that date fields are empty strings instead of null when cleared
 */

/**
 * Stores date in UTC+0 with hour set to 00:00:00
 * @param date Date object or ISO string
 * @returns UTC string in RFC3339 format (e.g., "2026-02-10T00:00:00Z") or empty string
 */
export function convertLocalToUtc(date: Date | string | null | undefined): string {
  if (!date) return "";

  let d: Date;
  if (date instanceof Date) {
    d = date;
  } else if (typeof date === "string") {
    if (date.trim() === "") return "";
    d = new Date(date);
  } else {
    return "";
  }

  if (isNaN(d.getTime())) return "";

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}T00:00:00Z`;
}

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
 * Converts date fields to UTC format for sending to backend
 * @param formValue The form value object that may contain date fields
 * @param dateFieldNames Array of date field names to convert
 * @returns A new object with date fields converted to UTC
 */
export function convertDatesToUtc<T extends Record<string, any>>(
  formValue: T,
  dateFieldNames: string[] = ["startDate", "endDate"]
): T {
  const converted = { ...formValue } as Record<string, any>;

  for (const fieldName of dateFieldNames) {
    if (fieldName in converted) {
      converted[fieldName] = convertLocalToUtc(converted[fieldName]);
    }
  }

  return converted as T;
}

/**
 * Converts date fields from UTC to local Date for form loading
 * @param formValue The form value object that may contain date fields
 * @param dateFieldNames Array of date field names to convert
 * @returns A new object with date fields converted to local Date
 */
export function convertDatesFromUtcToLocal<T extends Record<string, any>>(
  formValue: T,
  dateFieldNames: string[] = ["startDate", "endDate"]
): T {
  const converted = { ...formValue } as Record<string, any>;

  for (const fieldName of dateFieldNames) {
    if (fieldName in converted && converted[fieldName]) {
      converted[fieldName] = utcToLocalDate(converted[fieldName]);
    }
  }

  return converted as T;
}

/**
 * Normalizes and converts date fields for Task objects
 */
export function normalizeTaskDates<T extends { startDate?: any; endDate?: any }>(task: T): T {
  return normalizeDateFields(task, ["startDate", "endDate"]);
}

/**
 * Normalizes and converts date fields for Todo objects
 */
export function normalizeTodoDates<T extends { startDate?: any; endDate?: any }>(todo: T): T {
  return normalizeDateFields(todo, ["startDate", "endDate"]);
}
