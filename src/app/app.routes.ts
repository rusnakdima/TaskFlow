/* sys lib */
import { Routes } from "@angular/router";

/* components */
import { AboutComponent } from "@views/about/about.component";
import { LoginComponent } from "@views/login/login.component";
import { SignupComponent } from "@views/signup/signup.component";
import { ChangePasswordComponent } from "@views/change-password/change-password.component";
import { ResetPasswordComponent } from "@views/reset-password/reset-password.component";

import { NotFoundComponent } from "@views/not-found/not-found.component";

export const routes: Routes = [
  { path: "", pathMatch: "full", redirectTo: "home" },
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
    data: { breadcrumb: "Reset Password" },
  },
  {
    path: "change_password",
    component: ChangePasswordComponent,
    title: "Change Password",
    data: { breadcrumb: "Change Password" },
  },

  {
    path: "**",
    component: NotFoundComponent,
    title: "404 — Not Found",
    data: { breadcrumbs: "404 — Not Found" },
  },
];
