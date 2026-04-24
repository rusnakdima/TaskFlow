/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, of, catchError, map, retry, tap } from "rxjs";

/* models */
import { Profile } from "@models/profile.model";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { StorageService } from "@services/core/storage.service";

@Injectable({
  providedIn: "root",
})
export class ProfileLoaderService {
  private jwtTokenService = inject(JwtTokenService);
  private apiProvider = inject(ApiProvider);
  private storageService = inject(StorageService);

  private readonly RETRY_COUNT = 2;
  private readonly RETRY_DELAY_MS = 1000;

  /**
   * Load user profile
   * Returns cached profile if available, otherwise fetches from API
   */
  loadProfile(): Observable<Profile | null> {
    const userId = this.jwtTokenService.getUserId(this.jwtTokenService.getToken() || "") || "";

    if (!userId) {
      console.log("[ProfileLoader] loadProfile: no userId, returning null");
      return of(null);
    }

    const cached = this.storageService.profile();
    console.log("[ProfileLoader] loadProfile: userId=", userId, "cached=", cached);

    if (cached?.user_id) {
      return of(cached);
    }

    return this.fetchProfileFromApi(userId);
  }

  /**
   * Fetch profile from API and update storage
   */
  fetchProfileFromApi(userId: string): Observable<Profile | null> {
    console.log("[ProfileLoader] fetchProfileFromApi called with userId:", userId);

    return this.apiProvider
      .crud<Profile[]>(
        "getAll",
        "profiles",
        {
          filter: { user_id: userId },
          isPrivate: true,
          isOwner: true,
          load: ["user"],
        },
        true
      )
      .pipe(
        retry({ count: this.RETRY_COUNT, delay: this.RETRY_DELAY_MS }),
        catchError((err) => {
          console.error("[ProfileLoader] fetchProfileFromApi error:", err);
          return of([] as Profile[]);
        }),
        map((profiles: Profile[] | null) => {
          console.log("[ProfileLoader] fetchProfileFromApi response:", profiles);
          if (Array.isArray(profiles) && profiles.length > 0) {
            const profileObj = profiles[0] as Profile;
            if (profileObj?.user_id) {
              console.log(
                "[ProfileLoader] Profile found with user relation, updating storage:",
                profileObj
              );
              this.storageService.setCollection("profiles", profileObj);
              return profileObj;
            }
          }
          console.log("[ProfileLoader] No profile found for userId:", userId);
          return null as Profile | null;
        })
      );
  }
}
