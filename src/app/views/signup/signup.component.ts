/* sys lib */
import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
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
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Response, ResponseStatus } from "@models/response";
import { SignupForm } from "@models/signup-form";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";

@Component({
  selector: "app-signup",
  standalone: true,
  providers: [AuthService],
  imports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule, MatIconModule],
  templateUrl: "./signup.component.html",
})
export class SignupComponent {
  regForm: FormGroup<any>;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService,
    private notifyService: NotifyService
  ) {
    this.regForm = fb.group({
      email: [
        "",
        [
          Validators.required,
          Validators.email,
          Validators.pattern(/^[a-zA-Z0-9._%+-]+@(gmail|yandex|outlook)\.[a-zA-Z]{2,}$/),
        ],
      ],
      username: ["", [Validators.required, Validators.pattern("[a-zA-Z0-9]*")]],
      password: ["", [Validators.required, Validators.minLength(6)]],
      confirm_password: ["", [Validators.required, Validators.minLength(6), this.checkPasswords()]],
    });
  }

  isShowPassword: boolean = false;
  isShowConfirmPassword: boolean = false;
  submitted: boolean = false;

  ngOnInit() {
    document.addEventListener("keydown", (e) => {
      if (e.key == "Enter") {
        this.send();
      }
    });
  }

  get f() {
    return this.regForm.controls;
  }

  isInvalid(attr: string) {
    return (this.submitted || this.f[attr].touched || this.f[attr].dirty) && this.f[attr].errors;
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

  async send() {
    this.submitted = true;

    if (this.regForm.invalid) {
      Object.values(this.regForm.controls).forEach((control) => {
        control.markAsTouched();
      });
    }

    if (this.regForm.valid) {
      const authData: SignupForm = {
        email: this.f["email"].value,
        username: this.f["username"].value,
        password: this.f["password"].value,
      };
      await this.authService
        .signup(authData)
        .then((response: Response) => {
          this.notifyService.showNotify(response.status, response.message);
          if (response.status == ResponseStatus.SUCCESS) {
            setTimeout(() => {
              this.router.navigate(["/login"]);
            }, 500);
          }
        })
        .catch((err: any) => {
          console.error(err);
          this.notifyService.showError(err.message);
        });
    } else {
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
