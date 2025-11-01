/* sys lib */
import { CommonModule, Location } from "@angular/common";
import { Component } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";

/* models */
import { Response, ResponseStatus } from "@models/response";

@Component({
  selector: "app-reset-password",
  standalone: true,
  providers: [AuthService],
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: "./reset-password.view.html",
})
export class ResetPasswordView {
  resetForm: FormGroup;
  step: "email" | "code" = "email";
  userEmail: string = "";

  constructor(
    private fb: FormBuilder,
    private location: Location,
    private authService: AuthService,
    private notifyService: NotifyService
  ) {
    this.resetForm = fb.group({
      email: [
        "",
        [
          Validators.required,
          Validators.email,
          Validators.pattern(/^[a-zA-Z0-9._%+-]+@(gmail|yandex|outlook)\.[a-zA-Z]{2,}$/),
        ],
      ],
      code: ["", [Validators.required, Validators.pattern(/^\d{6}$/)]],
    });
  }

  role: string = "";

  ngOnInit() {
    this.role = this.authService.getValueByKey("role") ?? "player";
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

  onEmailSubmit() {
    if (this.resetForm.controls["email"].invalid) {
      this.resetForm.controls["email"].markAsTouched();
      return;
    }

    const email = this.resetForm.controls["email"].value;
    this.userEmail = email;

    this.authService
      .requestPasswordReset<string>(email)
      .then((response: Response<string>) => {
        this.notifyService.showNotify(response.status, response.message);
        if (response.status == ResponseStatus.SUCCESS) {
          this.step = "code";
          this.notifyService.showNotify(
            ResponseStatus.SUCCESS,
            "Check your email for the verification code"
          );
        }
      })
      .catch((err: any) => {
        this.notifyService.showError(err.message ?? err.toString());
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

    this.authService
      .verifyCode<string>(email, code)
      .then((response: Response<string>) => {
        this.notifyService.showNotify(response.status, response.message);
        if (response.status == ResponseStatus.SUCCESS) {
          sessionStorage.setItem("resetPasswordEmail", email);
          sessionStorage.setItem("resetPasswordCode", code);

          window.location.href = "/change-password";
        }
      })
      .catch((err: any) => {
        this.notifyService.showError(err.message ?? err.toString());
      });
  }

  skipToCode() {
    this.step = "code";
    if (!this.userEmail && this.resetForm.controls["email"].value) {
      this.userEmail = this.resetForm.controls["email"].value;
    }
  }

  backToEmail() {
    this.step = "email";
    this.resetForm.controls["code"].setValue("");
    this.resetForm.controls["code"].markAsUntouched();
  }
}
