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
  static getNestedValue(obj: any, path: string): any {
    return path.split(".").reduce((current, key) => current?.[key], obj);
  }

  /**
   * Set nested value in object using dot notation path
   * @param obj - The object to set value in
   * @param path - Dot notation path (e.g., "user.profile.name")
   * @param value - The value to set
   */
  static setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split(".");
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => current?.[key], obj);
    if (target) {
      target[lastKey] = value;
    }
  }
}
