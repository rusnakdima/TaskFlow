/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnDestroy, signal } from "@angular/core";
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
import { Response, ResponseStatus } from "@models/response.model";
import { LoginForm } from "@models/index";
import { CheckboxField, TypeField } from "@models/form-field.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { DataSyncProvider } from "@providers/data-sync.provider";

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

@Component({
  selector: "app-login",
  standalone: true,
  providers: [AuthService],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    MatIconModule,
    CheckboxComponent,
  ],
  templateUrl: "./login.view.html",
})
export class LoginView implements OnDestroy {
  loginForm: FormGroup<any>;

  rememberField: CheckboxField = {
    name: "remember",
    label: "Remember me",
    type: TypeField.checkbox,
    isShow: () => true,
  };

  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  hasLocalUsers = signal(false);
  isShowPassword = signal(false);
  submitted = signal(false);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private notifyService: NotifyService,
    private dataSyncProvider: DataSyncProvider
  ) {
    this.loginForm = this.fb.group({
      username: ["", [Validators.required, Validators.pattern("[a-zA-Z0-9]*")]],
      password: ["", [Validators.required, Validators.minLength(6)]],
      remember: [false],
    });
  }

  ngOnInit() {
    this.keydownHandler = (e) => {
      if (e.key == "Enter") this.send();
    };
    document.addEventListener("keydown", this.keydownHandler);

    // Check if there are users in local JSON database
    this.checkLocalUsers();
  }

  ngOnDestroy() {
    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler);
    }
  }

  get f() {
    return this.loginForm.controls;
  }

  isInvalid(attr: string) {
    return (this.submitted() || this.f[attr].touched || this.f[attr].dirty) && this.f[attr].errors;
  }

  /**
   * Check if there are users in local JSON database
   */
  checkLocalUsers() {
    // Get all users and filter out deleted ones
    this.dataSyncProvider.crud<any[]>("getAll", "users", {}, true).subscribe({
      next: (users) => {
        // Filter out deleted users (isDeleted: false means active)
        const activeUsers = (users || []).filter((u) => !u.isDeleted);
        this.hasLocalUsers.set(activeUsers.length > 0);
      },
      error: (err) => {
        console.error('[LoginView] Failed to check local users:', err);
        this.hasLocalUsers.set(false);
      },
    });
  }

  async send() {
    this.submitted.set(true);

    if (this.loginForm.invalid) {
      Object.values(this.loginForm.controls).forEach((control: any) => {
        control.markAsTouched();
      });
      return;
    }

    if (this.loginForm.valid) {
      const authData: LoginForm = {
        username: this.f["username"].value,
        password: this.f["password"].value,
        remember: this.f["remember"].value,
      };

      try {
        // Use offline-first authentication (now returns a Promise)
        const result = await this.authService.loginWithOfflineFirst(authData);
        const { token, requiresDataSync, isOffline } = result;

        if (!token) {
          this.notifyService.showError("No authentication token available");
          this.submitted.set(false);
          return;
        }

        if (isOffline) {
          this.notifyService.showWarning("Working offline - some features limited");
        } else {
          this.notifyService.showSuccess("Login successful");
        }

        if (this.f["remember"].value) {
          localStorage.setItem("token", token);
        } else {
          sessionStorage.setItem("token", token);
        }

        setTimeout(() => {
          this.router.navigate(["/"]).then(() => {
            window.location.reload();
          });
        }, 500);
        this.submitted.set(false);
      } catch (err: any) {
        // Check error type
        const isNetworkError =
          err.message?.includes("NetworkError") ||
          err.message?.includes("network") ||
          err.message?.includes("offline") ||
          err.message?.includes("Failed to fetch") ||
          err.message?.includes("Server selection timeout") ||
          err.message?.includes("Connection refused") ||
          err.message?.includes("Database error");

        if (isNetworkError) {
          // Check if we have users in local database
          if (this.hasLocalUsers()) {
            // Have local users but something else went wrong
            this.notifyService.showError(
              "No internet connection. Using local database..."
            );
          } else {
            // No local users - need to login online first
            this.notifyService.showError(
              "⚠️ No internet connection AND no users in local database.\n\n" +
              "You must login/register ONLINE at least once.\n\n" +
              "Please connect to internet and try again."
            );
          }
        } else if (err.message?.includes("User data exists but no cached token")) {
          this.notifyService.showError(
            "User found locally but no cached token. Please login online to refresh your session."
          );
        } else {
          this.notifyService.showError(err.message ?? err.toString());
        }
        this.submitted.set(false);
      }
    } else {
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
