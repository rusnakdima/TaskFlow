import { signal } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, map, catchError } from "rxjs/operators";

export class BasePaginationLoader {
  readonly skip = signal(0);
  readonly limit = signal(10);
  readonly hasMore = signal(true);
  readonly loading = signal(false);

  loadInitial(loadFn: (skip: number, limit: number) => Observable<any>): Observable<any> {
    this.skip.set(0);
    this.hasMore.set(true);
    this.loading.set(true);

    return loadFn(0, this.limit()).pipe(
      map((response: any) => {
        if (response.status === "Success" && response.data) {
          this.skip.set(response.data.length);
          this.hasMore.set(response.data.length >= this.limit());
          this.loading.set(false);
          return response.data;
        }
        throw new Error(response.message || "Failed to load data");
      }),
      catchError((err) => {
        this.loading.set(false);
        throw err;
      })
    );
  }

  loadMore(loadFn: (skip: number, limit: number) => Observable<any>): Observable<any> {
    if (this.loading() || !this.hasMore()) {
      return of([]);
    }

    this.loading.set(true);

    return loadFn(this.skip(), this.limit()).pipe(
      map((response: any) => {
        if (response.status === "Success" && response.data) {
          this.skip.update((s) => s + response.data.length);
          this.hasMore.set(response.data.length >= this.limit());
          this.loading.set(false);
          return response.data;
        }
        throw new Error(response.message || "Failed to load more data");
      }),
      catchError((err) => {
        this.loading.set(false);
        throw err;
      })
    );
  }

  reset(): void {
    this.skip.set(0);
    this.hasMore.set(true);
    this.loading.set(false);
  }
}
