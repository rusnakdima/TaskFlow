/**
 * Password reset model - used for password reset operations
 */
export interface PasswordReset {
  email?: string;
  code?: string;
  newPassword?: string;
  // Database fields (optional, for backend responses)
  id?: string;
  userId?: string;
  token?: string;
  expiresAt?: Date;
  isUsed?: boolean;
  created_at?: Date;
  updated_at?: Date;
}
