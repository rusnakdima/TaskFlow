/**
 * Storage service helper utilities
 *
 * Pure utility functions for entity merging and manipulation
 */

/**
 * Merge two entities while preserving specific fields from the existing entity
 * when the incoming value is null or undefined.
 *
 * @param incoming - The new/incoming entity data
 * @param existing - The existing entity data
 * @param fields - Array of field names to preserve from existing when incoming is null/undefined
 * @returns Merged entity with preserved fields
 */
export function mergePreservingFields<T extends Record<string, any>>(
  incoming: T,
  existing: T,
  fields: string[]
): T {
  const result: any = { ...incoming };
  fields.forEach((field) => {
    const inc = incoming[field];
    const ext = existing[field];
    if (inc !== undefined && inc !== null) result[field] = inc;
    else if (ext) result[field] = ext;
  });
  return result as T;
}
