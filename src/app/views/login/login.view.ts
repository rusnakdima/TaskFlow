/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnDestroy, signal } from "@angular/core";
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
import { CheckboxField, TypeField } from "@models/form-field.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

@Component({
  selector: "app-login",
  standalone: true,
  providers: [AuthService],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    MatIconModule,
    CheckboxComponent,
  ],
  templateUrl: "./login.view.html",
})
export class LoginView implements OnDestroy {
  loginForm: FormGroup<any>;

  rememberField: CheckboxField = {
    name: "remember",
    label: "Remember me",
    type: TypeField.checkbox,
    isShow: () => true,
  };

  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

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
    this.keydownHandler = (e) => {
      if (e.key == "Enter") this.send();
    };
    document.addEventListener("keydown", this.keydownHandler);
  }

  ngOnDestroy() {
    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler);
    }
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
      this.authService.login<string>(authData).subscribe({
        next: (token: string) => {
          this.notifyService.showSuccess("Login successful");
          if (this.f["remember"].value) {
            localStorage.setItem("token", token);
          } else {
            sessionStorage.setItem("token", token);
          }
          setTimeout(() => {
            this.router.navigate(["/"]).then(() => {
              window.location.reload();
            });
          }, 500);
          this.submitted.set(false);
        },
        error: (err: any) => {
          this.notifyService.showError(err.message ?? err.toString());
          this.submitted.set(false);
        },
      });
    } else {
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
