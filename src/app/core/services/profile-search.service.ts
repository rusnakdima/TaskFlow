import { Injectable, inject, signal } from "@angular/core";
import {
  Observable,
  of,
  Subject,
  debounceTime,
  distinctUntilChanged,
  switchMap,
  catchError,
} from "rxjs";
import { tap, takeUntil } from "rxjs/operators";
import { Profile } from "@entities/generated/api.types";
import { ApiService } from "@services/api.service";
import { StorageService } from "@services/storage.service";
import { AuthService } from "@services/auth/auth.service";
import { MongoConnectionService } from "@core/services/mongo-connection.service";
@Injectable({ providedIn: "root" })
export class ProfileSearchService {
  private apiService = inject(ApiService);
  private storageService = inject(StorageService);
  private authService = inject(AuthService);
  private mongoConnectionService = inject(MongoConnectionService);
  private _profiles = signal<Profile[]>([]);
  private _isLoading = signal(false);
  private _currentPage = signal(0);
  private _hasMore = signal(true);
  private _isInitialized = signal(false);
  private _searchQuery = signal("");
  private _isSearching = signal(false);
  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();
  readonly profiles = this._profiles.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly hasMore = this._hasMore.asReadonly();
  readonly isSearching = this._isSearching.asReadonly();
  constructor() {
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => this.performSearch(query)),
        takeUntil(this.destroy$)
      )
      .subscribe();
  }
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  loadInitial(): Observable<Profile[]> {
    if (this._isInitialized() && this._profiles().length > 0 && !this._searchQuery()) {
      return of(this._profiles());
    }
    const stored = this.storageService.allProfiles();
    if (stored && stored.length > 0 && !this._searchQuery()) {
      this._profiles.set(stored);
      this._isInitialized.set(true);
      return of(stored);
    }
    if (!navigator.onLine || !this.mongoConnectionService.isConnected()) {
      const localProfiles = this.storageService.allProfiles() || [];
      if (localProfiles.length > 0) {
        this._profiles.set(localProfiles);
        this._isInitialized.set(true);
        this._hasMore.set(false);
        return of(localProfiles);
      }
      return of([]);
    }
    return this.loadFromDb(0);
  }
  search(query: string): void {
    this._searchQuery.set(query);
    if (query.trim()) {
      this._isSearching.set(true);
      this.searchSubject.next(query);
    } else {
      this._isSearching.set(false);
      this.loadInitial().subscribe();
    }
  }
  private performSearch(query: string): Observable<Profile[]> {
    if (!query.trim()) {
      return this.loadInitial();
    }
    if (!navigator.onLine || !this.mongoConnectionService.isConnected()) {
      const stored = this.storageService.allProfiles() || [];
      const lowerQuery = query.toLowerCase();
      const filtered = stored.filter(
        (p) =>
          p.name?.toLowerCase().includes(lowerQuery) ||
          p.last_name?.toLowerCase().includes(lowerQuery) ||
          p.bio?.toLowerCase().includes(lowerQuery)
      );
      this._profiles.set(filtered);
      this._hasMore.set(false);
      this._isLoading.set(false);
      this._isSearching.set(false);
      return of(filtered);
    }
    this._isLoading.set(true);
    const token = this.authService.getToken();
    return new Observable((subscriber) => {
      this.apiService
        .invokeCommand("search_data", {
          table: "profiles",
          query: query,
          token: token,
          page: 0,
          limit: 50,
          visibility: "public",
          load: "user",
        })
        .subscribe({
          next: (result: any) => {
            const profiles: Profile[] = Array.isArray(result) ? result : result?.data || [];
            this._profiles.set(profiles);
            this._hasMore.set(profiles.length >= 50);
            this._isLoading.set(false);
            this._isSearching.set(false);
            subscriber.next(profiles);
            subscriber.complete();
          },
          error: (err) => {
            this._isLoading.set(false);
            this._isSearching.set(false);
            subscriber.error(err);
          },
        });
    });
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
      } as any)
      .pipe(
        tap((profiles) => {
          this._profiles.update((existing) => (page === 0 ? profiles : [...existing, ...profiles]));
          this._currentPage.set(page);
          this._hasMore.set(profiles.length >= 50);
          this._isInitialized.set(true);
          this._isLoading.set(false);
          this.storageService.setCollectionByTable("allProfiles", this._profiles());
        }),
        catchError(() => {
          this._isLoading.set(false);
          return of([]);
        })
      );
  }
  refreshCache(): void {
    this._isInitialized.set(false);
    this._currentPage.set(0);
    this._profiles.set([]);
    this._searchQuery.set("");
    this.loadInitial().subscribe();
  }
  addProfile(profile: Profile): void {
    const current = this._profiles();
    if (!current.find((p) => p.user_id === profile.user_id)) {
      this._profiles.set([...current, profile]);
      this.storageService.setCollectionByTable("allProfiles", this._profiles());
    }
  }
}
