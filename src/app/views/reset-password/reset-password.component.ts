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
import { ResetPasswordService } from "@services/reset-password.service";
import { NotifyService } from "@services/notify.service";

/* models */
import { Response, ResponseStatus } from "@models/response";

@Component({
  selector: "app-reset-password",
  standalone: true,
  providers: [AuthService, ResetPasswordService],
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: "./reset-password.component.html",
})
export class ResetPasswordComponent {
  resetForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private location: Location,
    private authService: AuthService,
    private resetPasswordService: ResetPasswordService,
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

  onSubmit() {
    if (this.resetForm.invalid) {
      Object.values(this.resetForm.controls).forEach((control) => {
        control.markAsTouched();
      });
    }

    if (this.resetForm.valid) {
      this.resetPasswordService
        .sendRequest(this.resetForm.controls["email"].value)
        .then((response: Response) => {
          this.notifyService.showNotify(response.status, response.message);
          if (response.status == ResponseStatus.SUCCESS) {
            document.location.href = "/";
          }
        })
        .catch((err: Response) => {
          console.log(err);
          this.notifyService.showError(err.message);
        });
    }
  }
}
