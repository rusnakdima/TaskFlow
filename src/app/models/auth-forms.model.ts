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
