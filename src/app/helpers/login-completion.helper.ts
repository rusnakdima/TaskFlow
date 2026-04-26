import { TokenStorageHelper } from "./token-storage.helper";

export interface LoginCompletionOptions {
  token: string;
  remember: boolean;
  needsProfile?: boolean;
  profile?: any;
  userId?: string;
}

export class LoginCompletionHelper {
  static completeLogin(options: LoginCompletionOptions): void {
    const { token, remember, needsProfile, userId } = options;

    // Store token
    TokenStorageHelper.setToken(token, remember);

    // Store user ID if provided
    if (userId) {
      TokenStorageHelper.setUserId(userId, remember);
    }

    if (needsProfile) {
      // Profile setup needed - redirect to profile creation
      window.location.href = "/profile/create-profile";
    } else {
      // Login successful - redirect to main app
      window.location.href = "/";
    }
  }

  static completePasswordlessLogin(
    username: string,
    remember: boolean,
    authResponse?: { token: string; needsProfile: boolean; profile: any }
  ): void {
    if (authResponse?.token) {
      this.completeLogin({
        token: authResponse.token,
        remember,
        needsProfile: authResponse.needsProfile,
        profile: authResponse.profile,
      });
    }
  }
}
