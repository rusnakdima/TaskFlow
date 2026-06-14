import { Visibility } from "@services/api.service";

export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
export const REQUEST_TTL_MS = 30 * 1000;
export const SELECTION_TTL_MS = 10 * 60 * 1000;
export const CONFLICT_TTL_MS = 10 * 60 * 1000;

export class TimestampHelper {
  static createTimestamp(): string {
    return new Date().toISOString();
  }
}

export class VisibilityHelper {
  static getVisibility(visibility: string | undefined | null): Visibility {
    return (visibility || "private") as Visibility;
  }

  static isPublic(visibility: string | undefined | null): boolean {
    return visibility === "public";
  }

  static isPrivate(visibility: string | undefined | null): boolean {
    return !visibility || visibility === "private";
  }

  static defaultVisibility(): Visibility {
    return "private" as Visibility;
  }
}
