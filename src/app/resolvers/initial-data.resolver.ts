/* sys lib */
import { Injectable, inject } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, Router, RouterStateSnapshot } from "@angular/router";
import { lastValueFrom, of, Observable } from "rxjs";
import { timeout, catchError } from "rxjs/operators";

/* services */
import { ApiService } from "@services/api.service";
import { AuthService } from "@services/auth/auth.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { StorageService } from "@services/storage.service";
import { NotifyService } from "@services/notifications/notify.service";

const RESOLVER_TIMEOUT_MS = 10000;

@Injectable({
  providedIn: "root",
})
export class InitialDataResolver implements Resolve<unknown> {
  private authService = inject(AuthService);
  private jwtTokenService = inject(JwtTokenService);
  private storageService = inject(StorageService);
  private notifyService = inject(NotifyService);
  private router = inject(Router);
  private apiService = inject(ApiService);

  private hasCachedData(): boolean {
    return (
      this.storageService.privateTodos().length > 0 ||
      this.storageService.sharedTodos().length > 0 ||
      this.storageService.categories().length > 0 ||
      this.storageService.tasks().length > 0
    );
  }

  private hasCompleteProfile(): boolean {
    const profile = this.storageService.profile();
    return !!(
      profile?.user_id &&
      profile?.name &&
      profile?.name.trim() !== "" &&
      profile?.last_name &&
      profile?.last_name.trim() !== ""
    );
  }

  private loadProfileWithTimeout() {
    return new Observable<boolean>((observer) => {
      if (this.hasCompleteProfile()) {
        observer.next(true);
        observer.complete();
        return;
      }

      const userId = this.authService.getValueByKey("id");
      if (!userId) {
        observer.next(false);
        observer.complete();
        return;
      }

      this.apiService.profiles
        .getAll({
          visibility: "private",
          filter: { user_id: userId },
          load: ["user"],
        })
        .subscribe({
          next: (profiles) => {
            if (profiles && profiles.length > 0) {
              this.storageService.setCollection("profiles", profiles[0]);
              if ((profiles[0] as any).user) {
                this.storageService.setCollection("user", (profiles[0] as any).user);
              }
              observer.next(true);
            } else {
              observer.next(false);
            }
            observer.complete();
          },
          error: () => {
            observer.next(false);
            observer.complete();
          },
        });
    }).pipe(
      timeout(RESOLVER_TIMEOUT_MS),
      catchError(() => of(false))
    );
  }

  async resolve(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<unknown> {
    const targetUrl = state.url || this.router.url;

    if (targetUrl.startsWith("/profile")) {
      await lastValueFrom(this.loadProfileWithTimeout());
      if (targetUrl === "/profile/manage") {
        if (this.hasCompleteProfile()) {
          return this.router.createUrlTree(["/profile"]);
        }
      } else if (targetUrl === "/profile") {
        if (!this.hasCompleteProfile()) {
          return this.router.createUrlTree(["/profile/manage"]);
        }
      }
      return { loaded: true, isProfileRoute: true };
    }

    const token = this.jwtTokenService.getToken();
    if (!token) {
      this.notifyService.showError("Error: Token not found");
      return this.router.createUrlTree(["/login"]);
    }

    await lastValueFrom(this.loadProfileWithTimeout());

    if (!this.hasCompleteProfile()) {
      return this.router.createUrlTree(["/profile/manage"]);
    }

    if (!this.hasCachedData()) {
      this.storageService.ensureTodosLoaded("all", 50);
      this.storageService.ensureTasksLoaded("all", 50);
      this.storageService.ensureSubtasksLoaded("all", 50);
      this.storageService.ensureChatsLoaded("all", 50);
    }

    return {
      loaded: true,
      fromCache: this.hasCachedData(),
      isEmpty: !this.hasCachedData(),
    };
  }
}
