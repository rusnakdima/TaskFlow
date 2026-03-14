/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { CUSTOM_ELEMENTS_SCHEMA, Component } from "@angular/core";
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from "@angular/forms";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";

/* models */
import { PasswordReset } from "@models/index";

@Component({
  selector: "app-change-password",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  providers: [AuthService],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule],
  templateUrl: "./change-password.view.html",
})
export class ChangePasswordView {
  resetForm: FormGroup;
  private userEmail: string = "";

  constructor(
    private fb: FormBuilder,
    private location: Location,
    private authService: AuthService,
    private notifyService: NotifyService
  ) {
    this.resetForm = fb.group({
      password: ["", [Validators.required, Validators.minLength(6)]],
      confirmPassword: ["", [Validators.required, this.matchPasswords()]],
    });
  }

  errorText: string = "";
  isVerified: boolean = false;

  isShowPassword: boolean = false;
  isShowConfirmPassword: boolean = false;

  ngOnInit() {
    this.userEmail = sessionStorage.getItem("resetPasswordEmail") || "";

    if (this.userEmail) {
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

  matchPasswords(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (this.resetForm) {
        const password = this.resetForm.controls["password"].value;
        const confirmPassword = control.value;

        if (password != confirmPassword) {
          return { passwordMismatch: true };
        }
      }
      return null;
    };
  }

  onSubmit() {
    if (this.resetForm.invalid) {
      Object.values(this.resetForm.controls).forEach((control) => {
        control.markAsTouched();
      });
      return;
    }

    if (this.resetForm.valid && this.userEmail) {
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
        error: (err: any) => {
          this.notifyService.showError(err.message ?? err.toString());
        },
      });
    }
  }
}
