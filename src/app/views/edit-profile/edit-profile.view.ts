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
import { NotifyService } from "@services/notifications/notify.service";
import { ApiProvider } from "@providers/api.provider";
import { StorageService } from "@services/core/storage.service";
import { DataLoaderService } from "@services/data/data-loader.service";

@Component({
  selector: "app-edit-profile",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    MatIconModule,
    FormComponent,
  ],
  templateUrl: "./edit-profile.view.html",
})
export class EditProfileView {
  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService,
    private dataSyncProvider: ApiProvider,
    private notifyService: NotifyService,
    private storageService: StorageService,
    private dataSyncService: DataLoaderService
  ) {
    this.form = fb.group({
      _id: [""],
      id: [""],
      name: ["", Validators.required],
      lastName: ["", Validators.required],
      bio: [""],
      imageUrl: [""],
      userId: ["", Validators.required],
      created_at: [""],
      updated_at: [""],
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
      name: "lastName",
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
      name: "imageUrl",
      type: TypeField.image,
      isShow: (param) => true,
    },
  ];

  ngOnInit() {
    const userId = this.authService.getValueByKey("id");
    if (userId && userId != "") {
      this.form.controls["userId"].setValue(userId);

      // Use profile from storage first (loaded from JSON on init; works offline)
      const cachedProfile = this.storageService.profile();
      if (cachedProfile && cachedProfile.userId === userId) {
        this.form.patchValue(cachedProfile);
      } else {
        // Not in cache - try to load (e.g. first visit); on failure (e.g. offline) try cache again
        this.dataSyncService.loadProfile().subscribe({
          next: (profile) => {
            if (profile) {
              this.form.patchValue(profile);
            } else {
              const fallback = this.storageService.profile();
              if (fallback && fallback.userId === userId) this.form.patchValue(fallback);
            }
          },
          error: () => {
            const fallback = this.storageService.profile();
            if (fallback && fallback.userId === userId) {
              this.form.patchValue(fallback);
            } else {
              this.notifyService.showError("Could not load profile. You may be offline.");
            }
          },
        });
      }
    } else {
      this.router.navigate(["/login"]);
      this.notifyService.showError("You are not logged in");
    }
  }

  onSubmit() {
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach((control) => {
        control.markAsTouched();
      });
    }

    if (this.form.valid) {
      const body = this.form.value;
      this.dataSyncProvider
        .crud<Profile>("update", "profiles", { id: body.id, data: body })
        .subscribe({
          next: () => {
            this.notifyService.showSuccess("Profile updated successfully");
            this.router.navigate(["/profile"], { queryParams: { id: body.userId } });
          },
          error: (err: unknown) => {
            const message = err instanceof Error ? err.message : "Failed to update profile";
            this.notifyService.showError(message);
          },
        });
    } else {
      this.notifyService.showError("Error sending data! Enter the data in the field.");
    }
  }
}
