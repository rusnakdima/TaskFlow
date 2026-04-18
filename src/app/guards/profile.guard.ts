import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { StorageService } from "@services/core/storage.service";
import { AuthService } from "@services/auth/auth.service";
import { DataLoaderService } from "@services/data/data-loader.service";

export const canActivateCreateProfile: CanActivateFn = async (route, state) => {
  const storageService = inject(StorageService);
  const authService = inject(AuthService);
  const dataLoaderService = inject(DataLoaderService);
  const router = inject(Router);

  const userId = authService.getValueByKey("id");
  if (!userId) {
    router.navigate(["/login"]);
    return false;
  }

  const existingProfile = storageService.profile();
  // NOTE: Profile redirect disabled for testing - re-enable once profile flow is stable
  // if (existingProfile?.userId === userId) {
  //   router.navigate(["/profile"]);
  //   return false;
  // }

  await firstValueFrom(dataLoaderService.loadProfile());

  const profile = storageService.profile();
  // NOTE: Profile redirect disabled for testing
  // if (profile?.userId === userId) {
  //   router.navigate(["/profile"]);
  //   return false;
  // }

  return true;
};
