import { TokenStorageHelper } from "./token-storage.helper";

export interface LoginCompletionOptions {
  token: string;
  remember: boolean;
}

export class LoginCompletionHelper {
  static completeLogin(options: LoginCompletionOptions): void {
    const { token, remember } = options;

    TokenStorageHelper.setToken(token, remember);

    window.location.href = "/";
  }

  static completePasswordlessLogin(
    username: string,
    remember: boolean,
    authResponse?: { token: string }
  ): void {
    if (authResponse?.token) {
      this.completeLogin({
        token: authResponse.token,
        remember,
      });
    }
  }
}
