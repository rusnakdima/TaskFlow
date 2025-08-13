/* sys lib */
import { Routes } from "@angular/router";

/* components */
import { AboutComponent } from "@views/about/about.component";
import { LoginComponent } from "@views/login/login.component";
import { SignupComponent } from "@views/signup/signup.component";
import { ChangePasswordComponent } from "@views/change-password/change-password.component";
import { ResetPasswordComponent } from "@views/reset-password/reset-password.component";

import { DashboardComponent } from "@views/dashboard/dashboard.component";
import { StatsComponent } from "@views/stats/stats.component";

import { TodosComponent } from "@views/todos/todos.component";
import { TasksComponent } from "@views/tasks/tasks.component";
import { CreateTodoComponent } from "@views/todos/create-todo/create-todo.component";
import { CreateTaskComponent } from "@views/tasks/create-task/create-task.component";

import { ProfileComponent } from "@views/profile/profile.component";
import { CreateProfileComponent } from "@views/create-profile/create-profile.component";

import { NotFoundComponent } from "@views/not-found/not-found.component";

export const routes: Routes = [
  { path: "", pathMatch: "full", redirectTo: "dashboard" },
  {
    path: "dashboard",
    component: DashboardComponent,
    title: "Dashboard",
    data: { breadcrumbs: "Dashboard" },
  },
  {
    path: "Statistic",
    component: StatsComponent,
    title: "Statistic",
    data: { breadcrumbs: "Statistic" },
  },
  { path: "about", component: AboutComponent, title: "About", data: { breadcrumbs: "About" } },

  { path: "login", component: LoginComponent, title: "Login", data: { breadcrumbs: "Login" } },
  {
    path: "signup",
    component: SignupComponent,
    title: "Sign Up",
    data: { breadcrumbs: "Sign Up" },
  },
  {
    path: "reset_password",
    component: ResetPasswordComponent,
    title: "Reset Password",
    data: { breadcrumbs: "Reset Password" },
  },
  {
    path: "change_password",
    component: ChangePasswordComponent,
    title: "Change Password",
    data: { breadcrumbs: "Change Password" },
  },

  {
    path: "profile",
    component: ProfileComponent,
    title: "Profile",
    data: { breadcrumbs: "Profile" },
  },
  {
    path: "profile/create_profile",
    component: CreateProfileComponent,
    title: "Create Profile",
    data: { breadcrumbs: "Create Profile" },
  },

  {
    path: "todos",
    component: TodosComponent,
    title: "Todos",
    data: { breadcrumbs: "Todos" },
  },
  {
    path: "todos/create_todo",
    component: CreateTodoComponent,
    title: "Create Todo",
    data: { breadcrumbs: "Create Todo" },
  },
  {
    path: "todos/:todoId/tasks",
    component: TasksComponent,
    title: "Tasks",
    data: { breadcrumbs: "Tasks" },
  },
  {
    path: "todos/:todoId/tasks/create_task",
    component: CreateTaskComponent,
    title: "Create Task",
    data: { breadcrumbs: "Create Task" },
  },
  {
    path: "todos/:todoId/tasks/:taskId",
    component: TasksComponent,
    title: "Task",
    data: { breadcrumbs: "Task" },
  },

  {
    path: "**",
    component: NotFoundComponent,
    title: "404 — Not Found",
    data: { breadcrumbs: "404 — Not Found" },
  },
];
