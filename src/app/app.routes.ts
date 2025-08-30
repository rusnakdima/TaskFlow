/* sys lib */
import { ActivatedRouteSnapshot, Routes } from "@angular/router";

/* reslver */
import { MainResolver } from "@services/main.resolver";

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
import { SubtasksComponent } from "@views/subtasks/subtasks.component";
import { ManageTodoComponent } from "@views/todos/manage-todo/manage-todo.component";
import { ManageTaskComponent } from "@views/tasks/manage-task/manage-task.component";

import { ProfileComponent } from "@views/profile/profile.component";
import { CreateProfileComponent } from "@views/create-profile/create-profile.component";
import { EditProfileComponent } from "@views/edit-profile/edit-profile.component";

import { NotFoundComponent } from "@views/not-found/not-found.component";
import { ManageSubtaskComponent } from "@views/subtasks/manage-subtask/manage-subtask.component";

export const routes: Routes = [
  { path: "", pathMatch: "full", redirectTo: "dashboard" },
  {
    path: "dashboard",
    component: DashboardComponent,
    title: "Dashboard",
    data: { breadcrumb: "Dashboard" },
  },
  {
    path: "Statistic",
    component: StatsComponent,
    title: "Statistic",
    data: { breadcrumb: "Statistic" },
  },
  { path: "about", component: AboutComponent, title: "About", data: { breadcrumb: "About" } },

  { path: "login", component: LoginComponent, title: "Login", data: { breadcrumb: "Login" } },
  {
    path: "signup",
    component: SignupComponent,
    title: "Sign Up",
    data: { breadcrumb: "Sign Up" },
  },
  {
    path: "reset_password",
    component: ResetPasswordComponent,
    title: "Reset Password",
    data: { breadcrumb: "Reset Password" },
  },
  {
    path: "change_password",
    component: ChangePasswordComponent,
    title: "Change Password",
    data: { breadcrumb: "Change Password" },
  },

  {
    path: "profile",
    title: "Profile",
    data: { breadcrumb: "Profile" },
    children: [
      {
        path: "",
        component: ProfileComponent,
      },
      {
        path: "create_profile",
        component: CreateProfileComponent,
        title: "Create Profile",
        data: { breadcrumb: "Create Profile" },
      },
      {
        path: "edit_profile",
        component: EditProfileComponent,
        title: "Create Profile",
        data: { breadcrumb: "Create Profile" },
      },
    ],
  },

  {
    path: "todos",
    title: "Todos",
    data: { breadcrumb: "Todos" },
    children: [
      {
        path: "",
        component: TodosComponent,
      },
      {
        path: "create_todo",
        component: ManageTodoComponent,
        title: "Create Todo",
        data: { breadcrumb: "Create Todo" },
      },
      {
        path: ":todoId/edit_todo",
        component: ManageTodoComponent,
        title: "Edit Todo",
        data: { breadcrumb: "Edit Todo" },
      },
      {
        path: ":todoId/tasks",
        title: "Tasks",
        data: { breadcrumb: async (route: ActivatedRouteSnapshot) => route.data },
        resolve: {
          todo: MainResolver,
        },
        children: [
          {
            path: "",
            component: TasksComponent,
          },
          {
            path: "create_task",
            component: ManageTaskComponent,
            title: "Create Task",
            data: { breadcrumb: "Create Task" },
          },
          {
            path: ":taskId/edit_task",
            component: ManageTaskComponent,
            title: "Edit Task",
            data: { breadcrumb: "Edit Task" },
          },
          {
            path: ":taskId/subtasks",
            title: "Task",
            data: { breadcrumb: async (route: ActivatedRouteSnapshot) => route.data },
            resolve: {
              task: MainResolver,
            },
            children: [
              {
                path: "",
                component: SubtasksComponent,
              },
              {
                path: "create_subtask",
                component: ManageSubtaskComponent,
                title: "Create Subtask",
                data: { breadcrumb: "Create Subtask" },
              },
              {
                path: ":subtaskId/edit_subtask",
                component: ManageSubtaskComponent,
                title: "Edit Subtask",
                data: { breadcrumb: "Edit Subtask" },
              },
            ],
          },
        ],
      },
    ],
  },

  {
    path: "**",
    component: NotFoundComponent,
    title: "404 — Not Found",
    data: { breadcrumb: "404 — Not Found" },
  },
];
