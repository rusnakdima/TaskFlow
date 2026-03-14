/**
 * Local user data stored for offline authentication
 * Contains minimal data needed for offline auth validation
 */
export interface LocalUser {
  /** Unique identifier for the user */
  id: string;
  /** Username used for login */
  username: string;
  /** Email address */
  email: string;
  /** Hashed password for offline validation */
  passwordHash: string;
  /** User role */
  role: string;
  /** JWT token from last successful online auth */
  lastToken?: string;
  /** Timestamp when user last authenticated online */
  lastOnlineAuth?: string;
  /** Timestamp when local user data was created/updated */
  localDataUpdatedAt: string;
  /** Whether this user data is available for offline auth */
  availableForOffline: boolean;
}

/**
 * Response from offline authentication attempt
 */
export interface OfflineAuthResult {
  /** Whether authentication was successful */
  success: boolean;
  /** The authenticated user data (if successful) */
  user?: LocalUser;
  /** JWT token to use (from cache or new) */
  token?: string;
  /** Error message if authentication failed */
  error?: string;
  /** Whether fallback to online auth is needed */
  requiresOnlineAuth: boolean;
}
