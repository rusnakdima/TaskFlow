/**
 * Authentication form models
 */

/**
 * Login form interface
 */
export interface LoginForm {
  username: string;
  password: string;
  remember: boolean;
}

/**
 * Signup form interface
 */
export interface SignupForm {
  email: string;
  username: string;
  password: string;
}

/**
 * Password reset form interface
 */
export interface PasswordReset {
  email: string;
  code: string;
  newPassword: string;
}
