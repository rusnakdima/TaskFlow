/* sys lib */
import { ActivatedRouteSnapshot, Routes } from "@angular/router";

/* reslver */
import { MainResolver } from "@resolvers/main.resolver";
import { InitialDataResolver } from "@resolvers/initial-data.resolver";

/* guards */
import { canActivateAuth } from "@guards/auth.guard";
import { canActivateCreateProfile } from "@guards/profile.guard";

/* components */
import { LoginView } from "@views/login/login.view";
import { SignupView } from "@views/signup/signup.view";
import { ChangePasswordView } from "@views/change-password/change-password.view";
import { ResetPasswordView } from "@views/reset-password/reset-password.view";

import { DashboardView } from "@views/dashboard/dashboard.view";
import { SharedTasksView } from "@views/shared-tasks/shared-tasks.view";
import { SyncView } from "@views/sync/sync.view";
import { CategoriesView } from "@views/categories/categories.view";
import { KanbanView } from "@views/kanban/kanban.view";

import { TodosView } from "@views/todos/todos.view";
import { TasksView } from "@views/tasks/tasks.view";
import { SubtasksView } from "@views/subtasks/subtasks.view";
import { ManageTodoView } from "@views/todos/manage-todo/manage-todo.view";
import { ManageTaskView } from "@views/tasks/manage-task/manage-task.view";
import { ManageSubtaskView } from "@views/subtasks/manage-subtask/manage-subtask.view";

import { ProfileView } from "@views/profile/profile.view";
import { CreateProfileView } from "@views/create-profile/create-profile.view";
import { EditProfileView } from "@views/edit-profile/edit-profile.view";
import { SettingsView } from "@views/settings/settings.view";

import { NotFoundView } from "@views/not-found/not-found.view";

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
        loadComponent: () => import("@views/stats/stats.view").then((m) => m.StatsView),
        title: "Statistic",
        data: { breadcrumb: "Statistic" },
      },
      {
        path: "calendar",
        loadComponent: () => import("@views/calendar/calendar.view").then((m) => m.CalendarView),
        title: "Calendar",
        data: { breadcrumb: "Calendar" },
      },
      {
        path: "shared-tasks",
        component: SharedTasksView,
        title: "Shared Projects",
        data: { breadcrumb: "Shared Projects" },
      },
      {
        path: "kanban",
        component: KanbanView,
        title: "Kanban Board",
        data: { breadcrumb: "Kanban" },
      },
      {
        path: "about",
        loadComponent: () => import("@views/about/about.view").then((m) => m.AboutView),
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
        loadComponent: () => import("@views/data-management/data-management.view").then((m) => m.DataManagementView),
        title: "Admin",
        data: { breadcrumb: "Admin", mode: "admin" },
      },
      {
        path: "archive",
        loadComponent: () => import("@views/data-management/data-management.view").then((m) => m.DataManagementView),
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
            path: "create-profile",
            component: CreateProfileView,
            title: "Create Profile",
            data: { breadcrumb: "Create Profile" },
            canActivate: [canActivateCreateProfile],
          },
          {
            path: "edit_profile",
            component: EditProfileView,
            title: "Create Profile",
            data: { breadcrumb: "Create Profile" },
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
            component: ManageTodoView,
            title: "Create Todo",
            data: { breadcrumb: "Create Todo" },
          },
          {
            path: ":todoId/edit_todo",
            component: ManageTodoView,
            title: "Edit Todo",
            data: { breadcrumb: "Edit Todo" },
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
            component: ManageTaskView,
            title: "Create Task",
            data: { breadcrumb: "Create Task" },
          },
          {
            path: ":todoId/tasks/:taskId/edit_task",
            component: ManageTaskView,
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
              task: MainResolver,
            },
          },
          {
            path: ":todoId/tasks/:taskId/subtasks/create_subtask",
            component: ManageSubtaskView,
            title: "Create Subtask",
            data: { breadcrumb: "Create Subtask" },
          },
          {
            path: ":todoId/tasks/:taskId/subtasks/:subtaskId/edit_subtask",
            component: ManageSubtaskView,
            title: "Edit Subtask",
            data: { breadcrumb: "Edit Subtask" },
          },
        ],
      },
    ],
  },

  // Public routes (no auth, no data resolver)
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

  {
    path: "**",
    component: NotFoundView,
    title: "404 — Not Found",
    data: { breadcrumb: "404 — Not Found" },
  },
];
