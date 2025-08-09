/* sys lib */
import { Injectable } from "@angular/core";
import { JwtHelperService } from "@auth0/angular-jwt";
import { invoke } from "@tauri-apps/api/core";

/* models */
import { Response } from "@models/response";
import { LoginForm } from "@models/login-form";
import { SignupForm } from "@models/signup-form";

@Injectable({
  providedIn: "root",
})
export class AuthService {
  private jwtHelper = new JwtHelperService();

  constructor() {}

  async login<R>(loginData: LoginForm): Promise<Response<R>> {
    return await invoke<Response<R>>("login", { loginForm: loginData });
  }

  async signup<R>(signupData: SignupForm): Promise<Response<R>> {
    return await invoke<Response<R>>("register", { signupForm: signupData });
  }

  async resetPassword<R>(email: string): Promise<Response<R>> {
    return await invoke<Response<R>>("reset_password", { email: email });
  }

  async checkToken<R>(data: { username: string; token: string }): Promise<Response<R>> {
    return await invoke<Response<R>>("check_token", data);
  }

  async changePassword<R>(data: {
    username: string;
    password: string;
    token: string;
  }): Promise<Response<R>> {
    return await invoke<Response<R>>("change_password", data);
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
