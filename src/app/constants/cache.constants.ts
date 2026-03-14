/**
 * Cache-related constants for the application.
 * Centralizes all cache expiry and timing values.
 */
export const CACHE_CONSTANTS = {
  /** Admin storage cache expiry: 5 minutes */
  ADMIN_STORAGE_EXPIRY_MS: 5 * 60 * 1000,

  /** Data sync cache expiry: 2 minutes */
  DATA_SYNC_EXPIRY_MS: 2 * 60 * 1000,

  /** Offline connection check interval: 30 seconds */
  OFFLINE_CHECK_INTERVAL_MS: 30 * 1000,

  /** WebSocket reconnection delay: 5 seconds */
  WEBSOCKET_RECONNECT_DELAY_MS: 5 * 1000,

  /** Token refresh buffer: 5 minutes before expiry */
  TOKEN_REFRESH_BUFFER_MS: 5 * 60 * 1000,
} as const;

/**
 * UI timing constants
 */
export const UI_TIMING_CONSTANTS = {
  /** Notification auto-dismiss delay: 3 seconds */
  NOTIFICATION_DISMISS_MS: 3000,

  /** Animation/transition delay: 500ms */
  ANIMATION_DELAY_MS: 500,

  /** Debounce delay for search inputs: 300ms */
  SEARCH_DEBOUNCE_MS: 300,

  /** Delay before redirect after action: 1 second */
  REDIRECT_DELAY_MS: 1000,
} as const;

/**
 * Network timing constants
 */
export const NETWORK_TIMING_CONSTANTS = {
  /** Request timeout: 30 seconds */
  REQUEST_TIMEOUT_MS: 30 * 1000,

  /** Retry delay: 100ms */
  RETRY_DELAY_MS: 100,

  /** Auth guard delay: 300ms */
  AUTH_GUARD_DELAY_MS: 300,

  /** Resolver retry delay: 100ms */
  RESOLVER_RETRY_DELAY_MS: 100,
} as const;
