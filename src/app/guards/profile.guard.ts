import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { StorageService } from "@services/core/storage.service";
import { AuthService } from "@services/auth/auth.service";
import { DataLoaderService } from "@services/data/data-loader.service";
import { NotifyService } from "@services/notifications/notify.service";
import { UserValidationService } from "@services/auth/user-validation.service";

export const canActivateCreateProfile: CanActivateFn = async (route, state) => {
  const storageService = inject(StorageService);
  const authService = inject(AuthService);
  const dataLoaderService = inject(DataLoaderService);
  const notifyService = inject(NotifyService);
  const router = inject(Router);
  const userValidationService = inject(UserValidationService);

  const userId = authService.getValueByKey("id");
  if (!userId) {
    notifyService.showError("Error: User ID not found");
    userValidationService.redirectToLogin();
    return false;
  }

  const existingProfile = storageService.profile();
  // NOTE: Profile redirect disabled for testing - re-enable once profile flow is stable
  // if (existingProfile?.user_id === userId) {
  //   router.navigate(["/profile"]);
  //   return false;
  // }

  await firstValueFrom(dataLoaderService.loadProfile());

  const profile = storageService.profile();
  // NOTE: Profile redirect disabled for testing
  // if (profile?.user_id === userId) {
  //   router.navigate(["/profile"]);
  //   return false;
  // }

  return true;
};
