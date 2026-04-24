/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, of, catchError, retry, tap } from "rxjs";

/* models */
import { Category } from "@models/category.model";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { StorageService } from "@services/core/storage.service";

@Injectable({
  providedIn: "root",
})
export class CategoryLoaderService {
  private jwtTokenService = inject(JwtTokenService);
  private apiProvider = inject(ApiProvider);
  private storageService = inject(StorageService);

  private readonly RETRY_COUNT = 2;
  private readonly RETRY_DELAY_MS = 1000;

  /**
   * Fire-and-forget: Load categories
   */
  loadCategories(userId: string): void {
    this.apiProvider
      .crud<Category[]>(
        "getAll",
        "categories",
        { filter: { user_id: userId, deleted_at: null } },
        true
      )
      .pipe(
        retry({ count: this.RETRY_COUNT, delay: this.RETRY_DELAY_MS }),
        catchError(() => {
          return of(null);
        }),
        tap((categories) => {
          if (categories && Array.isArray(categories)) {
            this.storageService.setCollection("categories", categories);
            this.emitUpdate();
          }
        })
      )
      .subscribe();
  }

  /**
   * Emit current state to subscribers
   */
  private emitUpdate(): void {
    this.storageService.setLoaded(true);
    this.storageService.setLastLoaded(new Date());
  }
}
