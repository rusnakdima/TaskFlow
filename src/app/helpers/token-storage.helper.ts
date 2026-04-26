export class TokenStorageHelper {
  private static readonly TOKEN_KEY = "token";
  private static readonly USER_ID_KEY = "userId";
  private static readonly THEME_KEY = "theme";
  private static readonly PROFILE_ID_KEY = "profileId";

  static getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY) || sessionStorage.getItem(this.TOKEN_KEY);
  }

  static setToken(token: string, remember = false): void {
    if (remember) {
      localStorage.setItem(this.TOKEN_KEY, token);
    } else {
      sessionStorage.setItem(this.TOKEN_KEY, token);
    }
  }

  static removeToken(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.TOKEN_KEY);
  }

  static getUserId(): string | null {
    return localStorage.getItem(this.USER_ID_KEY) || sessionStorage.getItem(this.USER_ID_KEY);
  }

  static setUserId(userId: string, remember = false): void {
    if (remember) {
    } else {
      sessionStorage.setItem(this.USER_ID_KEY, userId);
    }
  }

  static removeUserId(): void {
    localStorage.removeItem(this.USER_ID_KEY);
    sessionStorage.removeItem(this.USER_ID_KEY);
  }

  static getTheme(): string {
    return localStorage.getItem(this.THEME_KEY) ?? "";
  }

  static setTheme(theme: string): void {
    localStorage.setItem(this.THEME_KEY, theme);
  }

  static getProfileId(): string | null {
    return localStorage.getItem(this.PROFILE_ID_KEY) || sessionStorage.getItem(this.PROFILE_ID_KEY);
  }

  static setProfileId(profileId: string, remember = false): void {
    if (remember) {
      localStorage.setItem(this.PROFILE_ID_KEY, profileId);
    } else {
      sessionStorage.setItem(this.PROFILE_ID_KEY, profileId);
    }
  }

  static removeProfileId(): void {
    localStorage.removeItem(this.PROFILE_ID_KEY);
    sessionStorage.removeItem(this.PROFILE_ID_KEY);
  }
}
