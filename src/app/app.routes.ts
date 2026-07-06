/* sys lib */
import { Routes } from "@angular/router";
/* guards */
import { canActivateAuth } from "@guards/auth.guard";

export const routes: Routes = [
  // Auth guard on root so all protected routes require auth
  {
    path: "",
    canActivate: [canActivateAuth],
    children: [
      // All protected routes redirect to dashboard (actual page is rendered by SchemaRouteViewer)
      { path: "", pathMatch: "full", redirectTo: "dashboard" },
      { path: "dashboard", redirectTo: "dashboard", pathMatch: "full" },
      { path: "stats", redirectTo: "stats", pathMatch: "full" },
      { path: "calendar", redirectTo: "calendar", pathMatch: "full" },
      { path: "chat", redirectTo: "chat", pathMatch: "full" },
      { path: "todos", redirectTo: "todos", pathMatch: "full" },
      { path: "settings", redirectTo: "settings", pathMatch: "full" },
      { path: "profile", redirectTo: "profile", pathMatch: "full" },
      { path: "sync", redirectTo: "sync", pathMatch: "full" },
      { path: "categories", redirectTo: "categories", pathMatch: "full" },
      { path: "archive", redirectTo: "archive", pathMatch: "full" },
      { path: "about", redirectTo: "about", pathMatch: "full" },
      { path: "admin", redirectTo: "data-management", pathMatch: "full" },
    ],
  },
  // Public auth routes
  { path: "login", redirectTo: "login", pathMatch: "full" },
  { path: "signup", redirectTo: "signup", pathMatch: "full" },
  { path: "reset-password", redirectTo: "reset-password", pathMatch: "full" },
  { path: "change-password", redirectTo: "change-password", pathMatch: "full" },
  { path: "login/qr", redirectTo: "qr-login", pathMatch: "full" },
  // Legacy redirect
  { path: "projects", redirectTo: "todos", pathMatch: "full" },
  // Catch-all → dashboard (schema router handles 404)
  { path: "**", redirectTo: "dashboard" },
];
