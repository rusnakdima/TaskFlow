/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
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

/* components */
import { FormComponent } from "@components/form/form.component";

/* models */
import { FormField, TypeField } from "@models/form-field.model";
import { Profile } from "@models/profile.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { LocalAuthService } from "@services/auth/local-auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ApiProvider } from "@providers/api.provider";
import { StorageService } from "@services/core/storage.service";
import { ProfileRequiredService } from "@services/core/profile-required.service";

@Component({
  selector: "app-create-profile",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    MatIconModule,
    FormComponent,
  ],
  templateUrl: "./create-profile.view.html",
})
export class CreateProfileView implements OnInit {
  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService,
    private localAuthService: LocalAuthService,
    private dataSyncProvider: ApiProvider,
    private notifyService: NotifyService,
    private storageService: StorageService,
    private profileRequiredService: ProfileRequiredService
  ) {
    this.form = fb.group({
      _id: [""],
      id: [""],
      name: ["", Validators.required],
      last_name: ["", Validators.required],
      bio: [""],
      image_url: [""],
      user_id: ["", Validators.required],
    });
  }

  form: FormGroup;

  formFields: Array<FormField> = [
    {
      label: "Name",
      name: "name",
      type: TypeField.text,
      isShow: (param) => true,
    },
    {
      label: "Last Name",
      name: "last_name",
      type: TypeField.text,
      isShow: (param) => true,
    },
    {
      label: "Biography",
      name: "bio",
      type: TypeField.text,
      isShow: (param) => true,
    },
    {
      label: "Image Profile",
      name: "image_url",
      type: TypeField.image,
      isShow: (param) => true,
    },
  ];

  ngOnInit() {
    let userId = this.authService.getValueByKey("id");
    if (!userId || userId === "") {
      userId = localStorage.getItem("userId");
    }
    if (userId && userId !== "") {
      this.form.controls["user_id"].setValue(userId);

      const cachedProfile = this.storageService.profile();
      if (cachedProfile && cachedProfile.user_id === userId) {
        this.form.patchValue({
          name: cachedProfile.name ?? "",
          last_name: cachedProfile.last_name ?? "",
          bio: cachedProfile.bio ?? "",
          image_url: cachedProfile.image_url ?? "",
        });
      } else {
        const userProfileId = this.authService.getValueByKey("profile_id");
        if (userProfileId) {
          this.notifyService.showWarning("Profile already exists");
          this.router.navigate([""]);
          return;
        }
      }
    } else {
      this.notifyService.showError("User session not found. Please login again.");
      window.location.href = "/login";
    }
  }

  onSubmit() {
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach((control) => {
        control.markAsTouched();
      });
      return;
    }

    let userId = this.authService.getValueByKey("id");
    if (!userId || userId === "") {
      userId = localStorage.getItem("userId");
    }
    if (!userId || userId === "") {
      this.notifyService.showError("User session expired. Please login again.");
      window.location.href = "/login";
      return;
    }

    this.form.controls["userId"].setValue(userId);

    const body = this.form.value;
    this.dataSyncProvider.crud<Profile>("create", "profiles", { data: body }).subscribe({
      next: (createdProfile: Profile) => {
        if (createdProfile && createdProfile.id) {
          this.storageService.setCollection("profiles", createdProfile);

          const userId = this.authService.getValueByKey("id");
          if (userId) {
            this.localAuthService.updateUserProfileId(userId, createdProfile.id);
          }
        }
        this.profileRequiredService.setProfileRequiredMode(false);
        this.notifyService.showSuccess("Profile created successfully");
        this.router.navigate([""]);
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to create profile";
        this.notifyService.showError(message);
      },
    });
  }
}
