/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { Component, signal } from "@angular/core";
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

/* helpers */
import { Common } from "@helpers/common.helper";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";

@Component({
  selector: "app-reset-password",
  standalone: true,
  providers: [AuthService],
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: "./reset-password.view.html",
})
export class ResetPasswordView {
  resetForm: FormGroup;
  step = signal<"email" | "code">("email");
  userEmail = signal("");

  constructor(
    private fb: FormBuilder,
    private location: Location,
    private authService: AuthService,
    private notifyService: NotifyService
  ) {
    this.resetForm = fb.group({
      email: ["", [Validators.required, Validators.email, this.emailValidator()]],
      code: ["", [Validators.required, Validators.pattern(/^\d{6}$/)]],
    });
  }

  ngOnInit() {}

  back() {
    this.location.back();
  }

  get f() {
    return this.resetForm.controls;
  }

  isInvalid(attr: string) {
    return (this.f[attr].touched || this.f[attr].dirty) && this.f[attr].errors;
  }

  emailValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const email = control.value;
      if (email && !Common.isValidEmail(email)) {
        return { invalidEmail: true };
      }
      return null;
    };
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
      error: (err: any) => {
        this.notifyService.showError(err.message ?? err.toString());
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

        window.location.href = "/change-password";
      },
      error: (err: any) => {
        this.notifyService.showError(err.message ?? err.toString());
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
