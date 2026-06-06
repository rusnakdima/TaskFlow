import {
  Component,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  DestroyRef,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
} from "@angular/forms";
import { Router, RouterModule } from "@angular/router";

import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatButtonModule } from "@angular/material/button";

import { LoginForm } from "@models/auth-forms.model";
import { CheckboxField, TypeField } from "@models/form-field.model";
import { minLengthValidator } from "@validators/auth.validators";

import { AuthService } from "@services/auth/auth.service";
import { SecurityService } from "@services/auth/security.service";
import { NotifyService } from "@services/notifications/notify.service";

import { ApiService } from "@services/api.service";
import { ThemeService } from "@services/ui/theme.service";

import { NetworkErrorHelper } from "@helpers/network-error.helper";
import { LoginCompletionHelper } from "@helpers/login-completion.helper";
import { LoginErrorHelper } from "@helpers/login-error.helper";

import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { ConnectionStatusComponent } from "@components/connection-status/connection-status.component";
import { AppButtonComponent } from "@components/shared/button/button.component";

@Component({
  selector: "app-login",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AuthService, SecurityService],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    CheckboxComponent,
    ConnectionStatusComponent,
    AppButtonComponent,
  ],
  templateUrl: "./login.view.html",
})
export class LoginView implements OnDestroy {
  loginForm!: FormGroup<any>;
  private router = inject(Router);
  private apiService = inject(ApiService);
  private destroyRef = inject(DestroyRef);

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
  isDarkTheme = computed(() => this.themeService.getEffectiveMode() === "dark");

  showTotpInput = signal(false);
  totpCode = signal("");

  readonly showQrLoginButton = signal(true);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    public securityService: SecurityService,
    private notifyService: NotifyService,
    private themeService: ThemeService
  ) {
    this.loginForm = this.fb.group({
      username: ["", [Validators.required, Validators.pattern("[a-zA-Z0-9]*")]],
      password: ["", [Validators.required, minLengthValidator(6)]],
      remember: [false],
    });
  }

  ngOnInit() {
    this.keydownHandler = (e) => {
      if (e.key == "Enter") this.send();
    };
    document.addEventListener("keydown", this.keydownHandler);

    this.checkDatabaseConnection();
  }

  checkDatabaseConnection() {
    const sub = this.apiService.users.getAll({ visibility: "private" }).subscribe({
      next: (users) => {
        const activeUsers = (users || []).filter((u: any) => !u.deleted_at);
        this.hasLocalUsers.set(activeUsers.length > 0);
      },
      error: (err) => {
        this.hasLocalUsers.set(false);

        if (NetworkErrorHelper.isNetworkError(err)) {
          this.notifyService.showWarning(
            "Cannot connect to database. Please check:\n" +
              "1. MongoDB server is running\n" +
              "2. Connection string in .env is correct\n" +
              "3. Network/firewall allows connection\n\n" +
              "Check terminal for detailed error message."
          );
        }
      },
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  ngOnDestroy() {
    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler);
    }
  }

  toggleTheme() {
    this.themeService.toggleMode();
  }

  get f() {
    return this.loginForm.controls;
  }

  isInvalid(attr: string) {
    return (this.submitted() || this.f[attr].touched || this.f[attr].dirty) && this.f[attr].errors;
  }

  async send() {
    this.submitted.set(true);

    if (this.loginForm.invalid) {
      Object.values(this.loginForm.controls).forEach((control: AbstractControl) => {
        control.markAsTouched();
      });
      this.submitted.set(false);
      return;
    }

    const authData: LoginForm = {
      username: this.f["username"].value,
      password: this.f["password"].value,
      remember: this.f["remember"].value,
    };

    try {
      const result = await this.authService.loginWithOfflineFirst(authData);
      const { token, isOffline } = result;

      if (!token) {
        this.notifyService.showError("No authentication token available");
        this.submitted.set(false);
        return;
      }

      LoginCompletionHelper.completeLogin(
        {
          token,
          remember: this.f["remember"].value,
        },
        this.router
      );

      if (isOffline) {
        this.notifyService.showWarning("Working offline - some features limited");
      } else {
        this.notifyService.showSuccess("Login successful");
      }
    } catch (err: unknown) {
      LoginErrorHelper.handleAuthError(err, this.notifyService, this.hasLocalUsers());
      this.submitted.set(false);
    }
  }

  async verifyTotpAndLogin(): Promise<void> {
    const code = this.totpCode();
    if (code.length !== 6) {
      this.notifyService.showError("Please enter a 6-digit TOTP code");
      return;
    }

    const username = this.f["username"].value;

    try {
      await new Promise<void>((resolve, reject) => {
        this.securityService.completeTotpLogin(username, code).subscribe({
          next: (authResponse) => {
            LoginCompletionHelper.completeLogin(
              {
                token: authResponse.token,
                remember: this.f["remember"].value,
              },
              this.router
            );
            resolve();
          },
          error: (err) => reject(err),
        });
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid TOTP code";
      this.notifyService.showError("Invalid TOTP code: " + message);
    }
  }

  goToQrLogin(): void {
    this.router.navigate(["/login/qr"]);
  }
}
