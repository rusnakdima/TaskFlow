/* sys lib */
import { signal } from "@angular/core";

/**
 * Base class for storage services with common loading state management
 */
export abstract class BaseStorageService {
  protected loadingSignal = signal(false);
  protected loadedSignal = signal(false);
  protected lastLoadedSignal = signal<Date | null>(null);

  /**
   * Check if cache is valid (not expired)
   */
  protected isCacheValid(cacheExpiryMs: number): boolean {
    if (!this.loadedSignal()) return false;
    const lastLoaded = this.lastLoadedSignal();
    if (!lastLoaded) return false;
    return new Date().getTime() - lastLoaded.getTime() < cacheExpiryMs;
  }

  protected hasData(): boolean {
    return false;
  }

  setLoading(isLoading: boolean): void {
    this.loadingSignal.set(isLoading);
  }

  setLoaded(isLoaded: boolean): void {
    this.loadedSignal.set(isLoaded);
  }

  setLastLoaded(date: Date | null): void {
    this.lastLoadedSignal.set(date);
  }

  get loading() {
    return this.loadingSignal.asReadonly();
  }

  get loaded() {
    return this.loadedSignal.asReadonly();
  }

  get lastLoaded() {
    return this.lastLoadedSignal.asReadonly();
  }
}
