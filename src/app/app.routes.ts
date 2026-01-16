/* sys lib */
import { ActivatedRouteSnapshot, Routes } from "@angular/router";

/* reslver */
import { MainResolver } from "@services/main.resolver";

/* guards */
import { canActivateAuth } from "@guards/auth.guard";

/* components */
import { LoginView } from "@views/login/login.view";
import { SignupView } from "@views/signup/signup.view";
import { ChangePasswordView } from "@views/change-password/change-password.view";
import { ResetPasswordView } from "@views/reset-password/reset-password.view";

import { DashboardView } from "@views/dashboard/dashboard.view";
import { CalendarView } from "@views/calendar/calendar.view";
import { SharedTasksView } from "@views/shared-tasks/shared-tasks.view";
import { StatsView } from "@views/stats/stats.view";
import { AboutView } from "@views/about/about.view";
import { SyncView } from "@views/sync/sync.view";
import { CategoriesView } from "@views/categories/categories.view";

import { TodosView } from "@views/todos/todos.view";
import { TasksView } from "@views/tasks/tasks.view";
import { SubtasksView } from "@views/subtasks/subtasks.view";
import { ManageTodoView } from "@views/todos/manage-todo/manage-todo.view";
import { ManageTaskView } from "@views/tasks/manage-task/manage-task.view";
import { ManageSubtaskView } from "@views/subtasks/manage-subtask/manage-subtask.view";

import { ProfileView } from "@views/profile/profile.view";
import { CreateProfileView } from "@views/create-profile/create-profile.view";
import { EditProfileView } from "@views/edit-profile/edit-profile.view";

import { NotFoundView } from "@views/not-found/not-found.view";
import { AdminView } from "@views/admin/admin.view";

export const routes: Routes = [
  { path: "", pathMatch: "full", redirectTo: "dashboard" },
  {
    path: "dashboard",
    component: DashboardView,
    title: "Dashboard",
    data: { breadcrumb: "Dashboard" },
    canActivate: [canActivateAuth],
  },
  {
    path: "Statistic",
    component: StatsView,
    title: "Statistic",
    data: { breadcrumb: "Statistic" },
    canActivate: [canActivateAuth],
  },
  {
    path: "calendar",
    component: CalendarView,
    title: "Calendar",
    data: { breadcrumb: "Calendar" },
    canActivate: [canActivateAuth],
  },
  {
    path: "shared-tasks",
    component: SharedTasksView,
    title: "Shared Projects",
    data: { breadcrumb: "Shared Projects" },
    canActivate: [canActivateAuth],
  },

  {
    path: "about",
    component: AboutView,
    title: "About",
    data: { breadcrumb: "About" },
    canActivate: [canActivateAuth],
  },
  {
    path: "sync",
    component: SyncView,
    title: "Data Synchronization",
    data: { breadcrumb: "Sync" },
    canActivate: [canActivateAuth],
  },
  {
    path: "categories",
    component: CategoriesView,
    title: "Categories",
    data: { breadcrumb: "Categories" },
    canActivate: [canActivateAuth],
  },

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
    path: "profile",
    title: "Profile",
    data: { breadcrumb: "Profile" },
    canActivate: [canActivateAuth],
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
    canActivate: [canActivateAuth],
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
        canActivate: [canActivateAuth],
      },
      {
        path: ":todoId/edit_todo",
        component: ManageTodoView,
        title: "Edit Todo",
        data: { breadcrumb: "Edit Todo" },
        canActivate: [canActivateAuth],
      },
      {
        path: ":todoId/tasks",
        component: TasksView,
        title: "Tasks",
        data: { breadcrumb: async (route: ActivatedRouteSnapshot) => route.data },
        resolve: {
          todo: MainResolver,
        },
        canActivate: [canActivateAuth],
      },
      {
        path: ":todoId/tasks/create_task",
        component: ManageTaskView,
        title: "Create Task",
        data: { breadcrumb: "Create Task" },
        canActivate: [canActivateAuth],
      },
      {
        path: ":todoId/tasks/:taskId/edit_task",
        component: ManageTaskView,
        title: "Edit Task",
        data: { breadcrumb: "Edit Task" },
        canActivate: [canActivateAuth],
      },
      {
        path: ":todoId/tasks/:taskId/subtasks",
        component: SubtasksView,
        title: "Task",
        data: { breadcrumb: async (route: ActivatedRouteSnapshot) => route.data },
        resolve: {
          task: MainResolver,
        },
        canActivate: [canActivateAuth],
      },
      {
        path: ":todoId/tasks/:taskId/subtasks/create_subtask",
        component: ManageSubtaskView,
        title: "Create Subtask",
        data: { breadcrumb: "Create Subtask" },
        canActivate: [canActivateAuth],
      },
      {
        path: ":todoId/tasks/:taskId/subtasks/:subtaskId/edit_subtask",
        component: ManageSubtaskView,
        title: "Edit Subtask",
        data: { breadcrumb: "Edit Subtask" },
        canActivate: [canActivateAuth],
      },
    ],
  },

  {
    path: "**",
    component: NotFoundView,
    title: "404 — Not Found",
    data: { breadcrumb: "404 — Not Found" },
  },
];
