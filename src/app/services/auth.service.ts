/* sys lib */
import { Injectable } from "@angular/core";
import { JwtHelperService } from "@auth0/angular-jwt";
import { invoke } from "@tauri-apps/api/core";

/* models */
import { Response } from "@models/response.model";
import { LoginForm } from "@models/login-form.model";
import { SignupForm } from "@models/signup-form.model";
import { PasswordReset } from "@models/password-reset-form.model";

@Injectable({
  providedIn: "root",
})
export class AuthService {
  private jwtHelper = new JwtHelperService();

  constructor() {}

  async checkToken<R>(token: string): Promise<Response<R>> {
    return await invoke<Response<R>>("checkToken", { token });
  }

  async login<R>(loginData: LoginForm): Promise<Response<R>> {
    return await invoke<Response<R>>("login", { loginForm: loginData });
  }

  async signup<R>(signupData: SignupForm): Promise<Response<R>> {
    return await invoke<Response<R>>("register", { signupForm: signupData });
  }

  async requestPasswordReset<R>(email: string): Promise<Response<R>> {
    return await invoke<Response<R>>("requestPasswordReset", { email });
  }

  async verifyCode<R>(email: string, code: string): Promise<Response<R>> {
    return await invoke<Response<R>>("verifyCode", { email, code });
  }

  async resetPassword<R>(passwordReset: PasswordReset): Promise<Response<R>> {
    return await invoke<Response<R>>("resetPassword", { resetData: passwordReset });
  }

  logout() {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    window.location.reload();
  }

  isLoggedIn() {
    if (
      !this.jwtHelper.isTokenExpired(this.getTokenLS()) ||
      !this.jwtHelper.isTokenExpired(this.getTokenSS())
    ) {
      return true;
    }
    if (this.jwtHelper.isTokenExpired(this.getTokenLS())) {
      localStorage.removeItem("token");
      return false;
    } else if (this.jwtHelper.isTokenExpired(this.getTokenSS())) {
      sessionStorage.removeItem("token");
      return false;
    }
    return false;
  }

  getTokenLS() {
    return localStorage.getItem("token");
  }

  getTokenSS() {
    return sessionStorage.getItem("token");
  }

  getToken() {
    return this.getTokenLS() || this.getTokenSS();
  }

  hasRole(role: string) {
    return this.getValueByKey("role").indexOf(role) !== -1;
  }

  getValueByKey(key: string) {
    const token = this.getToken();
    if (token && token != "") {
      const decoded: { [key: string]: any } | null = this.jwtHelper.decodeToken(token);
      if (decoded) {
        return decoded[key];
      } else {
        return null;
      }
    } else {
      return null;
    }
  }
}
