export interface ApiResponse<T> {
  status: "success" | "error";
  message: string;
  data: T;
}
export interface PaginationParams {
  offset?: number;
  limit?: number;
  sort?: string;
}
export interface FilterParams {
  field: string;
  operator: "eq" | "ne" | "gt" | "lt" | "contains";
  value: unknown;
}
export interface QueryParams {
  filter?: Record<string, unknown>;
  pagination?: PaginationParams;
  sort?: string;
  visibility?: string;
  load?: string[];
}
export interface DbChangeEvent<T = unknown> {
  operationType: "created" | "updated" | "deleted";
  data: T;
  collection: string;
}
export interface StorageTarget {
  targetDb: "local" | "cloud";
  visibility?: string;
}
export interface BulkOperationOptions {
  targetDb?: "local" | "cloud";
  visibility?: string;
  [key: string]: unknown;
}
export interface GithubRepo {
  id: string;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  fork: boolean;
  language: string | null;
  forks_count: number;
  stargazers_count: number;
  watchers_count: number;
  open_issues_count: number;
  default_branch: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
}
export interface GithubDeviceFlowResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}
export interface GithubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}
export interface TotpSetupResponse {
  qrCode: string;
  secret: string;
  recoveryCodes?: string[];
}
export interface QrCodeResponse {
  token: string;
  qrCode: string;
  expiresAt: number;
}
export interface Statistics {
  total_tasks: number;
  completion_rate: number;
  average_task_time: number;
  productivity_score: number;
  previous_total_tasks: number;
  previous_completion_rate: number;
  previous_average_time: number;
  previous_productivity_score: number;
}
export interface ChartData {
  completion_trend: Array<{ date: string; count: number }>;
  categories: Array<{ name: string; count: number }>;
  daily_activity: Array<{ date: string; score: number }>;
}
export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt?: string;
}
export interface DetailedMetric {
  name: string;
  current: string;
  previous: string;
  change: number;
}
export interface StatisticsResponse {
  statistics: Statistics;
  chart_data: ChartData;
  achievements: Achievement[];
  detailed_metrics: DetailedMetric[];
}
export interface CategoryStats {
  name: string;
  count: number;
  completed: number;
  percentage: number;
}
export interface UserProfile {
  id: string;
  user_id: string;
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}
export interface TableItem {
  id: string;
  title?: string;
  priority?: string;
  status?: string;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
  visibility?: string;
  [key: string]: unknown;
}
