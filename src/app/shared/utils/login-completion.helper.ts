import { Router } from "@angular/router";
import { TokenStorageHelper } from "./token-storage.helper";
export interface LoginCompletionOptions {
  token: string;
  remember: boolean;
}
export class LoginCompletionHelper {
  static completeLogin(options: LoginCompletionOptions, router?: Router): void {
    const { token, remember } = options;
    TokenStorageHelper.setToken(token, remember);
    if (router) {
      history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    } else {
      window.location.href = "/";
    }
  }
  static completePasswordlessLogin(
    _username: string,
    remember: boolean,
    authResponse?: { token: string },
    router?: Router
  ): void {
    if (authResponse?.token) {
      this.completeLogin(
        {
          token: authResponse.token,
          remember,
        },
        router
      );
    }
  }
}
