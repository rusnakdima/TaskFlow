/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnDestroy, signal, inject } from "@angular/core";
import {
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
  FormBuilder,
} from "@angular/forms";
import { Router, RouterModule } from "@angular/router";
/* materials */
import { MatIconModule } from "@angular/material/icon";
/* helpers */
import { TokenStorageHelper } from "@helpers/token-storage.helper";
import {
  minLengthValidator,
  passwordMismatchValidator,
  emailValidator,
} from "@validators/auth.validators";
/* models */
import { SignupForm, AuthResponse } from "@entities/auth-forms.model";
/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { AppButtonComponent } from "@components/shared/button/button.component";
@Component({
  selector: "app-signup",
  standalone: true,
  providers: [AuthService],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    MatIconModule,
    AppButtonComponent,
  ],
  templateUrl: "./signup.page.html",
})
export class SignupView implements OnDestroy {
  regForm: FormGroup<any>;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private router = inject(Router);
  constructor(
    private authService: AuthService,
    private notifyService: NotifyService
  ) {
    this.regForm = new FormBuilder().group({
      email: ["", [Validators.required, Validators.email, emailValidator()]],
      username: ["", [Validators.required, Validators.pattern("[a-zA-Z0-9]*")]],
      password: ["", [Validators.required, minLengthValidator(6)]],
      confirm_password: [
        "",
        [Validators.required, minLengthValidator(6), passwordMismatchValidator()],
      ],
    });
  }
  isShowPassword = signal(false);
  isShowConfirmPassword = signal(false);
  submitted = signal(false);
  ngOnInit() {
    this.keydownHandler = (e) => {
      if (e.key == "Enter") {
        this.send();
      }
    };
    document.addEventListener("keydown", this.keydownHandler);
  }
  ngOnDestroy() {
    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler);
    }
  }
  get f() {
    return this.regForm.controls;
  }
  isInvalid(attr: string) {
    return (this.submitted() || this.f[attr].touched || this.f[attr].dirty) && this.f[attr].errors;
  }
  async send() {
    this.submitted.set(true);
    if (this.regForm.invalid) {
      Object.values(this.regForm.controls).forEach((control) => {
        control.markAsTouched();
      });
      this.submitted.set(false);
      return;
    }
    const authData: SignupForm = {
      email: this.f["email"].value,
      username: this.f["username"].value,
      password: this.f["password"].value,
    };
    this.authService.signup<AuthResponse>(authData).subscribe({
      next: (authResponse) => {
        const token = authResponse.token;
        TokenStorageHelper.setToken(token, true);
        if (authResponse.needsProfile) {
          this.notifyService.showInfo("Please complete your profile setup");
          this.router.navigate(["/profile/manage"]);
        } else {
          this.notifyService.showSuccess("Registration successful");
          this.router.navigate(["/login"]);
        }
        this.submitted.set(false);
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Signup failed";
        this.notifyService.showError(message);
        this.submitted.set(false);
      },
    });
  }
}
