/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnDestroy, signal } from "@angular/core";
import {
  AbstractControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
  FormBuilder,
} from "@angular/forms";
import { RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* helpers */
import { Common } from "@helpers/common.helper";
import { TokenStorageHelper } from "@helpers/token-storage.helper";

/* models */
import { SignupForm, AuthResponse } from "@models/auth-forms.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";

@Component({
  selector: "app-signup",
  standalone: true,
  providers: [AuthService],
  imports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule, MatIconModule],
  templateUrl: "./signup.view.html",
})
export class SignupView implements OnDestroy {
  regForm: FormGroup<any>;

  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private authService: AuthService,
    private notifyService: NotifyService
  ) {
    this.regForm = new FormBuilder().group({
      email: ["", [Validators.required, Validators.email, this.emailValidator()]],
      username: ["", [Validators.required, Validators.pattern("[a-zA-Z0-9]*")]],
      password: ["", [Validators.required, Validators.minLength(6)]],
      confirm_password: ["", [Validators.required, Validators.minLength(6), this.checkPasswords()]],
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

  checkPasswords(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (this.regForm) {
        const password = this.regForm.controls["password"].value;
        const confirmPassword = control.value;
        if (password != confirmPassword) {
          return { passwordMismatch: true };
        }
      }
      return null;
    };
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
          window.location.href = "/profile/manage";
        } else {
          this.notifyService.showSuccess("Registration successful");
          window.location.href = "/login";
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
