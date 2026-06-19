import { Injectable, WritableSignal } from "@angular/core";
import { Observable } from "rxjs";
import { EntityType, PaginationState } from "@entities/storage.model";
import { ErrorHelper } from "./error.helper";

const DEFAULT_TTL_MS = 5 * 60 * 1000;

@Injectable({ providedIn: "root" })
export class BaseStorageService {
  protected isCacheValid(lastLoaded: Date | null, cacheExpiryMs: number = DEFAULT_TTL_MS): boolean {
    if (!lastLoaded) return false;
    return Date.now() - lastLoaded.getTime() < cacheExpiryMs;
  }

  ensureLoaded<T>(
    _entity: EntityType,
    targetSignal: WritableSignal<T[]>,
    apiCall: () => Observable<T[]>
  ): Observable<T[]> {
    return new Observable((subscriber) => {
      if (targetSignal().length > 0) {
        subscriber.next(targetSignal());
        subscriber.complete();
        return;
      }
      apiCall().subscribe({
        next: (items) => {
          targetSignal.set(items);
          subscriber.next(items);
          subscriber.complete();
        },
        error: ErrorHelper.handleApiError<T[]>(subscriber),
      });
    });
  }

  loadMore<T>(
    _entity: EntityType,
    targetSignal: WritableSignal<T[]>,
    paginationState: PaginationState,
    apiCall: (skip: number) => Observable<T[]>
  ): Observable<T[]> {
    return new Observable((subscriber) => {
      if (!paginationState.hasMore) {
        subscriber.next([]);
        subscriber.complete();
        return;
      }
      const nextSkip = paginationState.skip;
      apiCall(nextSkip).subscribe({
        next: (items) => {
          targetSignal.update((existing) => [...existing, ...items]);
          subscriber.next(items);
          subscriber.complete();
        },
        error: ErrorHelper.handleApiError<T[]>(subscriber),
      });
    });
  }

  updatePagination(paginationState: PaginationState, receivedCount: number): PaginationState {
    return {
      skip: paginationState.skip + receivedCount,
      limit: paginationState.limit,
      hasMore: receivedCount >= paginationState.limit,
    };
  }

  resetPagination(): PaginationState {
    return { skip: 0, limit: 20, hasMore: true };
  }
}
