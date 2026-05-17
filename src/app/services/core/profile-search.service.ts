import { Injectable, inject, signal } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, catchError } from "rxjs/operators";
import { Profile } from "@models/generated/api.types";
import { ApiService } from "@services/api.service";
import { StorageService } from "@services/storage.service";

@Injectable({ providedIn: "root" })
export class ProfileSearchService {
  private apiService = inject(ApiService);
  private storageService = inject(StorageService);

  private _profiles = signal<Profile[]>([]);
  private _isLoading = signal(false);
  private _currentPage = signal(0);
  private _hasMore = signal(true);
  private _isInitialized = signal(false);

  readonly profiles = this._profiles.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly hasMore = this._hasMore.asReadonly();

  loadInitial(): Observable<Profile[]> {
    if (this._isInitialized() && this._profiles().length > 0) {
      return of(this._profiles());
    }

    const stored = this.storageService.allProfiles();
    if (stored && stored.length > 0) {
      this._profiles.set(stored);
      this._isInitialized.set(true);
      return of(stored);
    }

    return this.loadFromDb(0);
  }

  loadMore(): Observable<Profile[]> {
    if (this._isLoading() || !this._hasMore()) {
      return of([]);
    }
    return this.loadFromDb(this._currentPage() + 1);
  }

  private loadFromDb(page: number): Observable<Profile[]> {
    this._isLoading.set(true);

    return this.apiService
      .getAll<Profile>("profiles", {
        visibility: "public",
        load: "user",
        page,
        limit: 50,
      })
      .pipe(
        tap((profiles) => {
          this._profiles.update((existing) => (page === 0 ? profiles : [...existing, ...profiles]));
          this._currentPage.set(page);
          this._hasMore.set(profiles.length >= 50);
          this._isInitialized.set(true);
          this._isLoading.set(false);
        }),
        catchError(() => {
          this._isLoading.set(false);
          return of([]);
        })
      );
  }

  search(query: string): Profile[] {
    const q = query.toLowerCase().trim();
    if (!q) return this._profiles();

    return this._profiles().filter((p) => {
      const name = `${p.name} ${p.last_name}`.toLowerCase();
      return name.includes(q);
    });
  }

  refreshCache(): void {
    this._isInitialized.set(false);
    this._currentPage.set(0);
    this._profiles.set([]);
    this.loadInitial().subscribe();
  }
}
