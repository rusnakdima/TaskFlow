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
 * Format date string to relative "Today", "Yesterday", or locale date
 * @param time ISO 8601 string
 * @returns Formatted date string
 */
export function formatDateRelative(time: string): string {
  if (!time) return "";
  const dateRec = new Date(time);
  const curDate = new Date();
  const year = dateRec.getFullYear();
  const month = dateRec.getMonth();
  const day = dateRec.getDate();
  const curYear = curDate.getFullYear();
  const curMonth = curDate.getMonth();
  const curDay = curDate.getDate();

  if (day === curDay && month === curMonth && year === curYear) {
    return formatTime(dateRec);
  }

  const yesterday = new Date(curDate);
  yesterday.setDate(curDate.getDate() - 1);
  if (
    day === yesterday.getDate() &&
    month === yesterday.getMonth() &&
    year === yesterday.getFullYear()
  ) {
    return `Yesterday ${formatTime(dateRec)}`;
  }

  return formatLocaleDate(dateRec);
}

/**
 * Format date to HH:mm
 */
export function formatTime(date: Date | string): string {
  if (typeof date === "string") {
    date = new Date(date);
  }
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Format date to locale string (e.g., "Jan 10, 2026")
 */
export function formatLocaleDate(date: Date | string): string {
  if (typeof date === "string" && date === "") {
    date = new Date();
  }
  if (typeof date === "string") {
    date = new Date(date);
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format date to short locale string (e.g., "Jan 10")
 */
export function formatDateShort(dateString: string): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
