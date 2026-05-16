export interface PullToRefreshConfig {
  onRefresh: () => void | Promise<void>;
  threshold?: number;
  maxPullDistance?: number;
  disabled?: boolean;
}
