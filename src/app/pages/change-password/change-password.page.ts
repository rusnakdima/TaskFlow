/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { CUSTOM_ELEMENTS_SCHEMA, Component } from "@angular/core";
import {
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
  FormBuilder,
} from "@angular/forms";
/* validators */
import { minLengthValidator, passwordMismatchValidator } from "@validators/auth.validators";
/* materials */
import { MatIconModule } from "@angular/material/icon";
/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
/* models */
import { PasswordReset } from "@entities/password-reset.model";
import { AppButtonComponent } from "@components/shared/button/button.component";
@Component({
  selector: "app-change-password",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  providers: [AuthService],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule, AppButtonComponent],
  templateUrl: "./change-password.page.html",
})
export class ChangePasswordView {
  resetForm: FormGroup;
  private userEmail: string = "";
  constructor(
    private location: Location,
    private authService: AuthService,
    private notifyService: NotifyService
  ) {
    this.resetForm = new FormBuilder().group({
      password: ["", [Validators.required, minLengthValidator(6)]],
      confirmPassword: ["", [Validators.required, passwordMismatchValidator()]],
    });
  }
  errorText: string = "";
  isVerified: boolean = false;
  isLoggedInUser: boolean = false;
  isShowPassword: boolean = false;
  isShowConfirmPassword: boolean = false;
  ngOnInit() {
    this.userEmail = sessionStorage.getItem("resetPasswordEmail") || "";
    this.isLoggedInUser = this.authService.isLoggedIn();
    if (this.isLoggedInUser) {
      this.isVerified = true;
    } else if (this.userEmail) {
      this.isVerified = true;
    } else {
      this.errorText = "No verified email found. Please restart the password reset process.";
      this.isVerified = false;
    }
  }
  back() {
    this.location.back();
  }
  get f() {
    return this.resetForm.controls;
  }
  isInvalid(attr: string) {
    return (this.f[attr].touched || this.f[attr].dirty) && this.f[attr].errors;
  }
  onSubmit() {
    if (this.resetForm.invalid) {
      Object.values(this.resetForm.controls).forEach((control) => {
        control.markAsTouched();
      });
      return;
    }
    if (this.isLoggedInUser) {
      this.changePasswordAsLoggedIn();
    } else if (this.userEmail) {
      this.resetPasswordAsGuest();
    }
  }
  private changePasswordAsLoggedIn() {
    this.authService.changePassword<string>(this.f["password"].value).subscribe({
      next: () => {
        this.notifyService.showSuccess("Password changed successfully");
        setTimeout(() => {
          this.authService.logoutAll();
        }, 1500);
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to change password";
        this.notifyService.showError(message);
      },
    });
  }
  private resetPasswordAsGuest() {
    const passwordReset: PasswordReset = {
      email: this.userEmail,
      code: sessionStorage.getItem("resetPasswordCode") || "",
      newPassword: this.f["password"].value,
    };
    this.authService.resetPassword<string>(passwordReset).subscribe({
      next: () => {
        this.notifyService.showSuccess("Password changed successfully");
        setTimeout(() => {
          sessionStorage.removeItem("resetPasswordEmail");
          sessionStorage.removeItem("resetPasswordCode");
          document.location.href = "/login";
        }, 1500);
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to change password";
        this.notifyService.showError(message);
      },
    });
  }
}
