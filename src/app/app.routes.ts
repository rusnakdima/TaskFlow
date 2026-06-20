/* sys lib */
import { ActivatedRouteSnapshot, Routes } from "@angular/router";
/* reslver */
import { MainResolver } from "@resolvers/main.resolver";
import { InitialDataResolver } from "@resolvers/initial-data.resolver";
/* guards */
import { canActivateAuth } from "@guards/auth.guard";
/* components */
import { LoginView } from "@pages/login/login.page";
import { QrLoginView } from "@pages/qr-login/qr-login.page";
import { SignupView } from "@pages/signup/signup.page";
import { ChangePasswordView } from "@pages/change-password/change-password.page";
import { ResetPasswordView } from "@pages/reset-password/reset-password.page";
import { DashboardView } from "@pages/dashboard/dashboard.page";
import { SyncView } from "@pages/sync/sync.page";
import { CategoriesView } from "@pages/categories/categories.page";
import { TodosView } from "@pages/todos/todos.page";
import { TasksView } from "@pages/tasks/tasks.page";
import { SubtasksViewComponent as SubtasksView } from "@pages/subtasks/subtasks.page";
import { ManageTodoPage } from "@pages/manage-todo/manage-todo.page";
import { ManageTaskPage } from "@pages/manage-task/manage-task.page";
import { ManageSubtaskPage } from "@pages/manage-subtask/manage-subtask.page";
import { ProfileView } from "@pages/profile/profile.page";
import { ManageProfileView } from "@pages/manage-profile/manage-profile.page";
import { SettingsView } from "@pages/settings/settings.page";
import { NotFoundView } from "@pages/not-found/not-found.page";
export const routes: Routes = [
  { path: "", pathMatch: "full", redirectTo: "dashboard" },
  // Parent route for all authenticated routes - ensures data is loaded first
  {
    path: "",
    canActivate: [canActivateAuth],
    resolve: { initData: InitialDataResolver },
    children: [
      {
        path: "dashboard",
        component: DashboardView,
        title: "Dashboard",
        data: { breadcrumb: "Dashboard" },
      },
      {
        path: "stats",
        loadComponent: () => import("@pages/stats/stats.page").then((m) => m.StatsView),
        title: "Statistic",
        data: { breadcrumb: "Statistic" },
      },
      {
        path: "calendar",
        loadComponent: () => import("@pages/calendar/calendar.page").then((m) => m.CalendarView),
        title: "Calendar",
        data: { breadcrumb: "Calendar" },
      },
      {
        path: "chat",
        loadComponent: () => import("@pages/chat/chat.page").then((m) => m.ChatView),
        title: "Chat",
        data: { breadcrumb: "Chat" },
      },
      {
        path: "about",
        loadComponent: () => import("@pages/about/about.page").then((m) => m.AboutView),
        title: "About",
        data: { breadcrumb: "About" },
      },
      {
        path: "sync",
        component: SyncView,
        title: "Data Synchronization",
        data: { breadcrumb: "Sync" },
      },
      {
        path: "categories",
        component: CategoriesView,
        title: "Categories",
        data: { breadcrumb: "Categories" },
      },
      {
        path: "admin",
        canActivate: [canActivateAuth],
        loadComponent: () =>
          import("@pages/data-management/data-management.page").then((m) => m.DataManagementView),
        title: "Admin",
        data: { breadcrumb: "Admin", mode: "admin", expectedRoles: ["admin"] },
      },
      {
        path: "archive",
        loadComponent: () =>
          import("@pages/data-management/data-management.page").then((m) => m.DataManagementView),
        title: "Archive",
        data: { breadcrumb: "Archive", mode: "archive" },
      },
      {
        path: "settings",
        component: SettingsView,
        title: "Settings",
        data: { breadcrumb: "Settings" },
      },
      {
        path: "profile",
        title: "Profile",
        data: { breadcrumb: "Profile" },
        children: [
          {
            path: "",
            component: ProfileView,
          },
          {
            path: "manage",
            component: ManageProfileView,
            title: "Manage Profile",
            data: { breadcrumb: "Manage Profile" },
          },
        ],
      },
      {
        path: "todos",
        title: "Projects",
        data: { breadcrumb: "Projects" },
        children: [
          {
            path: "",
            component: TodosView,
          },
          {
            path: "create_todo",
            component: ManageTodoPage,
            title: "Create Project",
            data: { breadcrumb: "Create Project" },
          },
          {
            path: ":todoId/edit_todo",
            component: ManageTodoPage,
            title: "Edit Project",
            data: { breadcrumb: "Edit Project" },
          },
          {
            path: ":todoId/tasks",
            component: TasksView,
            title: "Tasks",
            data: {
              breadcrumb: async (route: ActivatedRouteSnapshot) => route.data,
            },
            resolve: {
              todo: MainResolver,
            },
          },
          {
            path: ":todoId/tasks/create_task",
            component: ManageTaskPage,
            title: "Create Task",
            data: { breadcrumb: "Create Task" },
          },
          {
            path: ":todoId/tasks/:taskId/edit_task",
            component: ManageTaskPage,
            title: "Edit Task",
            data: { breadcrumb: "Edit Task" },
          },
          {
            path: ":todoId/tasks/:taskId/subtasks",
            component: SubtasksView,
            title: "Task",
            data: {
              breadcrumb: async (route: ActivatedRouteSnapshot) => route.data,
            },
            resolve: {
              todo: MainResolver,
              task: MainResolver,
            },
          },
          {
            path: ":todoId/tasks/:taskId/subtasks/create_subtask",
            component: ManageSubtaskPage,
            title: "Create Subtask",
            data: { breadcrumb: "Create Subtask" },
          },
          {
            path: ":todoId/tasks/:taskId/subtasks/:subtaskId/edit_subtask",
            component: ManageSubtaskPage,
            title: "Edit Subtask",
            data: { breadcrumb: "Edit Subtask" },
          },
        ],
      },
    ],
  },
  // Public routes (no auth, no data resolver)
  { path: "login/qr", component: QrLoginView, title: "QR Login", data: { breadcrumb: "QR Login" } },
  { path: "login", component: LoginView, title: "Login", data: { breadcrumb: "Login" } },
  {
    path: "signup",
    component: SignupView,
    title: "Sign Up",
    data: { breadcrumb: "Sign Up" },
  },
  {
    path: "reset-password",
    component: ResetPasswordView,
    title: "Reset Password",
    data: { breadcrumb: "Reset Password" },
  },
  {
    path: "change-password",
    component: ChangePasswordView,
    title: "Change Password",
    data: { breadcrumb: "Change Password" },
  },
  { path: "projects", redirectTo: "todos", pathMatch: "full" },
  {
    path: "**",
    component: NotFoundView,
    title: "404 — Not Found",
    data: { breadcrumb: "404 — Not Found" },
  },
];
