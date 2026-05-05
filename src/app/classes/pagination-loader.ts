import { WritableSignal } from "@angular/core";
import { Observable, of, switchMap, catchError } from "rxjs";

export interface PaginationState {
  items: any[];
  skip: number;
  limit: number;
  hasMore: boolean;
  loading: boolean;
}

export interface PaginationOptions<T> {
  entityName: string;
  paginationSignal: WritableSignal<PaginationState>;
  filterBuilder: (skip: number, limit: number) => Record<string, any>;
  load: string[];
  visibility: string;
  reverseItems?: boolean;
  prependItems?: boolean;
  apiFetch: (params: Record<string, any>) => Observable<T[]>;
}

export class PaginationLoader<T> {
  constructor(private options: PaginationOptions<T>) {}

  loadInitial(): Observable<T[]> {
    const { paginationSignal, filterBuilder, load, visibility, entityName, apiFetch } =
      this.options;
    paginationSignal.set({
      items: [],
      skip: 0,
      limit: paginationSignal().limit,
      hasMore: true,
      loading: true,
    });

    return apiFetch({
      ...filterBuilder(0, paginationSignal().limit),
      load,
      visibility,
    }).pipe(
      switchMap((entities) => {
        const current = paginationSignal();
        const items = this.options.reverseItems ? (entities || []).reverse() : entities || [];
        paginationSignal.set({
          ...current,
          items,
          skip: (entities || []).length,
          hasMore: (entities || []).length >= current.limit,
          loading: false,
        });
        return of(items);
      }),
      catchError(() => {
        const current = paginationSignal();
        paginationSignal.set({ ...current, loading: false });
        return of([]);
      })
    );
  }

  loadMore(): Observable<T[]> {
    const { paginationSignal, filterBuilder, load, visibility, apiFetch, prependItems } =
      this.options;
    const current = paginationSignal();
    if (current.loading || !current.hasMore) {
      return of(current.items);
    }

    paginationSignal.set({ ...current, loading: true });

    return apiFetch({
      ...filterBuilder(current.skip, current.limit),
      load,
      visibility,
    }).pipe(
      switchMap((entities) => {
        const newItems = this.options.reverseItems ? (entities || []).reverse() : entities || [];
        const updated = paginationSignal();
        const mergedItems = prependItems
          ? [...newItems, ...updated.items]
          : [...updated.items, ...newItems];
        paginationSignal.set({
          ...updated,
          items: mergedItems,
          skip: updated.skip + newItems.length,
          hasMore: newItems.length >= current.limit,
          loading: false,
        });
        return of(newItems);
      }),
      catchError(() => {
        const updated = paginationSignal();
        paginationSignal.set({ ...updated, loading: false });
        return of(paginationSignal().items);
      })
    );
  }
}
