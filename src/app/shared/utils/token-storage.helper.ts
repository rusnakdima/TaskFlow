export class TokenStorageHelper {
  private static readonly TOKEN_KEY = "token";
  private static readonly THEME_KEY = "theme";

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

  static getTheme(): string {
    return localStorage.getItem(this.THEME_KEY) ?? "";
  }

  static setTheme(theme: string): void {
    localStorage.setItem(this.THEME_KEY, theme);
  }
}
