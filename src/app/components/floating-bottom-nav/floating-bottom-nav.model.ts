export interface FloatingNavItem {
  url: string;
  icon: string;
  label: string;
  query?: Record<string, string>;
  routeType?: "todos" | "profile";
  childRoutes?: NavRouteConfig[];
}

export interface NavRouteConfig {
  pattern: RegExp;
  icon: string;
  label: string;
}
