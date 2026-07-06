/**
 * Object helper utilities for nested property access
 */
export class ObjectHelper {
  /**
   * Get nested value from object using dot notation path
   * @param obj - The object to extract value from
   * @param path - Dot notation path (e.g., "user.profile.name")
   * @returns The nested value or undefined if path doesn't exist
   */
  static getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    let current: unknown = obj;
    for (const key of path.split(".")) {
      if (current == null) return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }
}
