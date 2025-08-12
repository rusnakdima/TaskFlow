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
import { ActivatedRoute } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";

/* models */
import { Response, ResponseStatus } from "@models/response";

@Component({
  selector: "app-change-password",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  providers: [AuthService],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule],
  templateUrl: "./change-password.component.html",
})
export class ChangePasswordComponent {
  resetForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private location: Location,
    private authService: AuthService,
    private notifyService: NotifyService
  ) {
    this.resetForm = fb.group({
      username: ["", Validators.required],
      password: ["", Validators.required],
      confirm_password: ["", [Validators.required, this.matchPasswords()]],
      token: ["", Validators.required],
    });
  }

  role: string = "";

  errorText: string = "";

  isShowPassword: boolean = false;
  isShowConfirmPassword: boolean = false;
  isExpired: boolean = true;

  ngOnInit() {
    this.route.queryParams.subscribe((param) => {
      if (param["username"] && param["token"]) {
        this.f["username"].setValue(param["username"]);
        this.f["token"].setValue(param["token"]);
        this.checkToken();
      }
    });

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

  checkToken() {
    this.authService
      .checkResetToken<string>({
        username: this.f["username"].value,
        token: this.f["token"].value,
      })
      .then((response: Response<string>) => {
        if (response.status == ResponseStatus.SUCCESS) {
          this.isExpired = false;
        } else {
          this.errorText = response.message;
        }
      })
      .catch((err: any) => {
        console.log(err);
        this.notifyService.showError(err.message ?? err.toString());
      });
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
    }

    if (this.resetForm.valid) {
      this.authService
        .changePassword<string>(this.resetForm.value)
        .then((response: Response<string>) => {
          this.notifyService.showNotify(response.status, response.message);
          if (response.status == ResponseStatus.SUCCESS) {
            document.location.href = "/login";
          }
        })
        .catch((err: any) => {
          console.log(err);
          this.notifyService.showError(err.message ?? err.toString());
        });
    }
  }
}
