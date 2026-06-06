/* sys lib */
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { Component, signal, inject } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { RouterModule } from "@angular/router";

/* helpers */
import { emailValidator } from "@validators/auth.validators";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { AppButtonComponent } from "@components/shared/button/button.component";

@Component({
  selector: "app-reset-password",
  standalone: true,
  providers: [AuthService],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, AppButtonComponent],
  templateUrl: "./reset-password.view.html",
})
export class ResetPasswordView {
  resetForm: FormGroup;
  step = signal<"email" | "code">("email");
  userEmail = signal("");
  private router = inject(Router);

  constructor(
    private authService: AuthService,
    private notifyService: NotifyService
  ) {
    this.resetForm = new FormBuilder().group({
      email: ["", [Validators.required, Validators.email, emailValidator()]],
      code: ["", [Validators.required, Validators.pattern(/^\d{6}$/)]],
    });
  }

  ngOnInit() {}

  back() {
    this.router.navigate(["/login"]);
  }

  get f() {
    return this.resetForm.controls;
  }

  isInvalid(attr: string) {
    return (this.f[attr].touched || this.f[attr].dirty) && this.f[attr].errors;
  }

  onEmailSubmit() {
    if (this.resetForm.controls["email"].invalid) {
      this.resetForm.controls["email"].markAsTouched();
      return;
    }

    const email = this.resetForm.controls["email"].value;
    this.userEmail.set(email);

    this.authService.requestPasswordReset<string>(email).subscribe({
      next: () => {
        this.notifyService.showSuccess("Verification code sent");
        this.step.set("code");
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to send verification code";
        this.notifyService.showError(message);
      },
    });
  }

  onCodeSubmit() {
    if (this.resetForm.controls["code"].invalid) {
      this.resetForm.controls["code"].markAsTouched();
      return;
    }

    let email = this.userEmail;
    if (!email) {
      if (this.resetForm.controls["email"].invalid) {
        this.resetForm.controls["email"].markAsTouched();
        return;
      }
      email = this.resetForm.controls["email"].value;
    }

    const code = this.resetForm.controls["code"].value;

    this.authService.verifyCode<string>(email(), code).subscribe({
      next: () => {
        this.notifyService.showSuccess("Code verified");
        sessionStorage.setItem("resetPasswordEmail", email());
        sessionStorage.setItem("resetPasswordCode", code);

        this.router.navigate(["/change-password"]);
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to verify code";
        this.notifyService.showError(message);
      },
    });
  }

  skipToCode() {
    this.step.set("code");
    if (!this.userEmail() && this.resetForm.controls["email"].value) {
      this.userEmail.set(this.resetForm.controls["email"].value);
    }
  }

  backToEmail() {
    this.step.set("email");
    this.resetForm.controls["code"].setValue("");
    this.resetForm.controls["code"].markAsUntouched();
  }
}
