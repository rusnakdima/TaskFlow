/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, signal } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { LoginForm } from "@models/login-form.model";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";

@Component({
  selector: "app-login",
  standalone: true,
  providers: [AuthService],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, MatIconModule],
  templateUrl: "./login.view.html",
})
export class LoginView {
  loginForm: FormGroup<any>;
  isLoading = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private notifyService: NotifyService
  ) {
    this.loginForm = this.fb.group({
      username: ["", [Validators.required, Validators.pattern("[a-zA-Z0-9]*")]],
      password: ["", [Validators.required, Validators.minLength(6)]],
      remember: [false],
    });
  }

  isShowPassword = signal(false);
  submitted = signal(false);

  ngOnInit() {
    document.addEventListener("keydown", (e) => {
      if (e.key == "Enter") this.send();
    });
  }

  get f() {
    return this.loginForm.controls;
  }

  isInvalid(attr: string) {
    return (this.submitted() || this.f[attr].touched || this.f[attr].dirty) && this.f[attr].errors;
  }

  async send() {
    this.submitted.set(true);

    if (this.loginForm.invalid) {
      Object.values(this.loginForm.controls).forEach((control: any) => {
        control.markAsTouched();
      });
      return;
    }

    if (this.loginForm.valid) {
      const authData: LoginForm = {
        username: this.f["username"].value,
        password: this.f["password"].value,
        remember: this.f["remember"].value,
      };
      await this.authService
        .login<string>(authData)
        .then((response: Response<string>) => {
          this.notifyService.showNotify(response.status, response.message);
          if (response.status == ResponseStatus.SUCCESS) {
            localStorage.setItem("token", response.data);
            setTimeout(() => {
              this.router.navigate(["/"]).then(() => {
                window.location.reload();
              });
            }, 500);
          }
          this.submitted.set(false);
        })
        .catch((err: any) => {
          this.notifyService.showError(err.message ?? err.toString());
          this.submitted.set(false);
        });
    } else {
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
