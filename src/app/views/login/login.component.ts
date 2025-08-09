/* sys lib */
import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { Router, RouterModule } from "@angular/router";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Response, ResponseStatus } from "@models/response";
import { LoginForm } from "@models/login-form";

/* services */
import { AuthService } from "@services/auth.service";
import { NotifyService } from "@services/notify.service";

@Component({
  selector: "app-login",
  standalone: true,
  providers: [AuthService],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, MatIconModule],
  templateUrl: "./login.component.html",
})
export class LoginComponent {
  logForm: FormGroup<any>;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService,
    private notifyService: NotifyService
  ) {
    this.logForm = fb.group({
      username: ["", [Validators.required, Validators.pattern("[a-zA-Z0-9]*")]],
      password: ["", [Validators.required, Validators.minLength(6)]],
      remember: [false],
    });
  }

  isShowPassword: boolean = false;
  submitted: boolean = false;

  ngOnInit() {
    document.addEventListener("keydown", (e) => {
      if (e.key == "Enter") this.send();
    });
  }

  get f() {
    return this.logForm.controls;
  }

  isInvalid(attr: string) {
    return (this.submitted || this.f[attr].touched || this.f[attr].dirty) && this.f[attr].errors;
  }

  async send() {
    this.submitted = true;

    if (this.logForm.invalid) {
      Object.values(this.logForm.controls).forEach((control) => {
        control.markAsTouched();
      });
    }

    if (this.logForm.valid) {
      const authData: LoginForm = {
        username: this.f["username"].value,
        password: this.f["password"].value,
        remember: this.f["remember"].value,
      };
      await this.authService
        .login(authData)
        .then((response: Response) => {
          this.notifyService.showNotify(response.status, response.message);
          if (response.status == ResponseStatus.SUCCESS) {
            localStorage.setItem("token", response.data);
            setTimeout(() => {
              this.router.navigate(["/"]).then(() => {
                window.location.reload();
              });
            }, 500);
          }
        })
        .catch((err: Response) => {
          console.error(err);
          this.notifyService.showError(err.message);
        });
    } else {
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
